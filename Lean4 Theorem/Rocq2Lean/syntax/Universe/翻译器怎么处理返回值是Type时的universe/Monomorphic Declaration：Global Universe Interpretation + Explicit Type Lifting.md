在 Rocq → Lean Translation 中，Monomorphic Declaration 的 Universe Levels 属于 Rocq 的 Global Universe Context，而不是每次引用时可以独立实例化的 Local Universe Parameters。

Monomorphic Definition 可能存在两个问题：
1. Universe Constraints：不同 Global Levels 之间存在约束，例如 `g1 ≤ g3`，但 Lean 的普通 Universe Parameters 不直接携带这些关系。
2. Universe Cumulativity：Rocq 允许一个低 Universe 的 Type 作为较高 Universe 的结果，而 Lean 不会自动进行这样的转换。
###  Rocq 中的例子：`monoMakeType`
考虑以下 Monomorphic Definition：
```coq
Universe g1 g2 g3.
Constraint g1 <= g3.
Constraint g2 <= g3.

Definition monoMakeType
    (A : Type@{g1})
    (B : Type@{g2}) : Type@{g3} :=
  (A * list B)%type.
```
这里 `monoMakeType` 接收两个类型 `A`、`B`，返回一个新类型 `A * list B`。

| Universe Level | 来源 | 作用 |
|---|---|---|
| `g1` | `A : Type@{g1}` | 输入类型 `A` 的 Universe |
| `g2` | `B : Type@{g2}` | 输入类型 `B` 的 Universe |
| `g3` | `: Type@{g3}` | 返回类型 `A * list B` 所属的 Universe |

由于 Body 是：
```coq
(A * list B)%type
```
它的最低结果 Universe Level 为：
$$
\max(g_1,g_2)
$$
而 Rocq 中已经建立了 Global Constraints：
$$
g_1\leq g_3,\qquad g_2\leq g_3
$$
因此：
$$
\max(g_1,g_2)\leq g_3
$$
Rocq 可以利用 Cumulativity，将 Body 当作 `Type@{g3}` 中的类型，即使 `g3` 严格高于 `g1` 和 `g2`。
- 需要注意，`g1`、`g2`、`g3` 是全局固定标识，但不一定对应具体的 Universe 数字。它们的相对关系由 Rocq 的 Global Universe Graph 决定。与 Polymorphic 不同，每次引用 `monoMakeType` 时不会重新实例化出独立的源 Universe Parameters。
### Step 1. R2S / R2F-c：处理 Global Universe Levels 和 Constraints
#### 1.1 R2S：为 Global Levels 创建 Metavariables
翻译器从 Exporter 的 Source IR 中读取 `monoMakeType` 的 Type AST、Body AST，以及 Global Universe Facts。
R2S 首先为当前 Declaration 使用的源 Global Levels 创建临时 Lean Level Metavariables：

| Rocq Global Level | Lean Metavariable |
|---|---|
| `g1` | `?g1` |
| `g2` | `?g2` |
| `g3` | `?g3` |

接下来，`trans` 使用这些映射分别翻译 Type AST 和 Body AST，再通过 Type Checking、Unification 和 `solveLevels` 求解。对于当前例子，翻译器需要处理：
```text
Declared Type:
  (A : Type ?g1) →
  (B : Type ?g2) →
  Type ?g3
  
Body:
  fun A B => A × List B
```
Body 的实际 Universe 是：
$$
\max(?g_1,?g_2)
$$
而声明要求返回 `Type ?g3`。
如果仅通过 Unification 将 `?g3` 固定为 `max(?g1,?g2)`，就可能损失 Rocq 原本允许 `g3` 更高的情况。因此，即使 Lean Kernel 能接受某种解，翻译器还需要检查 Source Universe Facts 和 Universe Generality。
#### 1.2 R2F-c：使用 Global Facts Interpretation
如果普通 R2S 路径无法成功翻译，项目可以尝试 R2F-c，将源 Global Universe Constraints 编码成 Lean Level Expressions。
对于当前例子：
$$
g_1\leq g_3,\qquad g_2\leq g_3
$$
可以构造：

$$
\boxed{
\begin{aligned}
I(g_1)&=a\\
I(g_2)&=b\\
I(g_3)&=\max(a,b,c)
\end{aligned}
}
$$

这里 `a`、`b`、`c` 是 Lean Universe Parameters，`I` 是对源 Global Levels 的 Interpretation。

这种表示有两个重要性质。

第一，始终满足源 Global Constraints。因为：

$$
a\leq\max(a,b,c)
$$

$$
b\leq\max(a,b,c)
$$

因此，无论 Lean Parameters 如何取值，源声明要求的 Universe Relations 都成立。

第二，保留源声明允许的不同 Universe 层级。假设某个满足源 Facts 的 Assignment 为：

$$
g_1=0,\quad g_2=1,\quad g_3=3
$$

只需选择：

$$
a=0,\quad b=1,\quad c=3
$$

就得到：

$$
I(g_3)=\max(0,1,3)=3
$$

因此，不需要强行令：

$$
g_3=\max(g_1,g_2)
$$

更一般地，对于任意满足源 Constraints 的 Assignment，都可以选择对应的 `a`、`b`、`c`，使 Interpretation 恢复原来的 Levels。
#### 1.3 Monomorphic 的 Global Interpretation 与 Polymorphic 有什么不同？
这两个机制在数学形式上非常相似，都可以使用 `max` 和 `succ` 编码 Universe Constraints，但源 Universe 的含义不同。
- Monomorphic：`g1`、`g2`、`g3` 是 Rocq Global Universe Levels。翻译器将它们符号化表示为 Lean Universe Parameters，并根据 Global Facts 检查目标 Interpretation。
- Polymorphic：`u`、`v`、`w` 是源 Declaration 自己的 Local Universe Parameters。每次引用时可以独立实例化，翻译器需要保留这些实例化的合法范围。
特别注意：Monomorphic 最终生成的 Lean Declaration 可能带有 Universe Parameters，但这不代表 Rocq 原来的 Monomorphic Constant 获得了独立实例化能力。这些参数用于构造能够被 Lean Kernel 检查的通用目标表示；源 Global Levels 的共享身份和引用关系仍需要通过 R3 Coherence 等检查来维护。
### Step 2. `PULift`：显式处理 Global Universe Cumulativity

即使 Step 1 已经通过 R2F-c 表达源 Constraints，Lean 仍然可能无法直接接受 Body。

根据刚才的 Interpretation：
$$
I(g_1)=a,\quad I(g_2)=b,\quad I(g_3)=\max(a,b,c)
$$
Lean 中：

```lean
A : Type a
B : Type b
```

Body：

```lean
A × List B
```

属于：

```lean
Type (max a b)
```

但 Declared Return Type 是：

```lean
Type (max (max a b) c)
```

Rocq 可以利用 Cumulativity 允许这种关系，而 Lean 不能自动将前者视为后者。

因此，项目的 Type Lifting 路径可以使用 `PULift`，将原本位于低 Universe 的 Type 显式包装到高 Universe。

#### 2.1 `PULift` 如何处理两个 Universe？

对于：

```lean
T : Sort lower
```

如果需要将它表示在更高的 `Sort upper` 中，可以使用：

```lean
PULift.{upper, lower} T
```

例如，当前 Body 的实际类型为：

```lean
A × List B : Type (max a b)
```

由于 Lean 中：

```lean
Type u = Sort (u + 1)
```

因此，Body 的完整 Sort Level 为：

$$
lower=\max(a+1,b+1)
$$

而声明要求的完整 Sort Level 为：

$$
upper=\max(a+1,b+1,c+1)
$$

所以可以构造：

```lean
PULift.{
  max (max (a + 1) (b + 1)) (c + 1),
  max (a + 1) (b + 1)
} (A × List B)
```

这里：
- `lower`：原 Body 实际所属的 Sort。
- `upper`：源 Declaration 要求的较高 Result Sort。
- `PULift`：将原 Body 包装为位于目标 Universe 的新类型。

`PULift` 不会让 `A × List B` 与包装后的 Type 变成 Definitionally Equal，但可以利用 `PULift.up` 和 `PULift.down` 建立元素之间的双向转换，并满足往返还原性质。

#### 2.2 最终 Lean Declaration
经过 Global Interpretation 和 Type Lifting 后，可以概念性地生成：
```lean
def monoMakeType.{a, b, c}
    (A : Type a)
    (B : Type b) :
    Type (max (max a b) c) :=
  PULift.{
    max (max (a + 1) (b + 1)) (c + 1),
    max (a + 1) (b + 1)
  } (A × List B)
```
这里为了便于理解，使用 Lean 原生 `List` 和 `Prod`。实际机械翻译通常使用项目已经生成的 Rocq Inductive 对应类型。
这个 Declaration 中有三个关键部分：

| 部分 | 作用 |
|---|---|
| `a`, `b`, `c` | 为源 Global Levels 提供符号化的 Lean 参数 |
| `Type (max (max a b) c)` | 保留源声明较高 Result Universe 的表达范围 |
| `PULift.{upper,lower}` | 让原本处于较低 Universe 的 Body 在目标 Universe 中合法表示 |

特别注意，Step 1 和 Step 2 并不能互相替代：
- R2F-c 解决 Universe Constraints，即不同 Levels 之间应该满足什么关系。
- `PULift` 解决 Universe Cumulativity，即如何将低 Universe 的 Body 表示在较高 Universe 中。

因此，即使 R2F-c 已经保证：

$$
\max(a,b)\leq\max(a,b,c)
$$

Lean 仍然需要显式的 Type Transport，才能在不降低 Declared Result Universe 的情况下接受 Body。

#### 2.3 `PULift` 是否必须使用？

并不是所有 Monomorphic Definitions 都需要 `PULift`。只有在 Body 的实际 Sort 与 Declared Result Sort 不匹配，并且当前特殊翻译路径适用时，才需要显式提升。

例如，许多普通 Monomorphic Definitions 通过 R2S 和 Unification 就能直接接受。

对于部分 Type-valued Definitions，项目还可以尝试 R2B-V，让返回 Sort 继承 Body 的实际 Sort。但这种做法会降低原本较高的 Result Sort，与 `PULift` 保留较高 Universe 的方式不同。

因此，R2B-V 和 Type Lifting 是两种不同的 Representation Strategies，不能混为一谈。

### Step 3. 验证 Global Universe Facts、Coherence 和 Type Lifting
完成翻译后，即使 Lean Kernel 接受最终 Declaration，也还需要检查目标的 Universe 表示是否符合源 Rocq Global Universe Context。
#### 3.1 Source Global Universe Facts
Exporter 会从 Rocq Native Universe Graph 中导出相关 Universe Relations，例如：
$$
g_1\leq g_3,\qquad g_2\leq g_3
$$
这些 Facts 不只是当前 Declaration 局部的 Constraints，还包含全局 Universe Graph 推导出的关系。
#### 3.2 Global Universe Interpretation Audit
假设 Translator 生成：
$$
I(g_1)=a,\quad I(g_2)=b,\quad I(g_3)=\max(a,b,c)
$$
Auditor 需要检查：
- Interpretation 是否满足源 Global Universe Facts。
- 不同源 Levels 是否被错误合并或提高。
- 目标 Level Expressions 是否具有正确的 Source Interpretation。
- 是否保留受支持规则要求的 Universe Generality。
对于 R2F-c，项目使用源 Native Facts 独立重算相应 Level Interpretation，而不是只相信 Translator 生成的结果。

#### 3.3 R3 Reference Coherence
这一点对 Monomorphic 特别重要。
假设 Rocq 中先定义：
```coq
Definition mono_id
    (A : Type@{g1}) (x : A) := x.
```
然后另一个 Definition 引用它：
```coq
Definition use_mono
    (A : Type@{g1}) (x : A) :=
  mono_id A x.
```
因为两个 Declarations 使用的是同一个 Rocq Global Level `g1`，所以它们在源 Universe Environment 中指向同一个 Level，而不是每次引用都创建一个新实例。

翻译到 Lean 后，虽然目标 Declarations 可能带 Universe Parameters，但这次引用使用的 Universe Argument 必须与源 `g1` 的解释一致。

因此，R3 会检查引用的 Universe Instance 是否符合源 Global Facts，以及共享 Levels 是否保持 Coherence。

例如，不能在没有合法依据的情况下，将引用中的 `g1` 任意提高到某个更大的 Lean Level，仅仅为了通过 Type Checking。

#### 3.4 Type Lifting Audit

对于：

```lean
PULift.{upper, lower} T
```

项目还需要检查：
- `upper` 是否对应源 Declaration 要求的 Result Sort。
- `lower` 是否对应翻译后 Body 的实际 Sort。
- `PULift` 是否插入在正确的 Binder Depth。
- 包装前的 Body 是否仍然符合源 AST 的机械翻译。
- 其他位置引入的 `PULift.up` / `PULift.down` 是否符合受支持的转换规则。

最后由 Lean Kernel 检查整个目标 Declaration 的 Type Correctness。

这里需要注意，Lean Kernel 只负责检查目标 Lean Declaration 本身；Global Facts、跨 Declaration Coherence 和 Source-to-Target Correspondence 仍然需要项目自己的验证与审计机制。

---

### 4. 项目中的真实例子：`unary_predicate`
在 Corelib 的 `RelationClasses.v` 中，存在以下 Definition：
```coq
Definition unary_predicate A :=
  predicate (A :: Tnil).
```
其中 `predicate` 是用于构造谓词类型的 Type Abbreviation。这个 Definition 返回的是一个 Type，因此也属于 Type-valued Definition。
在项目的 Monomorphic 翻译结果中，它涉及两个 Global Universe Levels，对应目标名称中的 `75` 和 `84`。
可以将其 Universe Interpretation 简化理解为：
$$
I(g_{75})=\max(u_{75},u_{84})
$$
$$
I(g_{84})=u_{84}
$$
因此，目标 Declaration 的 Type 为：
```lean
Type u84 → Type (max u75 u84)
```
这里省略了实际生成的较长 Universe Parameter Names。
#### 4.1 为什么需要 `max`？

`u84` 表示输入类型 `A` 的 Universe，而返回类型还涉及另一个 Global Universe Level `75`。

目标使用：

$$
\max(u_{75},u_{84})
$$

确保返回 Universe 不会低于输入 Universe，同时保留返回 Universe 更高的可能性。

#### 4.2 为什么还需要 `PULift`？

真实输出中的 Body 使用：

```lean
PULift.{
  (max u75 u84) + 1,
  u84 + 1
} (...)
```

这里：
- `u84 + 1` 是 Body 实际所属的完整 Sort Level。
- `(max u75 u84) + 1` 是目标 Declared Result Sort Level。
- `PULift` 将原 Body 包装到更高的 Result Universe。

因此，这个真实例子体现了 Monomorphic Global Universe Interpretation 和 Explicit Type Lifting 的组合：使用 `max` 处理 Global Level Relationships，再使用 `PULift` 处理 Body 与 Declared Result Sort 之间的 Cumulativity。

实际翻译的 Body 还包含已经机械翻译的 `arrows`、`Tlist` 等 Declarations，并非直接使用 Lean 原生 `List`。

对应源码：
- [RelationClasses.v — unary_predicate](https://github.com/jackooo-dddd/rocq-core/blob/main/results/corelib-complete/Corelib/Classes/RelationClasses.v)
- [RelationClasses.txt — Translated Lean Output](https://github.com/jackooo-dddd/rocq-core/blob/main/results/corelib-complete/Corelib/Classes/RelationClasses.txt)

### 5. Monomorphic 与 Polymorphic 的完整对比

| 处理阶段 | Monomorphic | Polymorphic |
|---|---|---|
| Universe 来源 | Global Universe Levels | Local Universe Parameters |
| 基础处理 | R2S 创建 Level Metavariables | R6 保留源 Universe Parameters |
| Constraints 来源 | Native Global Universe Facts | Declaration 的 Local Constraints |
| Constraints Interpretation | R2F-c | `polyUniverseInterpretation` |
| 使用的表达式 | `max`、`succ` | `max`、`succ` |
| Cumulativity | 必要时使用 `PULift` | 必要时使用 `PULift` |
| 每次源引用是否独立实例化 | No | Yes |
| 重点检查 | Global Facts、R3 Coherence、Generality | Local Constraints、Instance Preservation、Generality |

两者虽然都可能生成带 Universe Parameters 的 Lean Declarations，但源 Universe 的含义不同。

Monomorphic 的目标参数是对固定 Global Universe Context 的符号化表示，跨 Declaration 的共享关系必须保持一致；Polymorphic 的目标参数则对应源 Declaration 自身可以逐次实例化的 Universe Parameters。

### 6. 完整翻译流程

```text
Rocq Monomorphic Declaration
  ├── Type AST / Body AST
  ├── Global Universe Levels
  └── Native Global Universe Facts
                 │
                 ▼
Step 1. R2S
  ├── Global Levels → Level Metavariables
  ├── Recursive trans
  ├── Type Checking + Unification
  └── 尝试保留 Public Levels
                 │
                 ▼
如果普通翻译无法通过
                 │
                 ▼
R2F-c（可选）
  ├── 读取 Global Universe Facts
  ├── 构造 max / succ Level Expressions
  └── 保留合法的 Source Level Relations
                 │
                 ▼
Step 2. Explicit Type Lifting（必要时）
  ├── 计算 Body 的实际 Sort
  ├── 保留较高的 Declared Result Sort
  └── 使用 PULift 包装 Body
                 │
                 ▼
Step 3. Validation
  ├── Native Global Universe Facts
  ├── Universe Interpretation Audit
  ├── R3 Reference Coherence
  ├── Generality Checks
  ├── Type Lifting Audit
  └── Lean Kernel Checking
                 │
                 ▼
Lean Declaration + DeclResult
```

这里描述的是 Monomorphic Definition 中需要处理较高 Result Universe 时的一条特殊翻译路径，而不是所有 Monomorphic Constants 都必须执行的固定步骤。项目通常先尝试普通 R2S，再根据失败原因进入 R2F-c、Type Lifting 或其他受支持的 Retry Paths。

## 总结

Monomorphic Declaration 的 Universe Translation 可以归纳为三个核心问题：

1. R2S / R2F-c：将 Rocq Global Universe Levels 映射为 Lean Level Expressions，并保留 Native Global Universe Facts。
2. Explicit Type Lifting：当 Body 的实际 Universe 低于声明要求的 Universe 时，使用 `PULift` 显式表示这种 Cumulativity，而不是简单降低 Result Sort。
3. Independent Validation：检查 Global Facts、跨声明 Reference Coherence、Universe Generality 和 Lifting 是否正确。

对于 `monoMakeType`，核心转换可以概括为：

```text
Rocq:
  A : Type@{g1}
  B : Type@{g2}
  monoMakeType A B : Type@{g3}

Global Constraints:
  g1 ≤ g3
  g2 ≤ g3

Lean Interpretation:
  g1 ↦ a
  g2 ↦ b
  g3 ↦ max(a,b,c)

Original Body:
  A × List B

Translated Body:
  PULift.{upper,lower} (A × List B)
```

因此，Monomorphic 的处理并不是简单固定所有 Universe Levels，也不是将它们全部合并，而是使用受 Global Universe Facts 约束的符号化 Interpretation，并在必要时通过 `PULift` 保留原本的较高 Result Universe。

最关键的区别是：Monomorphic 需要保留 Global Levels 的共享身份和跨 Declaration Coherence；Polymorphic 则需要保留 Local Universe Parameters 的独立实例化能力。两者都可能需要显式处理 Rocq Cumulativity，但验证的 Universe 语义不同。

### 对应源码与文档

- [UNIVERSE_TRANSLATION.md — R2S、R2F-c、R3](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_TRANSLATION.md)
- [TYPE_LIFT.md — Explicit Cumulative Result Transport](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/TYPE_LIFT.md)
- [Emit.lean — Constant Translation](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean)
- [Translate.lean — Universe Interpretation](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)