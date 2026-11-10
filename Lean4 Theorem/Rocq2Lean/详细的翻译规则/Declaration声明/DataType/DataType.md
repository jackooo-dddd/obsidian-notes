在 Rocq 中，Datatype 是 Type 的一种，但 Type 不一定是 Datatype。
- Type：泛指类型，例如 `nat`、`bool`、`nat -> nat`、`list nat`。
- Datatype：通常指通过 `Inductive`、`Record` 等方式定义的数据类型，特别是具有构造器的数据类型。
Datatype Translation 需要把 Rocq 中对某个 Datatype 的完整定义提取出来，再利用相应的机械规则，在 Lean 中生成具有对应参数、构造器和递归结构的数据类型。
### 规则 1：普通 Inductive Type 的生成
**具体例子：List**
```
Inductive mylist (A : Type) : Type :=
| nil : mylist A
| cons : A -> mylist A -> mylist A.
```
这里的 `mylist` 是一个可以保存任意类型元素的列表。
`A : Type` 表示列表里面元素的类型。例如：`mylist nat`：存储自然数。
两个 Constructor 分别是：

|Constructor|输入|构造出的结果|
|---|---|---|
|`nil`|不需要额外数据|空列表 `mylist A`|
|`cons`|一个 `A` 类型元素和一个 `mylist A`|一个新的 `mylist A`|

```
cons nat 1 (cons nat 2 (nil nat))
```
可以构造出包含 1 和 2 的列表（这里显式写出了类型参数）。
#####  翻译器如何处理？
MetaRocq 导出时，不仅导出一个名字 `mylist`，还会导出它的完整 Inductive 定义，包括：

|导出的信息|具体内容|
|---|---|
|Type Name|`mylist`|
|Parameter|`A : Type`|
|Result Sort|`Type`|
|Constructor 1|`nil : mylist A`|
|Constructor 2|`cons : A → mylist A → mylist A`|
|Recursive Structure|`cons` 的第二个字段引用了 `mylist A` 自身|

然后翻译器递归翻译各部分，生成类似下面的 Lean Datatype：
```
inductive Rocq.mylist (A : Type u) : Type u where
  | nil : Rocq.mylist A
  | cons : A → Rocq.mylist A → Rocq.mylist A
```
翻译完成后，Lean 就知道如何构造 `Rocq.mylist` 类型的值，以及它具有怎样的递归结构。之后，如果我们希望使用 Lean 原生的 `List`，可以再证明 `Rocq.mylist A ≃ List A`

## 规则 2：带 Universe 的 Inductive Type
这一规则解决的是：Rocq 和 Lean 都有 Type 的层级（Universe Level），但两边的表示方式和规则并不完全一样。

|Rocq|Lean|
|---|---|
|`Prop`|`Sort 0`（即 `Prop`）|
|`Set`|`Sort 1`（即 `Type`）|
|`Type@{l}`|`Sort (u_l + 1)`|
|Universe `max(l₁,l₂)`|根据对应层级构造 Lean 的 `max`|

因此，对于带有 Universe Level 的 Inductive，翻译器还需要：
1. 从 MetaRocq 导出结果中提取 Universe 信息。
2. 根据 Universe Rules 决定 Lean 中的层级参数。
3. 翻译所有 Constructor 的类型，并让它们引用正确的 Universe。
4. 将生成的 Inductive 交给 Lean Kernel 检查。
 R2T 规则负责将受支持的源归纳块的全局 Universe Level 转换成目标声明的 Universe 参数。
## 规则 3：Template Inductive
这是 Universe 翻译中的一个特殊情况。
- 主要特点是使用Template Inductive Datatype 时，某些 Universe Level 可以根据实际传入的类型参数来决定。
#### 为什么需要Template Inductive
考虑：
```
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```
- **当我们使用** `list nat` **时**：`nat : Type 0`，说明 `nat` 所在的最低 Universe Level 是 0。因此，`list nat` 的元素类型是 `nat`，而 `list nat` 本身也属于 `Type 0`。
- 当我们使用 list (Type 0) 时：Type 0 : Type 1，说明 Type 0 本身属于 Universe Level 1。因此，list (Type 0) 的元素是 Type 0 的类型（例如 nat、bool），而整个 list (Type 0) 本身属于 Type 1。
- **因此，List 的 Universe Level 并不是固定的**：在支持 Universe Polymorphism 的情况下，它可以根据元素类型所在的 Universe Level 进行实例化。也就是说，如果 `A : Type u`，那么 `list A : Type u`。
#### 翻译器怎么处理 Template Inductive
Rocq 的 Template Inductive 可以根据传入参数的 Universe Level 决定自身的 Universe Level。翻译器 R5 要把这种行为转换成 Lean 的 Universe Polymorphism。
首先，翻译器在 Lean 中生成一个通用的 List
```
inductive Rocq.list.{u} (A : Type u) : Type u where
  | nil : Rocq.list A
  | cons : A → Rocq.list A → Rocq.list A
```
- 这里的 `u` 是一个 Universe 参数。同一个 `Rocq.list` 可以在不同 Universe Level 上使用。使用 List 时，翻译器需要确定 u 的值。
- 假设我们有 variable (A : Type v)， 现在要使用 Rocq.list A。 因为 Rocq.list 的参数要求：
  Rocq.list.{u} (A : Type u)，Lean 必须选择 u = v。 Lean 可以自动推断这个 `u`，不需要手动指定。
这里的 `list` 相对简单，因为它只涉及一个 Universe 参数
但如果某个 Rocq Inductive 涉及多个 Universe 参数，例如：
```
inductive MyType.{u, v}
    (A : Type u)
    (B : Type v) : Type (max u v) where
  | mk : A → B → MyType A B
```
翻译器就要同时处理 `u` 和 `v`，并保证输出 Universe 的关系也符合 Rocq 的原始约束。
- R5 的目标是保留 Rocq 中 Universe Level 随参数变化的规则，让 Lean 能选择正确的实例。
翻译器 R5的大致过程是：
1. 读取 Rocq Kernel 导出的 `template_info`，确认这个 Inductive 是否使用 Template Polymorphism。
2. 确认每个 Template Universe Level 对应到哪个类型参数。
3. 当遇到具体应用 `Rocq.list A` 时，根据实际参数 `A` 的类型层级，决定 Lean 中要使用哪个 Universe 实例。
4. 使用 Lean Kernel 进行类型检查，并由独立 Auditor 复核实例选择。

## 规则 4：Structure-like Record
Record 是一种比较特殊、比较简单的 Datatype：它通常使用一个 Constructor，将多个字段组合成一个对象。
####  Rocq 中的 Record
```
Record Point : Type := mkPoint {
  px : nat;
  py : nat
}.
```
它定义了一个 `Point`，包含两个字段。可以通过` mkPoint 3 5 `构造一个 Point。
然后通过 `px` 和 `py` 获取字段值。
实际上，Record 也可以从归纳类型的角度理解：
```
Inductive Point : Type :=
| mkPoint : nat -> nat -> Point.
```
区别是 Record 还会引入相应的字段投影（Projection）及其使用规则。
#### 翻译到 Lean
对于符合条件的 Record，Lean 侧可以得到类似：
```
structure Rocq.Point where
  px : Nat
  py : Nat
```
然后可以使用：
```
def p : Rocq.Point :=
  { px := 3, py := 5 }
```
两个字段分别对应 Rocq 中的 `px`、`py`。
Rocq2Lean 支持一类 Structure-like Primitive Record。它通过 Lean 的归纳类型声明机制生成结构式归纳类型，并使用 `Expr.proj` 来表示字段投影。
目前这条规则要求 Record 具有适合结构式生成的形状，主要包括：
- 只有一个 Constructor。
- 没有 Indices。
- 不包含自身递归字段。
- 每个字段都有对应 Projection。

## 规则 5：Non-uniform Parameter
这条规则比较重要，也比普通 Inductive 复杂。
Uniform Parameter 是在递归使用同一个 Datatype 时，始终保持不变的参数；
Non-uniform Parameter 则可能在递归使用时发生变化。
#### 一个实际例子：`Acc`
Rocq 中有一个用于表达可访问性（Accessibility）的归纳命题 `Acc`。
它的定义可以简化表示为：
```
Inductive Acc
  (A : Type)
  (R : A -> A -> Prop)
  (x : A) : Prop :=
| Acc_intro :
    (forall y : A, R y x -> Acc A R y) ->
    Acc A R x.
```
- `A`：元素类型。
- `R`：两个元素之间的关系。
- `x`：当前元素。
重点看 Constructor 内部 Acc A R y 和结果 Acc A R x
- A, R 始终相同, 最后一个参数由 `y` 变成了 `x`。
- 也就是说，虽然 Rocq 把 `x` 写在了参数列表里，但它在递归调用中并没有保持不变。
这就是一个 Non-uniform Parameter 的例子。
#### 为什么不能直接生成相同的 Lean Parameter？
Lean 归纳声明中的 Uniform Parameters，在递归出现时受到相应的一致性要求。
如果把 `x` 当作一个始终固定的 Uniform Parameter，就无法忠实表达源 Constructor 中 `Acc A R y` 到 `Acc A R x` 的变化。
因此，翻译器需要改变它在 Lean 声明里的角色。
####  解决方案：把 Non-uniform Parameter 转换成 Index
目标结构可以理解为：
```
inductive Rocq.Acc
  (A : Type u)
  (R : A → A → Prop) : A → Prop where
  | intro (x : A) :
      (∀ y : A, R y x → Rocq.Acc A R y) →
      Rocq.Acc A R x
```

|Rocq|Lean|
|---|---|---|
|`A`|Parameter|Parameter|
|`R`|Parameter|Parameter|
|`x`|源参数列表中的 Non-uniform Parameter|Index|
|递归变化|`Acc A R y`|`Rocq.Acc A R y`|

这样一来，`x`、`y` 可以作为不同的 Index，递归结构就能在 Lean 中表达。
#### 项目怎么判断哪些参数需要转换？
使用 Rocq 导出的原生元数据 `nparams_rec`，表示可以作为递归过程中固定参数的数量。
例如，假设一个归纳类型声明了三个参数：`A, R, x`
而 Rocq 元数据表明只有前两个是 Uniform Parameters：
```
npars = 3
nparams_rec = 2
```
那么翻译器就将剩余的一个参数作为 Lean Index。
但是，仅仅改成 Index 还不够。 在后续翻译 `match` 时，Rocq 和 Lean 的匹配分支可能会以不同方式处理这些参数，因此还需要借助等式证明和 `Eq.rec` 进行相应的类型运输（Type Transport）。
目前项目支持部分这样的情况，例如单个 Non-uniform Parameter 的匹配；多个 Non-uniform Parameters 的匹配仍存在限制。

## 规则 6：Nested Inductive
Nested Inductive（嵌套归纳类型）指的是：一个 Datatype 在递归引用自身时，中间还包着其他数据类型。
#### 普通递归和 Nested Recursion 的区别
普通 List：
```
Inductive mylist (A : Type) : Type :=
| nil : mylist A
| cons : A -> mylist A -> mylist A.
```
- 这里 `cons` 直接包含` mylist A`
一棵多叉树：
```
Inductive tree (A : Type) : Type :=
| node : A -> list (tree A) -> tree A.
```
- 这里 `node` 包含 `list (tree A)`
也就是说，子树不是直接作为单独的 `tree A` 字段出现，而是先被放进了一个 `list` 里。
这也是 Nested Inductive 与普通递归 Datatype 的主要区别。
####  翻译器如何处理Nested Inductive
翻译器同样先提取完整的 Inductive 定义，然后生成相应的 Lean Inductive。
如果 Rocq 的 `list` 已经翻译为 `Rocq.list`，则目标可以理解为：
```
inductive Rocq.tree (A : Type u) : Type u where
  | node : A → Rocq.list (Rocq.tree A) → Rocq.tree A
```
Lean Kernel 会检查它是否满足归纳类型的合法性要求，例如严格正性（Strict Positivity）。 
#### 为什么说目前只有受限支持？
因为有两个不同的问题：
第一个：能否生成这个 Datatype？
- Lean Kernel 支持一定范围的 Nested Inductive，因此你的翻译器可以接受部分这样的类型。
第二个：能否翻译操作这个 Datatype 的函数？
- 假设我们想递归计算一棵 Tree 里所有节点的数量。函数不仅要递归处理当前节点，还要遍历 `list (tree A)` 中的每棵子树。
- 这比普通 List 的递归复杂得多，因为递归过程穿过了另一个 Datatype。
项目已经支持部分简单的 `match` 和单函数结构递归情况，但对于穿越 Nested Structure 的一般递归、复杂相互递归等情况，仍然不能保证翻译成功。

## Datatype 生成完成后，为什么还需要 Match / Fix Translation？
Datatype Translation 只解决 Lean 中是否存在对应的数据类型？它有哪些 Constructor？这些 Constructor 的类型是什么？
例如，成功生成 `Rocq.mylist`，只说明 Lean 已经知道这个 List 的结构。但是如果 Rocq 中还有：
```
Definition is_empty (xs : mylist nat) : bool :=
  match xs with
  | nil => true
  | cons _ _ => false
  end.
```
翻译器还需要处理 `match`，让 Lean 知道如何根据不同 Constructor 计算。这通常通过 Lean Kernel 生成的 Recursor 来实现。
类似地，如果 Rocq 中定义了一个递归计算列表长度的 `Fixpoint`，翻译器还要处理递归调用，并在目标语言中使用可被 Lean 接受的递归结构。

