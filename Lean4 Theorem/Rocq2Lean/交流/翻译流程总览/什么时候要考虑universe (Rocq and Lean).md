- 在 Rocq → Lean 的 Constant Translation 中，Universe 问题主要出现在参数类型、返回类型、类型族、引用其他 Declarations，以及 Body 内部的类型表达式中。
- 翻译器的目标是确定每个 Universe Level 应该如何表示：保留为公开参数、与其他 Levels 统一、求解为 Level Expression，或者在满足源约束的情况下使用默认值。
### 0. 首先区分两种 Universe Level 的使用方式
Rocq 中的 Universe Level 不一定需要确定为具体数字，例如 `0`、`1` 或 `2`。它可以是符号化的 `u`，并通过 Universe Constraints 描述不同 Levels 之间的关系。
但需要进一步区分：这个 `u` 是 Monomorphic Declaration 使用的 Global Universe Level，还是 Polymorphic Declaration 中可以独立实例化的 Universe Parameter。
#### 0.1 Monomorphic：全局共享的 Universe Level
例如：
```
Definition id1 (A : Type) (x : A) : A := x.
```
概念上可以表示为：
```
id1 :
  forall (A : Type@{u}), A -> A
```
- Rocq 为 `Type` 创建一个 Global Universe Level `u`，不需要将其确定为具体数字。
- `u` 的身份在声明建立后是固定的，所有对 `id1` 的引用共享这个 Level，不能在每次调用时独立实例化。
- 由于 Rocq 支持 Universe Cumulativity，即使 `u` 处于较高层级，较低 Universe 的类型仍然可以作为参数传入。
因此，Monomorphic 的固定，指的是 Universe Level 在全局环境中共享，而不是必须固定为某个具体数值。
#### 0.2 Polymorphic：每次引用都可以实例化的 Universe Level
例如：
```
Polymorphic Definition id2
    (A : Type) (x : A) : A := x.
```
概念上可以表示为：
```
id2@{u} :
  forall (A : Type@{u}), A -> A
```
这里的 `u` 是 Universe Parameter，而不是 Monomorphic Declaration 中共享的 Global Level。
因此，不同调用可以独立实例化不同的 Universe Levels：
```
id2 nat 3
id2 Type nat
```
可以概念上理解为：
```
id2@{u1} nat 3
id2@{u2} Type nat
```
- `u1` 和 `u2` 是两次引用各自选择的 Universe Instances。
- 它们不需要相同，也不需要提前确定为具体数字。
- 每次实例化仍然必须满足原始 Declaration 的 Universe Constraints。
这里的 Universe 并不是在函数运行过程中动态改变，而是在每次引用 Polymorphic Constant 时，由 Rocq 的 Elaboration 选择对应的 Universe Instance。

因此，两者的核心区别在于：Monomorphic 使用共享的 Global Universe Levels，而 Polymorphic 允许每次引用独立实例化 Universe Parameters。两者都可以使用尚未确定具体数值的符号化 Levels。
#### 0.3 Rocq 和 Lean 的基本区别

| | Rocq | Lean |
|---|---|---|
| 未标注的 `Type` | 由 Elaboration 推断 Universe | `Type` 默认是 `Type 0` |
| Universe Polymorphism | 支持 | 支持 |
| Universe Cumulativity | 支持 | 不支持一般的 Type Cumulativity |
| Universe Constraints | 可以记录 `u ≤ v` 等关系 | 普通 Universe Parameters 不直接携带这种约束 |
| Universe Instantiation | 可显式指定，也可自动推断 | 可显式指定，也可自动推断 |

对于普通的 `Type` Universe，项目中的基本映射可以理解为：

$$
\mathrm{Type@}\{u\}
\longmapsto
\mathrm{Type}\ u'
=
\mathrm{Sort}(u'+1)
$$

其中 `u'` 是源 Level `u` 在 Lean 中的解释。对于 Template Inductive、Motive 等特殊情况，项目可能采用不同的 Sort Interpretation。

---
### 情况 1. 参数的类型是 `Type`
#### 1.1 Rocq 中
考虑一个 Polymorphic Definition：
```
Polymorphic Definition id
    (A : Type) (x : A) : A := x.
```
Rocq Elaboration 后，可以概念性地表示为：
```
id@{u} :
  forall (A : Type@{u}), A -> A
```
- `A : Type@{u}`：`A` 本身是一个类型，其 Universe Level 为 `u`。
- `x : A`：`x` 是 `A` 类型的值，不需要额外创建一个独立的 Universe Level。
- `: A`：返回值仍然属于 `A`，因此也不需要新的 Universe Level。
整个 Definition 主要涉及一个 Universe Parameter `u`。

如果去掉 `Polymorphic`：
```
Definition monoId (A : Type) (x : A) : A := x.
```
概念上：
```
monoId :
  forall (A : Type@{g}), A -> A
```
这里的 `g` 是 Monomorphic Declaration 使用的 Global Universe Level。它不一定是具体数字，但所有引用共享同一个 `g`，不能像 `id@{u}` 一样在每次调用时独立实例化。
#### 1.2 翻译到 Lean
**情况 A：Polymorphic Definition**
Lean 可以直接表示为：
```
def id.{u} (A : Type u) (x : A) : A := x
```
这里 `u` 是 Lean Universe Parameter，不需要在 Declaration 定义时确定具体值。
```
id.{0} Nat 3
id.{0} Bool true
```
这两个调用都使用 `Type 0`。如果传入更高 Universe 的类型，也可以使用对应的 Universe Instance。

**情况 B：Monomorphic Definition**
对于：
```
Definition monoId (A : Type) (x : A) : A := x.
```
翻译器需要为源 Global Level `g` 找到合适的 Lean Level Interpretation。
例如，如果源 Universe Constraints 允许将 `g` 解释为 Lean 的 `0`，可以生成：
```
def monoId (A : Type 0) (x : A) : A := x
```
但如果需要保留符号化的 Universe Level，翻译器也可能生成带参数的目标声明：
```
def monoId.{u} (A : Type u) (x : A) : A := x
```
需要注意：
- 源 Rocq 中的 `g` 仍然是 Global Universe Level。
- 目标 Lean 中的 `u` 是 Universe Parameter，用于表示翻译后选择的 Level。
- 这种目标表示不能直接理解为源 `monoId` 允许每次调用独立实例化。翻译器必须保持源 Global Level 在各个引用中的一致性，并验证相关 Universe Constraints。
还需要考虑 Rocq 的 Universe Cumulativity。 即使 Monomorphic Declaration 使用固定的 Global Universe Level `g`，Rocq 仍允许较低 Universe 的类型传入要求 `Type@{g}` 的参数。由于 Lean 不支持一般的 Type Cumulativity，翻译器不仅需要确定 `g` 的 Lean Level Interpretation，还需要在翻译其他 Declarations 对该 Constant 的引用时，处理不同 Universe Levels 之间的兼容性，例如在适当情况下使用 Level 调整或显式 Universe Lifting。
#### 1.3 翻译器需要解决什么？
对于 **Polymorphic Declaration**，项目中的 R6 会根据源 `UDecl` 建立 Lean Universe Parameters，并翻译相应的 Universe Instances。不同引用可以独立实例化，但必须满足源约束。
对于 **Monomorphic Declaration**，项目中的 R2S 路径可以为源 Global Level 创建临时 Metavariable，通过 Lean Type Checking 和 Universe 求解寻找合适的表示，再决定是否将其保留为目标 Lean Universe Parameter。
两者的区别并不只是最终 Lean 代码中是否出现 `.{u}`，而是：
- **Polymorphic：** Universe Parameter 本来就属于源 Declaration 的公开接口，每次引用允许独立实例化。
- **Monomorphic：** 源 Universe Level 属于共享的 Global Context。即使在 Lean 中使用参数化表示，也必须检查最终的 Level Interpretation 是否保留源 Universe Facts、引用一致性和必要的接口约束。
---
### 情况 2. 一个 Definition 有多个 `Type`
#### 2.1 Rocq 中
```coq
Polymorphic Definition first
    (A : Type) (B : Type)
    (x : A) (y : B) : A := x.
```
两个参数位置的 `Type` 可以拥有不同的 Universe Levels：
```coq
A : Type@{u}
B : Type@{v}
x : A
y : B
```
其中 `u` 决定 `A` 的 Universe，`v` 决定 `B` 的 Universe。只要 Declaration 的其他部分没有施加额外约束，就不需要强制 `u = v`。
#### 2.2 翻译到 Lean
```lean
def first.{u, v}
    (A : Type u) (B : Type v)
    (x : A) (y : B) : A := x
```
Lean 支持多个独立的 Universe Parameters，因此可以直接保留 `u` 和 `v`。
例如，`A` 可以处于 `Type 0`，而 `B` 处于 `Type 1`，两者不需要相同。
#### 2.3 翻译器需要解决什么？
翻译器需要判断源声明中的不同 Universe Levels 是否具有必须保留的独立性。
对于独立的 `u` 和 `v`，不能仅仅为了使 Lean Kernel 接受声明，就强行令：
$$
u=v
$$
因为这会限制原本允许使用不同 Universe Levels 的源 Declaration，导致 Universe Generality 的损失。因此，Type Checking 成功只是第一步，最终还需要检查 Source Universe Constraints 和目标声明的一般性。

---
### 情况 3. Definition 的返回值是 `Type`
这一类比前面的 `id` 和 `first` 更复杂，因为除了输入参数的 Universe，还需要考虑返回类型所在的 Universe。这种情况既可以是 Polymorphic，也可以是 Monomorphic。
#### 3.1 Rocq 中
考虑一个接收两个类型、返回新类型的 Definition：
```
Polymorphic Definition makeType
    (A : Type) (B : Type) : Type :=
  (A * list B)%type.
```
例如：
```
makeType nat bool
```
返回的是一个新类型：
```
nat * list bool
```
而不是该类型中的某个具体 Value。

**情况 A：Polymorphic Definition**
为了分析 Universe，可以先将源码中的三个 `Type` 分别标记为：
```
makeType@{u v w} :
  forall (A : Type@{u})
         (B : Type@{v}),
    Type@{w}
```

|Level|来源|作用|
|---|---|---|
|`u`|`(A : Type)`|输入类型 `A` 所属的 Universe|
|`v`|`(B : Type)`|输入类型 `B` 所属的 Universe|
|`w`|`: Type`|返回类型 `A * list B` 所属的 Universe|

由于 Body 返回的是：
```
(A * list B)%type
```
其最低结果层级由 `A` 和 `list B` 的层级决定。对于通常的 Type 层级，Rocq 可以建立：
$$  
u \leq w,\qquad v \leq w  
$$
因此，`w` 可以高于 `u` 和 `v`，不一定要求：
$$  
w=\max(u,v)  
$$
这里正是 Rocq Universe Cumulativity 发挥作用的地方。

**情况 B：Monomorphic Definition**
```
Monomorphic Definition monoMakeType
    (A : Type) (B : Type) : Type :=
  (A * list B)%type.
```
概念上：
```
monoMakeType :
  forall (A : Type@{g1})
         (B : Type@{g2}),
    Type@{g3}
```
- `g1`、`g2`、`g3` 是 Rocq 中共享的 Global Universe Levels，不需要确定为具体数字。
- 所有对 `monoMakeType` 的引用共享这些 Levels，不能在每次调用时独立实例化。
- Rocq 仍然支持 Cumulativity，因此可以有 `g1 ≤ g3`、`g2 ≤ g3`，不要求结果 Universe 与输入 Universe 相等。
因此，Monomorphic 和 Polymorphic 都可能涉及三个不同的 Universe Levels。**区别在于这些 Levels 是全局共享的，还是能够在每次引用时独立实例化。**
#### 3.2 翻译到 Lean
**情况 A：Polymorphic Definition**
一种自然的 Lean 表示是：
```
def makeType.{u, v}
    (A : Type u)
    (B : Type v) : Type (max u v) :=
  A × List B
```
- `A : Type u`
- `B : Type v`
- `List B : Type v`
- `A × List B : Type (max u v)`
- 注意， 这里的 Return Type 仍然是 Universe Polymorphic 的，但它的 Universe Level 不是一个独立的参数，而是由输入的 Universe Parameters `u` 和 `v` 决定的。Return Type 的 Universe Level 可以随着每次实例化而改变。
因此，Lean 可以使用 `max u v` 表达返回类型的实际 Universe。
例如 `makeType Nat Bool` 得到的类型是：`Nat × List Bool`, 它属于 `Type 0`。

**情况 B：Monomorphic Definition**
```
Monomorphic Definition monoMakeType
    (A : Type) (B : Type) : Type :=
  (A * list B)%type.
```
翻译器需要为源 Global Levels `g1`、`g2`、`g3` 找到合适的 Lean Level Interpretation。
例如，假设源 Universe Constraints 允许将这三个 Levels 一致地解释为 Lean 的 `1`，可以生成：
```
def monoMakeType
    (A : Type 1)
    (B : Type 1) : Type 1 :=
  A × List B
```
这里的三个 Universe Levels 已经选择了具体解释，因此不需要额外的 Lean Universe Parameters。
但项目中的 R2S 也可能保留符号化的 Level Interpretation，例如：
```
def monoMakeType.{u, v}
    (A : Type u)
    (B : Type v) : Type (max u v) :=
  A × List B
```
需要注意：
- 源 Rocq 中的 `g1`、`g2`、`g3` 仍然是 Global Levels。
- 目标 Lean 中的 `u`、`v` 是 Universe Parameters。
另外，Monomorphic Declaration 也需要考虑 Rocq 的 Cumulativity。
- 虽然 Monomorphic 的 Global Universe Levels 是固定的，但 Rocq 仍然允许将较低 Universe Level 的类型传入要求较高 Level 的参数。例如，`nat` 和 `bool` 属于 `Set`，但 Rocq 可以利用 Cumulativity，将它们作为更高 `Type@{u}` 的参数使用。
- 而在 Lean 中，如果直接将对应参数固定为 `Type 1`，那么 `monoMakeType Nat Bool` 就无法通过类型检查，因为 `Nat` 和 `Bool` 属于 `Type 0`，Lean 不会自动将它们提升到 `Type 1`。因此，即使是 Monomorphic，翻译器也不能只考虑固定的 Universe Levels，还需要处理 Rocq 允许的低层级类型向高层级类型的使用方式。
这意味着，即使 `monoMakeType` 本身翻译成功，其他 Declaration 引用它时，仍然可能需要额外的 Universe Lifting 或其他兼容处理。
#### 3.3 为什么不能直接保留独立的 `w`？
在 Rocq 中，`makeType` 的 Universe Constraints 允许：
$$  
\max(u,v)\leq w  
$$
也就是说，返回类型 `A * list B` 所处的 Universe 可以低于声明中的 `w`，因为 Rocq 支持 Universe Cumulativity。
##### 1. Lean 为什么不能直接保留 `w`？
如果直接翻译为：
```
def makeType.{u, v, w}
    (A : Type u)
    (B : Type v) : Type w :=
  A × List B
```
通常无法通过 Lean Type Checking，因为 Rocq 可以在 Polymorphic Declaration 中记录 `max(u,v) ≤ w` 这样的约束，要求每次实例化的 Universe Levels 都满足这个关系。Lean 没有直接对应的 Universe 不等式约束机制。
##### 2. 为什么直接令 `w = max(u,v)`可能缩小原来 Rocq Declaration 的 Universe Generality？
一种简单的解决方法是直接将结果 Universe 改为 `max u v`：
```
def makeType.{u, v}
    (A : Type u)
    (B : Type v) : Type (max u v) :=
  A × List B
```
这样的翻译可以通过 Lean Kernel 检查。
但问题是，在 Rocq 中，`w` 不一定等于 `max(u,v)`，也可以是更高的 Universe Level。
如果翻译时强制：
$$  
w=\max(u,v)  
$$
就无法保留源声明中允许 `w > max(u,v)` 的独立 Universe Instances，损失了源 Declaration 的 Universe Generality。
- 对于需要保留这种一般性的情况，我们的翻译器可以通过 Universe Interpretation 将原始不等式约束表示为 Lean 的 `max` 表达式，并利用 `PULift` 显式处理 Cumulativity，从而在支持的范围内保留源声明允许的 Universe 实例及其语义对应关系。
#### 3.4 我们的翻译器如何处理？
[[翻译器怎么处理返回值是Type时的universe]]

---
## 情况 4：Definition 引用其他 Constants 时的 Universe Instantiation

当一个 Definition 的 Body 调用已经定义好的 Constant 时，翻译器不仅需要将函数调用转换成 Lean Expression，还需要确定被引用 Constant 的 Universe Instance。

这里主要有两个问题：
1. Universe Instantiation：被引用的 Constant 应该使用哪些 Universe Levels？
2. Universe Cumulativity：Rocq 允许较低 Universe 的类型作为较高 Universe 的参数，而 Lean 不支持一般的 Type Cumulativity。

项目根据被引用 Constant 是 Polymorphic 还是 Monomorphic，采用不同的处理方式：
- Polymorphic Constant：R6 主要负责翻译 Exporter 已经记录的 Source Universe Instance。
- Monomorphic Constant：R3 负责检查源 Global Levels 在 Lean 中被泛化后的引用实例是否合法。

### 1. 首先理解 Universe Instantiation 与 Cumulativity 的区别

假设有一个 Polymorphic Constant：

```coq
Polymorphic Definition polyId@{k}
    (A : Type@{k}) (x : A) : A := x.
```

在 Rocq 中，下面的调用可以在满足 `Set ≤ k` 时成立：

```coq
polyId@{k} nat 3
```

因为：

```coq
nat : Set
```

Rocq 支持 Cumulativity，因此 `nat` 可以传给要求 `Type@{k}` 的参数位置。

但在 Lean 中：

```lean
def polyId.{k}
    (A : Type k) (x : A) : A := x
```

不同 Universe Instances 的情况是：

```lean
polyId.{0} Nat 3  -- 可以
polyId.{1} Nat 3  -- 类型不匹配
```

原因是：

```text
Nat 的类型：         Type 0
polyId.{1} 期待：    Type 1
```

Lean 不能直接将 `Type 0` 当作 `Type 1` 使用。

因此，即使翻译器正确保留了 Rocq 的 Universe Instance，目标调用也不一定能够通过 Lean Kernel。

### 2. Polymorphic Constant：Rocq Elaboration + R6

#### 2.1 Rocq 如何确定调用的 Universe Instance？

考虑两个 Polymorphic Definitions：

```coq
Polymorphic Definition polyId@{k}
    (A : Type@{k}) (x : A) : A := x.

Polymorphic Definition useId@{u}
    (A : Type@{u}) (x : A) : A :=
  polyId A x.
```

这里 `u` 和 `k` 分别属于两个不同的 Polymorphic Declarations。

当 Rocq 处理：

```coq
polyId A x
```

时，可以概念性地理解为：

```coq
polyId@{?k} A x
```

由于当前：

```coq
A : Type@{u}
```

而 `polyId` 期待：

```coq
A : Type@{?k}
```

Rocq 的 Cumulativity 允许：

$$
u\leq ?k
$$

如果没有其他限制，Rocq 可以选择：

$$
?k:=u
$$

因此，这次引用最终可以表示为：

```coq
polyId@{u} A x
```

需要注意：Rocq 最初允许的是 `u ≤ ?k`，并不是一定要求两个 Levels 相等。

#### 2.2 Exporter 已经保存了 Universe Instance

MetaRocq Exporter 导出的是经过 Rocq Elaboration 的 AST，而不是原始的函数调用文本。

因此，Translator 收到的不是尚未推断的 `?k`，而是已经包含 Source Universe Instance 的 AST，例如：

```text
App
 ├── Const: polyId
 │   Universe Instance: [u]
 └── Arguments
     ├── A
     └── x
```

也就是说，Rocq 已经决定了这次调用应该使用哪个 Universe Instance，Translator 不需要重新执行 Rocq Elaboration。

#### 2.3 R6 如何翻译 Source Universe Instance？

假设已经翻译的 Lean Constant 为：

```lean
def Rocq.polyId.{k}
    (A : Type k) (x : A) : A := x
```

当 `transHead` 遇到 `polyId` 时，会：
1. 从 `GEnv` 查询被引用 Constant 的目标名称和 Polymorphic Universe Parameter 数量。
2. 检查 Source AST 中的 Universe Instance 数量是否正确。
3. 使用 `transInstLevel` 将源 Universe Instance 转换为 Lean Levels。
4. 构造包含对应 Universe Arguments 的 Lean Constant Reference。

`transInstLevel` 的基本映射为：

| Source Universe Instance | Lean Level |
|---|---|
| `Set` | `0` |
| 当前 Polymorphic Parameter `u` | 对应的 `v_0` 或其受约束 Interpretation |
| Global Level `g` | 当前 Declaration 中 `g` 的 Level Interpretation |

因此，如果当前 Declaration 的 `u` 对应 Lean `v_0`：

```coq
polyId@{u} A x
```

就会翻译为：

```lean
Rocq.polyId.{v_0} A x
```

这里的关键是：R6 保留 Source Universe Instance 的对应关系，而不是为每次引用随意创建新的 `?k`，让 Lean 重新选择一个方便的 Level。

### 3. Lean Type Checking：检查 Universe Instance 是否匹配

对于刚才的 `useId`，目标 Lean Declaration 可以写为：

```lean
def Rocq.useId.{u}
    (A : Type u) (x : A) : A :=
  Rocq.polyId.{u} A x
```

Lean 会检查：

| 检查对象 | Callee 期待 | 实际传入 |
|---|---|---|
| `A` | `Type u` | `A : Type u` |
| `x` | `A` | `x : A` |
| 返回值 | `A` | `A` |

所有类型都能匹配，因此这次引用不需要额外处理。

项目测试中也有类似的真实例子：

```coq
Definition ptwice@{u}
    (A : Type@{u}) (f : A -> A) : A -> A :=
  pcomp@{u u u} f f.
```

这里 `pcomp` 具有三个 Polymorphic Universe Parameters，而本次调用明确使用：

```text
[u, u, u]
```

翻译器会保留这三个 Source Instances，而不是将它们当作三个完全独立、需要重新猜测的 Levels。

对应源码：[Poly.v — R6 Fixture](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/fixtures/poly/Poly.v)

### 4. 如果 Rocq 使用了 Cumulativity，Lean 无法直接接受怎么办？

#### 4.1 问题：Source Instance 高于实际输入类型

考虑：

```coq
Polymorphic Definition useHigher@{u v | u <= v}
    (A : Type@{u}) (x : A) : A :=
  polyId@{v} A x.
```

这里明确要求：

$$
u\leq v
$$

因此，Rocq 可以接受：

```coq
polyId@{v} A x
```

但直接翻译到 Lean：

```lean
def useHigher.{u, v}
    (A : Type u) (x : A) : A :=
  polyId.{v} A x
```

不能对任意独立的 `u`、`v` 通过 Kernel Checking。

因为：

```text
polyId.{v} 期待 A : Type v
实际传入的 A : Type u
```

即使源 Constraint 保证 `u ≤ v`，Lean 也不会自动接受这种 Type Cumulativity。

#### 4.2 为什么不能直接把 `v` 改成 `u`？

例如：

```lean
def useHigher.{u, v}
    (A : Type u) (x : A) : A :=
  polyId.{u} A x
```

对于简单的 Identity Function，两种调用最终都返回 `x`。

但 Rocq 源代码明确引用的是：

```coq
polyId@{v}
```

而不是：

```coq
polyId@{u}
```

对于更复杂的 Polymorphic Constant，修改 Universe Instance 可能影响其返回类型、其他参数的 Universe Relations 和后续引用。

因此，R6 不能仅仅为了通过 Lean Kernel，就无依据地改变 Source Instance。

#### 4.3 项目如何处理 Cumulativity 冲突？

项目存在几种受限制的处理路径：

- Local Universe Interpretation：如果问题涉及 Polymorphic Parameters 的 Constraints，可以使用 `polyUniverseInterpretation` 将源关系编码为 `max` / `succ` Expressions。
- Explicit Type Lifting：对于符合条件的 Type-valued Results，可以使用 `PULift` 将较低 Universe 的类型包装到较高 Universe。例如前面讨论的 `CMorphisms.forall_def`。
- `type_lift_coercions`：如果相关类型已经采用 `PULift` 表示，翻译器可以在受支持的位置插入 `PULift.up` / `PULift.down`，处理函数参数、Let Bindings 或其他调用位置的表示差异。

例如：

```lean
PULift.up   : T → PULift T
PULift.down : PULift T → T
```

但需要注意，`PULift.up/down` 不是任意 `Type u` 到 `Type v` 的通用转换。它只适用于存在相应 `PULift` 包装类型、且转换关系能够被检查的情况。

如果 Source Universe Instance 必须保持较高层级，而项目没有适用的 Representation / Lifting Rule，那么即使 Rocq 接受该调用，Lean Translation 仍然可能失败。这时翻译器必须报告失败，而不能直接改变源实例。

### 5. Monomorphic Constant：Fresh Metavariables + R3

前面讨论的是源 Polymorphic Constant。对于 Monomorphic Constant，情况有所不同：它没有每次引用独立实例化的源 Universe Parameters，但项目可能将其 Global Levels 泛化为 Lean Universe Parameters。

这里才是 R3 和 Fresh Level Metavariables 的典型使用场景。

#### 5.1 Rocq 中

项目测试 `Univ.v` 中有以下例子：

```coq
Universe ua ub.
Constraint ua <= ub.

Definition idb
    (A : Type@{ub}) (a : A) : A := a.

Definition usea
    (A : Type@{ua}) (a : A) : A :=
  idb A a.
```

这里：
- `idb` 使用源 Global Level `ub`。
- `usea` 使用源 Global Level `ua`。
- Rocq Global Facts 保证 `ua ≤ ub`。

因此，Rocq 允许将：

```coq
A : Type@{ua}
```

传入要求：

```coq
A : Type@{ub}
```

的 `idb`。

#### 5.2 Lean 中如何建立引用？

假设 `idb` 已经被泛化翻译为：

```lean
def Rocq.idb.{u_ub}
    (A : Type u_ub) (a : A) : A :=
  a
```

翻译 `usea` 时，`transHead` 会查询 `GEnv` 中保存的 `idb` Universe Interface。

因为源 `idb` 是 Monomorphic，源 AST 不包含独立的 Polymorphic Universe Instance，但目标 Lean Declaration 有用于表示源 Global Level `ub` 的 Universe Parameter。

在默认处理路径中：
- 如果被引用的 Global Level 也是当前 Declaration 自己使用的 Level，直接复用当前映射。
- 如果该 Level 不属于当前 Declaration 的 Own Levels，则创建 Fresh Level Metavariable。

对于 `usea`，可以产生：

```lean
Rocq.idb.{?ub} A a
```

其中 `?ub` 是 Lean 翻译阶段创建的临时 Level Metavariable，并不是 Rocq 中新生成的 Polymorphic Universe Instance。

#### 5.3 Lean 通过 Unification 求解

当前：

```lean
A : Type u_ua
```

而：

```lean
Rocq.idb.{?ub}
```

期待：

```lean
A : Type ?ub
```

因此，Lean 可以求得：

$$
?ub:=u_{ua}
$$

目标引用变为：

```lean
Rocq.idb.{u_ua} A a
```

最终目标声明可以概念性地表示为：

```lean
def Rocq.usea.{u_ua}
    (A : Type u_ua) (a : A) : A :=
  Rocq.idb.{u_ua} A a
```

但这里还有一个关键问题：源 `idb` 使用的是 `ub`，为什么目标引用可以选择 `u_ua`？

#### 5.4 R3：验证目标 Universe Instance

R3（Reference Instantiation）负责检查目标 Universe Instance 是否受到 Rocq Source Facts 支持。

对于本例：

$$
ua\leq ub
$$

这一关系正好由 Source Global Universe Graph 保证。

因此，将 `idb` 的目标泛化参数实例化为较低的 `u_ua`，是一个有源 Universe Cumulativity 依据的选择。

这里需要区分两种情况：

| 情况 | 目标 Universe 处理 |
|---|---|
| Callee 的 Global Level 也是当前 Declaration 的 Own Level | 复用同一个 Level Interpretation，保持 Coherence |
| Callee 的 Global Level 不属于当前 Declaration | 可创建 Fresh Metavariable，通过 Unification 求解，再由 R3 检查 |

R3 不仅检查 Lean 是否能成功求解，还需要保证目标实例没有违反源 Universe Facts。

对于相关的特殊 Cumulativity 情况，项目还有受控的 `R3↑` 和 `R3↓` Retry Paths，但不能无条件提高或降低引用 Levels。

对应源码：
- [Univ.v — Monomorphic Reference Fixture](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/fixtures/universes/Univ.v)
- [Translate.lean — sharedOrFreshLevels](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)
- [UNIVERSE_TRANSLATION.md — R3](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_TRANSLATION.md)

### 6. 两种 Constant Reference 的核心区别

| | Polymorphic Callee | Monomorphic Callee |
|---|---|---|
| 源 Universe | Local Universe Parameters | Global Universe Levels |
| Rocq 每次引用能否独立实例化 | Yes | No |
| Source AST 中的 Universe Instance | 已由 Elaboration 确定 | 不存在独立的 Polymorphic Instance |
| 主要规则 | R6 | R3 |
| Lean Level 如何确定 | 翻译 Source Instance | 共享 Own Level 或创建 Fresh Metavariable |
| 是否需要 Unification | 源实例映射本身通常不需要重新猜测；整个调用仍需 Type Checking | 非共享的目标泛化 Levels 可由 Unification 求解 |
| 必须检查 | Source Instance Correspondence | Global Facts、Reference Coherence、No Raising |

需要注意，一个目标 Constant 也可能同时含有源 Polymorphic Parameters 和额外泛化的 Global Levels。`transHead` 会分别处理这两部分：前者使用 R6，后者使用 Global Level 的引用规则。

### 7. 最终验证

无论调用哪种 Constant，翻译器最终都需要检查：

1. Universe Instance Correctness：Polymorphic Reference 是否保留 Source Instance；Monomorphic Reference 是否满足 R3。
2. Universe Constraints：目标 Level Expressions 是否符合 Rocq 原始 Universe Facts。
3. Reference Coherence：共享的 Global Levels 是否保持一致。
4. Generality / Representation：Universe Interpretation、Lifting 或 Specialization 是否满足相应规则。
5. Lean Kernel Checking：整个 Definition 的 Type 和 Body 是否合法。

其中，`checkUniverseObligations` 和独立 Python Auditor 会检查相关 Global Reference Obligations；对于 R6 的 Polymorphic Source Instances，则检查源实例与目标 Level Interpretation 的对应关系。

## 总结：Constant Reference 的 Universe Translation

```text
Rocq Definition Body
    │
    │ 引用已经定义的 Constant
    ▼
MetaRocq Source AST
    │
    ├── Polymorphic Callee
    │     │
    │     ▼
    │   R6
    │   翻译已导出的 Source Universe Instance
    │
    └── Monomorphic Callee
          │
          ▼
        R3
        共享 Global Level 或创建 Fresh MVar
        通过 Unification 求解
          │
          ▼
Lean Type Checking
    │
    ├── 类型匹配
    │     └── 直接接受候选引用
    │
    └── Cumulativity 冲突
          └── 尝试受支持的 Interpretation /
              Lifting / Reference Retry
    │
    ▼
Universe / Interface Audit
    │
    ▼
Lean Kernel Checking
```

最重要的区别是：对于 Polymorphic Constant，Universe Instance 原则上由 Rocq Elaboration 决定，R6 负责忠实翻译；对于 Monomorphic Constant，项目将源 Global Levels 泛化为 Lean Parameters 后，可以使用 Unification 确定某次目标引用的实例，但必须由 R3 验证其具有合法的源 Universe 依据。

---
### 情况 5. Definition 内部调用的 Template Inductive
#### 5.1 Rocq 中
```coq
Polymorphic Definition wrap
    (A : Type) (x : A) : list A :=
  cons x nil.
```
这里除了 `A` 自身的 Universe，还涉及 `list A`、`cons` 和 `nil` 的 Universe Instances。
例如：
```coq
A : Type@{u}
```
对于支持 Template Polymorphism 的 `list`，实例层级会根据实际类型参数 `A` 以及 Template Metadata 确定。因此，Rocq 不需要为每次 `list A` 手动指定 Universe Instance。
#### 5.2 翻译到 Lean
在 Lean 中，每个已经翻译的 Inductive 都有自己的 Universe Interface。
例如，假设 `Rocq.list` 的参数接口为：
```lean
Rocq.list.{s} (A : Sort s)
```
那么当当前参数为 `A : Sort r`,  翻译器遇到 `Rocq.list.{?s} A` 时，Lean Type Checking 要求：
$$
\mathrm{Sort}\ ?s
\equiv
\mathrm{Sort}\ r
$$
Unification 可以求得：
$$
\boxed{?s:=r}
$$
于是：
```lean
Rocq.list.{?s} A
```
变成：
```lean
Rocq.list.{r} A
```
如果目标接口采用 `A : Type s` 而不是 `A : Sort s`，那么需要根据该接口对应的 Level Convention 求解。例如，对 `A : Type u`，对应的完整 Sort Level 是 `u+1`。
#### 5.3 翻译器需要解决什么？
项目中的 R5 会根据 Template Metadata 和实际参数确定 Template Universe Instances，并使用 Type Checking 验证其合法性。
这与普通 Global Level 的处理不同：
- Global Level：需要考虑原始全局身份、Universe Facts 和 R3 Coherence。
- Template Level：主要根据 Inductive 的 Template 参数与实际输入类型建立对应关系。
因此，在翻译 `wrap` 时，不仅要处理 `A` 的公开 Universe Parameter，还需要让 `list`、`nil` 和 `cons` 使用兼容的 Universe Instances。
另外，Source Template Polymorphism 可能涉及 Sort Quality。对于目标实现尚未支持的 `Prop` Quality 实例，翻译器不能仅靠 Universe Level Unification 就认为已经完整支持。
### 与其他 Constant 调用的 Universe 处理有什么区别？

| 情况                   | Universe Level 如何确定               | 主要问题                                     |
| -------------------- | --------------------------------- | ---------------------------------------- |
| Monomorphic Constant | Global Level + Lean Unification   | R3 Coherence、Universe Facts、Cumulativity |
| Polymorphic Constant | R6 翻译源 AST 已确定的 Universe Instance | 保留源实例，处理可能的 Cumulativity                 |
| Template Inductive   | R5 根据实际类型参数推断                     | Template Metadata、参数一致性、Sort Quality     |

---
### 情况 6. `Type` 只出现在 Definition 的 Body 中
这一类对应 Type AST 和 Body AST 中 Universe Levels 的区别，也是 R2B 的核心使用场景。
#### 6.1 Rocq 中：Universe 从哪里来？
为了说明 Global Body-only Levels，先考虑普通 Monomorphic Definition：
```coq
Definition keep
    (A : Type) (x : A) : A :=
  (fun _ : Type => x) A.
```
这里有两处 `Type`。
- 第一处来自参数：`A : Type@{u}`
- 第二处来自 Body 内部的匿名函数：`fun _ : Type@{m} => x`
因此，概念上：
```coq
Definition keep
    (A : Type@{u}) (x : A) : A :=
  (fun _ : Type@{m} => x) A.
```
这里 `u` 和 `m` 是两个源 Global Universe Levels，它们并不一定从一开始就相等。
但因为匿名函数接收的是 `A`，而 `A : Type@{u}`，Rocq 可以通过 Cumulativity 建立：
$$
u \leq m
$$
#### 6.2 为什么 `m` 是 Body-only Level？
- Type AST：`forall (A : Type@{u}), A -> A` 只出现 `u`。
-  Body AST：`fun A x => (fun _ : Type@{m} => x) A`
Body 中出现 `u` 和 `m`。

| Level | Type AST | Body AST |
|---|---|---|
| `u` | 出现 | 出现 |
| `m` | 不出现 | 出现 |

因此，`u` 是公开接口使用的 Level，而 `m` 只影响内部实现。
#### 6.3 翻译到 Lean
R2S 首先为源 Global Levels 建立临时 Lean Level Metavariables：
$$
u\mapsto ?u,\qquad m\mapsto ?m
$$
Type 翻译为：
```lean
(A : Type ?u) → A → A
```
Body 翻译为类似：
```lean
fun A x =>
  (fun _ : Type ?m => x) A
```

这里实际传入的 `A` 属于 `Type ?u`，因此 Lean Type Checking 可以将：
$$
?m:=?u
$$
最终可以生成：
```lean
def Rocq.keep.{u}
    (A : Type u) (x : A) : A :=
  (fun _ : Type u => x) A
```
这里只需要保留公开 Universe Parameter `u`，而不必额外公开 `m`。但在接受该结果之前，翻译器还必须检查源 Constraint `u ≤ m`。因为 `m` 被解释为 `u`，所以该约束成立。
#### 6.4 如果 Body 中传入 `nat` 呢？
```coq
Definition keepNat
    (A : Type) (x : A) : A :=
  (fun _ : Type => x) nat.
```
这里 Body 内部的匿名函数仍然有独立的 Universe Level `m`。
- Rocq 中 Cumulativity 可以允许 `nat` 作为 `Type@{m}` 的参数，只要满足相应源约束。
但 Lean 中：
```lean
Nat : Type 0
```
如果直接翻译为：
```lean
(fun _ : Type ?m => x) Nat
```
Lean Type Checking 可能要求：
$$
?m:=0
$$

虽然这个解能让 Lean Expression 通过类型检查，但它仍然需要满足 Rocq 原来的 Universe Facts。

例如，如果源 Global Level `m` 要求严格高于 `Set`，那么直接选择 `m = 0` 就可能不满足源约束。

因此，不能因为 Lean Kernel 接受某个解，就认为它一定是合法的机械翻译。翻译器还需要使用 R2B / 相关 Universe Checks 验证该解；如果无法找到同时满足 Lean Typing 和 Source Facts 的表示，就必须拒绝或尝试其他受支持的翻译路径。
#### 6.5 R2B 的作用
R2B 主要处理源 Global Universe Level 只出现在 Body、不出现在公开 Type 中的情况。
基本流程是：
1. 为 Body-only Level 创建 Level Metavariable。
2. 通过 Type Checking 和 Unification 尝试求解。
3. 对仍未确定的 Level，根据源 Universe Facts 构造合法的 Minimal Model。
4. 使用 `checkBodyLevel` 验证最终解是否符合相关源关系。
因此，Body-only Level 不一定需要成为公开 Lean Universe Parameter，但也不能无条件固定为 `0`。
还需要注意，如果把上述 `keep` 改为 `Polymorphic Definition`，Body 中的 Universe 可能属于源 Polymorphic Universe Context。此时需要按照 R6 和实际的 Public / Private Universe 信息处理，不能直接将所有 Polymorphic Body-only Parameters 当作 R2B Global Levels。

---
### 情况 7. Type Family：返回类型依赖于输入

还有一种常见情况是，某个参数本身是 Type Family：
#### 7.1 Rocq 中
```coq
Polymorphic Definition returnP
    (A : Type)
    (P : A -> Type)
    (x : A)
    (p : P x) : P x := p.
```
概念上可以表示为：
```coq
A : Type@{u}
P : A -> Type@{v}
x : A
p : P x
```
其中：
- `u`：决定输入类型 `A` 所在的 Universe。
- `v`：决定 `P x` 这个类型所在的 Universe。
虽然具体的返回类型 `P x` 依赖输入值 `x`，但其 Universe Level 仍由当前声明的 Universe Instance 决定，并不是运行时随着 `x` 动态改变。
#### 7.2 翻译到 Lean
```lean
def returnP.{u, v}
    (A : Type u)
    (P : A → Type v)
    (x : A)
    (p : P x) : P x := p
```
Lean 可以直接表达这种 Dependent Function Type。
这里 `u` 和 `v` 可以是独立的 Universe Parameters，不需要因为 `P x` 依赖 `x`，就强制令它们相等。
#### 7.3 翻译器需要解决什么？
翻译器需要保留：
- `A` 所属的 Universe。
- Type Family `P` 返回类型所属的 Universe。
- `P x` 与参数 `p` 之间的依赖关系。
这类情况与普通 `A → A` 的区别是，Type AST 中不仅有普通类型参数，还有返回 `Type` 的函数。因此，Type Family 的 Codomain Sort 也需要独立处理。
###### 翻译器主要完成三步。
Step 1. 翻译 Universe Parameters
将 Rocq 的 `u`、`v` 映射到 Lean Universe Parameters。
```
A : Type u
P : A → Type v
```

Step 2. 使用普通 `trans` 翻译依赖类型结构
Rocq Kernel AST 中的：
```
Prod (P : A -> Type)
Prod (x : A)
Prod (p : P x)
```
翻译成 Lean 的 `forallE`，而 `P x` 则是普通的函数应用 `app`。
翻译器必须正确保留变量引用关系，确保 `p` 的类型和函数返回类型都指向同一个 `P x`。

Step 3. Lean Kernel 检查
最终得到：
```
def returnP.{u, v}
    (A : Type u)
    (P : A → Type v)
    (x : A)
    (p : P x) : P x :=
  p
```
Lean 能直接检查 `p : P x` 与返回类型 `P x` 完全一致，因此直接通过。
- 这里不需要因为 `P x` 依赖 `x` 而使用 `PULift`、R2B-V 或额外的 Universe Interpretation。
---
## 8. 哪些地方不需要新的 Universe Level？
不是每一个 Term 或 Function Application 都需要引入新的 Universe Metavariable。
例如：
```coq
Definition plusOne (n : nat) : nat := S n.
```
这里 `nat` 属于已知的 `Set`，不需要单纯因为出现了 `nat` 就创建新的自由 Universe Parameter。
同样：
- `Prop` 和 `Set` 是已知的 Sort。
- `x : A` 使用已有的类型 `A`，不会自动引入独立的新 Universe。
- `A -> A` 的 Sort 可根据已有 Level Expressions 计算，不意味着每个箭头都产生新的参数。
- 已经导出明确 Universe Instance 的 Polymorphic Reference，不一定需要再为该实例创建新的未知 Level。
因此，关键不是 AST 中出现了多少个 Type-related Nodes，而是有哪些源 Universe Levels、它们出现在哪里、具有怎样的源约束。
## Constant Translation 中的 Universe 求解流程
结合项目当前的 `Emit.lean` 和 `Translate.lean`，整个处理过程可以概括为：
```text
Rocq ConstantDecl
  ├── Type AST
  ├── Body AST
  ├── Universe Declaration
  └── Native Universe Facts
             │
             ▼
Step 1. 建立 Universe Mapping
  ├── Global Levels → Level Metavariables（R2S）
  ├── Polymorphic Parameters → Lean Parameters（R6）
  └── Reference Instances → Source-derived / Fresh Levels
             │
             ▼
Step 2. Recursive trans
  ├── Type AST → Lean Type Expr
  ├── Body AST → Lean Body Expr
  ├── Constant References
  └── Inductive / Template References
             │
             ▼
Step 3. Type Checking + solveLevels
  ├── Unification
  ├── Public Universe Parameters
  ├── Solved Level Expressions
  └── Body-only Level Defaults
             │
             ▼
Step 4. Universe / Interface Checks
  ├── Source Universe Facts
  ├── R3 Reference Coherence
  ├── Body Level Checks
  ├── Universe Generality
  └── Special Lowering / Transport Rules
             │
             ▼
Step 5. Lean Kernel Checking
             │
             ▼
Lean Declaration + DeclResult
```
这里主要涉及以下几类规则：

| 规则 | 主要用途 |
|---|---|
| R2S | 为源 Global Levels 建立临时变量，求解后决定参数化或固定 |
| R2B | 处理 Body-only Global Levels，并验证其求解结果 |
| R3 / R3G | 检查 Generalized Constant References 的 Universe Instances、Coherence 和隐含 Levels |
| R5 | 根据 Template Metadata 和实际参数处理 Template Inductive Instances |
| R6 | 翻译源 Polymorphic Constant 的 Universe Parameters 和 Instances |
| R2F-c | 在适用的 Constant Retry 路径中，用 `max` / `succ` 编码 Global Universe Facts |
| R2B-V | 对符合条件的 Type-valued Definition，使结果 Sort 继承翻译后 Value 的实际 Sort |
| Type Lift | 对部分需要显式 Universe Transport 的定义使用 `PULift` 等专门表示 |

需要注意，R2F-c、R2B-V 和 Type Lift 都有各自的适用条件，并非可以任意选择的通用修复方法。
# 所有情况的总结

| 情况 | Rocq 中的 Universe 行为 | Lean 中的处理 | 翻译重点 |
|---|---|---|---|
| 参数 `A : Type` | 引入或引用 Level `u` | `A : Type u` | 保留合法参数化 |
| 多个 `Type` 参数 | `u`、`v` 可以独立 | `Type u`、`Type v` | 不错误合并 Levels |
| 返回新的 Type | 结果层级 `w` 可能高于输入 | `Type (max u v)` 或特殊表示 | Result Sort 和 Generality |
| 调用 Polymorphic Constant | 引用带 Universe Instance | R6 翻译源实例 | 保留实例关系 |
| 使用 Template Inductive | 实例根据实际参数推断 | 根据目标接口求解 Instance | Template Level Mapping |
| Body-only `Type` | Level 只在 Body 中出现 | Metavariable 求解或默认化 | R2B 与 Native Facts |
| Type Family | `P x` 的类型层级由 `v` 决定 | `P : A → Type v` | 保留依赖类型结构 |

最重要的是区分三件事：
1. Universe Level 的来源：来自当前 Declaration 的 Type / Body，还是来自某个被引用的 Declaration。
2. Universe Level 的角色：属于 Monomorphic Global Level、Polymorphic Universe Parameter，还是某次引用中需要求解的 Universe Instance。
3. 在我们项目的 Constant Translation 中，Global Universe Levels 通常先通过 R2S 创建 Metavariables，而 Polymorphic Universe Variables 通常直接通过 R6 转换为 Lean Universe Parameters，不需要重新推断。
4. Universe Level 的最终解释：在 Lean 中应该保留参数、通过 Unification 求解、使用受约束的 Level Expression，还是在满足条件时进行 Lowering / Transport。
因此，Constant Translation 的 Universe Solving 并不是简单地为每个 Rocq `Type` 指定一个 Lean Level，而是要在 Lean Kernel 能接受的前提下，尽可能保留 Rocq Declaration 原本的 Universe Constraints、引用关系和一般性。
### 参考源码与文档
- [Rocq 9.3 — Universe Polymorphism](https://rocq-prover.org/doc/v9.3/refman/addendum/universe-polymorphism.html)
- [Lean 4 — Universes](https://lean-lang.org/doc/reference/latest/The-Type-System/Universes/)
- [项目 Universe Translation Rules](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_TRANSLATION.md)
- [Emit.lean — Constant Translation](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean)
- [Translate.lean — Term Translation 和 Universe Checks](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)
- [UNIVERSE_FAMILY_C.md — Result Sort 与 R2B-V](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_FAMILY_C.md)