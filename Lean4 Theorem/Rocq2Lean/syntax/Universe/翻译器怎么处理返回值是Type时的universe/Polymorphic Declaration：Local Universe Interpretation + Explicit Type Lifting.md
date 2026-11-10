在 Rocq → Lean Translation 中，Polymorphic Declaration 的 Universe Levels 是声明自身的参数，每次引用时都可以独立实例化。
但是，Rocq 和 Lean 在 Universe 机制上有两个重要区别：
1. Universe Constraints：Rocq 允许声明 Universe Parameters 之间的约束，例如 `u ≤ w`，而 Lean 的普通 Universe Parameters 不能直接附带这样的不等式约束。
2. Universe Cumulativity：Rocq 允许一个较低 Universe 的 Type 出现在需要较高 Universe 的位置，而 Lean 通常要求两侧的 Sort Definitionally Equal。
因此，翻译器需要分别解决两个问题：使用 Local Universe Interpretation 将源 Constraints 编码为 Lean Level Expressions，再在必要时使用 `PULift` 显式表示 Universe Cumulativity。
### Rocq 中的例子：`forall_def`
考虑项目中的真实 Definition：
```coq
Set Universe Polymorphism.

Section Example.
  Context {A : Type}.

  Definition forall_def (P : A -> Type) : Type :=
    forall x : A, P x.
End Example.
```
- 这里 `P : A -> Type` 是一个 Type Family：输入 `x : A`，返回一个类型 `P x`。而 `forall x : A, P x` 是一个 Dependent Function Type，它本身也是一个 Type。
Rocq Elaboration 后可以概念性地表示为：
```coq
forall_def@{u, v, w} :
  forall (A : Type@{u})
         (P : A -> Type@{v}),
    Type@{w}
```

| Universe Level | 来源 | 作用 |
|---|---|---|
| `u` | `A : Type` | 输入类型 `A` 所属的 Universe |
| `v` | `P : A -> Type` | `P x` 所属的 Universe |
| `w` | `forall_def ... : Type` | 整个返回类型所属的 Universe |

由于 Body 是 `forall x : A, P x`, 它的最低计算性 Universe Level 是：
$$
\max(u,v)
$$
因此，Rocq 可以建立约束：
$$
u \leq w,\qquad v \leq w
$$
这里的 `w` 不需要恰好等于 `max(u,v)`。由于 Rocq 支持 Universe Cumulativity，`w` 可以更高。例如 `u=0, v=1, w=3` 仍然满足这些约束。
接下来观察翻译器如何在 Lean 中保留这种行为。
### Step 1. R6：保留 Polymorphic Universe Parameters
翻译器首先从 `ConstantDecl.universes` 中读取 Polymorphic Declaration 的 Universe Parameters 和 Constraints。
```text
Universe Parameters:
  u, v, w

Constraints:
  u ≤ w
  v ≤ w
```
R6 将每个源 Polymorphic Universe Parameter 映射为 Lean Universe Parameter：

| Rocq Level | Lean Parameter |
|---|---|
| `u` | `v_0` |
| `v` | `v_1` |
| `w` | `v_2` |

这些是源 Declaration 自身的 Polymorphic Parameters，而不是 Monomorphic Global Levels，也不是等待固定到某个数值的普通 Metavariables。
因此，最初可以尝试直接翻译：
```lean
def forall_def.{u, v, w}
    (A : Type u)
    (P : A → Type v) : Type w :=
  ∀ x : A, P x
```
但这种直接翻译通常无法通过 Lean Kernel，因为：
```lean
Body : Type (max u v)

Declared Return Type : Type w
```
Rocq 只要求：
$$
\max(u,v)\leq w
$$
但 Lean 的普通 Universe Parameters `u`、`v`、`w` 是独立的，不能假定这个关系成立，也不能直接依靠 Type Cumulativity 将 Body 放入 `Type w`。
- 因此，R6 虽然保留了 Universe Parameters，但并没有自动解决源 Universe Constraints 和 Cumulativity。
如果直接翻译能够通过 Lean Kernel 和其他检查，就不需要额外处理；否则，翻译器可以进入后续的 Universe Interpretation 和 Type Lifting 路径。
### Step 2. `polyUniverseInterpretation`：用 `max` 表达 Local Universe Constraints
首先考虑如何在 Lean 中表达：
$$
u\leq w,\qquad v\leq w
$$
一种简单方式是令：
$$
w=\max(u,v)
$$
但这样会损失 Rocq 允许 `w > max(u,v)` 的情况。例如，合法的源实例：
$$
u=0,\quad v=1,\quad w=3
$$
就无法通过 `w=max(u,v)` 表示，因为它会强制 `w=1`。
因此，翻译器可以使用 `polyUniverseInterpretation`，引入独立的 Lean Parameters `a`、`b`、`c`，并构造：
$$
\boxed{
\begin{aligned}
I(u)&=a\\
I(v)&=b\\
I(w)&=\max(a,b,c)
\end{aligned}
}
$$
这里的 `I` 是从 Rocq Universe Levels 到 Lean Level Expressions 的 Interpretation。
#### 2.1 为什么这个 Interpretation 能保证源 Constraints？
因为对于任意 `a`、`b`、`c`：
$$
a\leq\max(a,b,c)
$$
$$
b\leq\max(a,b,c)
$$
因此，映射后的 Universe Levels 始终满足源约束：
$$
I(u)\leq I(w),\qquad I(v)\leq I(w)
$$
这意味着 Lean 不需要额外声明 `a ≤ c`、`b ≤ c` 等 Constraints，因为大小关系已经编码在 `max` Expression 中。
#### 2.2 为什么不会损失 Universe Generality？
假设源 Rocq 中存在一个合法实例：
$$
u=0,\quad v=1,\quad w=3
$$
选择目标 Lean Parameters：
$$
a=0,\quad b=1,\quad c=3
$$
得到：
$$
I(w)=\max(0,1,3)=3
$$
成功恢复源实例。
更一般地，对于任意满足源 Constraints 的 Universe Assignment，只需要选择：
$$
a=u,\qquad b=v,\qquad c=w
$$
就有：
$$
I(w)=\max(u,v,w)=w
$$
因此，这种 Interpretation 同时满足两个性质：
- Soundness：任意目标 Parameters 都会产生满足源 Universe Constraints 的 Levels。
- Generality：任意合法的源 Universe Assignment，都能由某个目标 Parameter Assignment 表示。
这也是为什么不能简单将 `u`、`v`、`w` 统一成同一个 Universe Level：那虽然可能解决 Lean Typing，却会不必要地缩小源声明允许的 Universe 范围。
#### 2.3 实际实现如何构造 Interpretation？

源码中的 `polyUniverseInterpretation` 并不是只针对 `forall_def` 手动写一条规则，而是根据 Polymorphic Declaration 的 Local Universe Constraint Graph 构造映射。

对于受支持的 Constraints：

$$
v_i+k\leq v_j
$$

翻译器会：
1. 将 Universe Parameters 作为 Graph Nodes。
2. 将 Universe Constraints 转换为带偏移量的 Directed Edges。
3. 计算可达路径的最大权重。
4. 使用 `max` 和 `succ` 构造每个源 Level 的 Interpretation。

例如，对于严格约束：

$$
u<v
$$

可以产生类似：

$$
I(u)=a,\qquad I(v)=\max(b,a+1)
$$

其中 `+1` 对应严格不等式。

项目实现使用 Maximum-weight Floyd Closure 构造这些 Expressions，Auditor 则使用独立的 Graph Algorithm 重新检查结果。

需要注意，当前实现只覆盖受支持的 Constraint Fragment，并不能任意处理所有 Rocq Universe Constraints。对于不能建立有效 Interpretation 的情况，翻译器不会直接假装约束不存在；它可以回退到普通 R6 参数表示并继续尝试 Kernel Checking，若最终仍无法验证，则报告失败。

### Step 3. `PULift`：显式处理 Universe Cumulativity

经过 Step 2，我们已经将源 Constraints 编码进 Lean Level Expressions，但仍然存在第二个问题：Body 的实际 Universe 低于声明要求的 Universe。

假设 Interpretation 为：

$$
I(u)=a,\quad I(v)=b,\quad I(w)=\max(a,b,c)
$$

那么 Lean 中有：

```lean
A : Type a
P : A → Type b
```

Body：

```lean
∀ x : A, P x
```

属于：

```lean
Type (max a b)
```

但 Declared Return Type 是：

```lean
Type (max (max a b) c)
```

Rocq 可以通过 Cumulativity 接受这样的 Body，但 Lean 无法直接将 `Type (max a b)` 当作更高的 `Type (max (max a b) c)`。

因此，翻译器使用 `PULift` 显式表示这种类型提升。

#### 3.1 `PULift` 是什么意思？

假设有一个类型：

```lean
T : Sort lower
```

而我们希望在更高的：

```lean
Sort upper
```

中表示它。

`PULift` 可以构造一个新的包装类型：

```lean
PULift.{upper, lower} T
```

当 Universe Levels 满足对应要求时，包装类型位于目标 Sort 中。

这与 Rocq 的隐式 Cumulativity 不同：`PULift T` 并不是原来的 `T`，而是一个显式包装后的 Lean Type。

但两者之间存在可验证的转换：

```lean
PULift.up   : T → PULift T
PULift.down : PULift T → T
```

并具有往返还原性质：

```lean
PULift.down (PULift.up x) = x
PULift.up (PULift.down y) = y
```

因此，虽然包装前后的类型不是 Definitionally Equal，但可以通过 `up` / `down` 在二者的值之间建立对应关系。

#### 3.2 在 `forall_def` 中，Upper 和 Lower 是多少？

假设：

```lean
A : Type a
P : A → Type b
```

那么 Body：

```lean
T := ∀ x : A, P x
```

具有：

```lean
T : Type (max a b)
```

需要特别注意，Lean 中：

```lean
Type u = Sort (u + 1)
```

因此，`T` 所属的完整 Sort Level 为：

$$
lower=\max(a+1,b+1)
$$

而声明要求的目标类型是：

```lean
Type (max (max a b) c)
```

对应的完整 Sort Level 为：

$$
upper=\max(a+1,b+1,c+1)
$$

因此，最终需要使用：

```lean
PULift.{upper, lower} T
```

即：

```lean
PULift.{
  max (max (a + 1) (b + 1)) (c + 1),
  max (a + 1) (b + 1)
} (∀ x : A, P x)
```

这里的 `+1` 只是 Lean `Type u` 与 `Sort (u+1)` 之间的层级转换，不是额外引入了新的 Universe Constraint。

#### 3.3 项目中真实的 Lean 输出

在当前项目中，`forall_def` 的翻译结果为：

```lean
def Rocq.Corelib.Classes.CMorphisms.forall_def.{v_0, v_1, v_2} :
    (A : Type v_0) →
    (A → Type v_1) →
    Type (max (max v_0 v_1) v_2) :=
  fun A P =>
    PULift.{
      max (max (v_0 + 1) (v_1 + 1)) (v_2 + 1),
      max (v_0 + 1) (v_1 + 1)
    } ((x : A) → P x)
```

可以拆成三个部分：

| 部分 | 含义 |
|---|---|
| `v_0`, `v_1`, `v_2` | 源 Polymorphic Universe Parameters 对应的目标参数 |
| `Type (max (max v_0 v_1) v_2)` | 保留源声明允许的较高 Result Universe |
| `PULift.{upper, lower}` | 将原来的 Dependent Function Type 包装到目标 Universe |

这里的 Body 原本是：

```lean
(x : A) → P x
```

翻译后变为：

```lean
PULift.{upper, lower} ((x : A) → P x)
```

特别注意，`forall_def` 返回的是一个 Type，因此这里的 `PULift` 是在包装整个 Dependent Function Type，而不是对某次函数调用的结果进行提升。

这意味着：
- 原来的函数类型仍然保存在 `PULift` 的 Type Argument 中。
- 目标结果处于声明要求的较高 Universe。
- 当下游 Declaration 需要使用该类型中的函数值时，可以通过 `PULift.up` / `PULift.down` 建立对应关系。

因此，PULift 解决的是“低 Universe 的 Type 如何显式表示在高 Universe 中”，而不是重新定义原来的函数计算逻辑。

#### 3.4 `polyUniverseInterpretation` 与 `PULift` 的区别

这两个操作解决的是不同的问题。

| | Local Universe Interpretation | `PULift` |
|---|---|---|
| 解决的问题 | Universe Constraints | Universe Cumulativity |
| 处理对象 | Universe Level Expressions | Type-valued Body |
| 主要方法 | `max`、`succ` | 显式 Type Wrapper |
| 保留的内容 | 合法 Universe Instances | 较低 Body 与较高 Result Universe 的对应关系 |
| 是否改变 Body 表示 | 改变 Level Interpretation | 在原 Body 外增加包装 |

最重要的是：Step 2 保证 Universe Levels 之间的大小关系成立，Step 3 才让低 Universe 的 Body 在高 Universe 的接口中具有合法的 Lean 表示。

两者在实现中并非必须同时出现。Type Transport 是独立于可选 Local Universe Interpretation 的处理；如果 Interpretation 不适用，仍可能使用普通 R6 参数尝试 Lifting 和 Kernel Checking。

### Step 4. Universe Constraints、Generality 和 Type Lifting Audit

经过 Interpretation 和 Lifting 后，Lean Declaration 可能已经通过 Kernel Checking，但项目还需要验证翻译是否符合源 Rocq Declaration 的 Universe 行为。

#### 4.1 Source Universe Constraints

Exporter 从 Rocq 导出 Polymorphic Universe Context，记录源 Parameters 和 Constraints。

之后的验证需要保证这些 Universe Facts 确实来自源环境，没有遗漏或引入不属于源 Declaration 的约束。

#### 4.2 Local Universe Interpretation Audit

对于：

$$
I(u)=a,\quad I(v)=b,\quad I(w)=\max(a,b,c)
$$

Auditor 需要独立验证：
- 所有 Interpretation 都满足原始 Universe Constraints。
- 没有错误合并原本独立的 Universe Parameters。
- 任意合法的源实例都能够通过目标 Parameters 恢复。
- 报告的 `poly_level_interp` 与独立重算的 Interpretation 一致。

项目通过独立算法重算 Constraint Graph，而不是直接相信 Translator 自己生成的 Level Expressions。

#### 4.3 Type Lifting Audit

对于：

```lean
PULift.{upper, lower} T
```

需要检查：
- `upper` 是否对应源 Declaration 要求的 Result Universe。
- `lower` 是否对应翻译后 Body 实际所属的 Sort。
- `PULift` 是否被插入在正确的位置。
- 原始 Body `T` 是否保持预期的机械翻译结构。
- 如果引入了额外的 `PULift.up` / `PULift.down`，是否对应允许的类型转换。

项目通过 `type_lift` 记录 Lifting 所处的 Binder Depth，并通过独立 Audit 和 Kernel Checking 验证这些转换。

#### 4.4 Lean Kernel 与下游引用检查

最后，Lean Kernel 需要检查最终声明是否对所有目标 Universe Parameter Assignments 合法。

例如：

```lean
forall_def.{a, b, c}
```

无论 `a`、`b`、`c` 如何实例化，整个 Declaration 都必须保持 Well-typed。

此外，下游 Declaration 如果引用了 `forall_def`，也必须使用兼容的 Universe Instances，以及必要的 `PULift` 转换。

需要区分：Lean Kernel Checking 证明目标 Declaration 在 Lean 中合法；Universe Audit 和 `PULift` 往返性质提供额外的源目标一致性证据，但并不单独构成整个 Rocq → Lean 翻译器的端到端语义保持定理。

### 完整翻译流程

```text
Rocq Polymorphic Declaration
  ├── Type AST / Body AST
  ├── Local Universe Parameters
  └── Local Universe Constraints
                 │
                 ▼
Step 1. R6
  ├── 保留源 Polymorphic Parameters
  ├── 建立 Lean Universe Parameters
  └── 尝试直接翻译
                 │
                 ▼
如果直接翻译无法通过
                 │
                 ▼
Step 2. Local Universe Interpretation（可选）
  ├── 读取 Source Constraint Graph
  ├── 构造 max / succ Expressions
  └── 保留合法 Universe Assignments
                 │
                 ▼
Step 3. Explicit Type Lifting（必要时）
  ├── 计算 Body 的实际 Sort
  ├── 保留 Declared Result Sort
  └── 使用 PULift 包装 Body
                 │
                 ▼
Step 4. Validation
  ├── Source Universe Constraints
  ├── Interpretation + Generality Audit
  ├── Type Lifting Audit
  ├── Lean Kernel Checking
  └── Downstream Reference Checks
                 │
                 ▼
Lean Declaration + DeclResult
```
### 与 Monomorphic Translation 的区别

| | Monomorphic | Polymorphic |
|---|---|---|
| 源 Universe | Global Universe Levels | Declaration-local Universe Parameters |
| 基础规则 | R2S | R6 |
| Universe Interpretation | R2F-c 等 Global Facts Interpretation | `polyUniverseInterpretation` |
| 每次引用能否独立实例化源 Level | No | Yes |
| 是否可能需要 Type Lifting | Yes | Yes |
| 必须验证 | Source Facts、Coherence、Generality | Local Constraints、Instances、Generality |

Monomorphic 的核心是处理源全局 Universe Levels，保证 Global Facts 和跨 Declaration 的引用一致性；Polymorphic 的核心则是处理当前 Declaration 自身的 Universe Parameters，保留每次引用时允许的合法实例化范围。

两者都可能因为 Rocq Cumulativity 与 Lean Typing 的差异而需要显式 Type Transport，但适用的 Universe Interpretation 和检查义务并不完全相同。

## 总结
Polymorphic Definition 的 Universe Translation 可以归纳为三个核心问题：
1. R6：保留源 Declaration 的 Universe Parameters，不把它们错误地固定为某个具体 Level。
2. Local Universe Interpretation：通过 `max` 和 `succ`，将源 Universe Constraints 编码为对任意 Lean Parameters 都成立的 Level Expressions，同时覆盖合法的源实例。
3. Explicit Type Lifting：通过 `PULift`，将原本处于较低 Universe 的 Type 显式包装到声明要求的较高 Universe，并用 `up` / `down` 建立对应关系。
对于 `forall_def`，最关键的转换是：
```text
Rocq:
  A : Type@{u}
  P : A → Type@{v}
  forall_def A P : Type@{w}

Constraints:
  u ≤ w
  v ≤ w

Lean Interpretation:
  u ↦ a
  v ↦ b
  w ↦ max(a,b,c)

Original Body:
  ∀ x : A, P x

Translated Body:
  PULift.{upper,lower} (∀ x : A, P x)
```
### 对应源码
- [TYPE_LIFT.md — Explicit Cumulative Result Transport](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/TYPE_LIFT.md)
- [Translate.lean — polyUniverseInterpretation](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean#L26-L103)
- [Emit.lean — Polymorphic Interpretation / Type Lifting](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean)
- [CMorphisms.v — forall_def](https://github.com/jackooo-dddd/rocq-core/blob/main/results/corelib-complete/Corelib/Classes/CMorphisms.v#L151-L156)
- [CMorphisms.txt — Translated Lean Declaration](https://github.com/jackooo-dddd/rocq-core/blob/main/results/corelib-complete/Corelib/Classes/CMorphisms.txt#L309-L311)