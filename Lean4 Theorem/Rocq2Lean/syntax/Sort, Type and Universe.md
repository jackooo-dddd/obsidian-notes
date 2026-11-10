Sort 和 Universe 在 Lean 和 Rocq 里面都有。 它们是类型系统最基础的概念，用来规定一个 Type 本身属于什么类型，以及不同类型处于哪个层级。
#### Universe Level 描述的是一个 Type 所处的层级。
在 Rocq 和 Lean 中，都可以这样理解：

|对象|它的 Type|所处的 Universe Level|
|---|---|---|
|`0`|`nat`|—|
|`nat`|`Type 0`|0|
|`Type 0`|`Type 1`|1|
|`Type 1`|`Type 2`|2|
|`Type 2`|`Type 3`|3|

- `nat : Type 0`：`nat` 是一个类型，它属于 Universe 0。
- `Type 0 : Type 1`：`Type 0` 本身也是一个类型，它属于 Universe 1。
#### 多个 Type 可以处于同一个 Universe Level
```
-- Universe Level 0
Nat                : Type 0
Bool               : Type 0
List Nat           : Type 0

-- Universe Level 1
Type 0             : Type 1
List (Type 0)      : Type 1
Nat → Type 0       : Type 1
```
#### 一个 Type 能不能对应多个 Universe Level？
-  Rocq 有 Universe Cumulativity。对于 `A : Type@{u}`, 如果 `u ≤ v`，那么 `A` 可以用于要求 `Type@{v}` 的位置。
- 在 Lean 中，一个固定的 Type 实例有确定的 Universe Level，不能自动提升到更高层级。
## Lean 里面的 Sort
Lean 把所有层级统一为 `Sort u`。Lean 的 Universe Level 从 0 开始， Level 0 专门用于命题。

| Lean 写法      | 实际含义                |
| ------------ | ------------------- |
| `Sort 0`     | `Prop`，命题的类型        |
| `Sort 1`     | `Type 0`，也就是 `Type` |
| `Sort 2`     | `Type 1`            |
| `Sort (u+1)` | `Type u`            |

|对象|它的 Type|它的 Sort|Lean Universe Level（Sort 层级）|
|---|---|---|---|
|`Nat.zero`|`Nat`|`Sort 1`|1|
|`Nat`|`Type 0`|`Sort 1`|1|
|`Bool`|`Type 0`|`Sort 1`|1|
|`List Nat`|`Type 0`|`Sort 1`|1|
|`Nat.zero = Nat.zero`|`Prop`|`Sort 0`|0|
|`Type 0`|`Type 1`|`Sort 2`|2|


在 Lean 中 `Type u = Sort (u + 1)`,  因此以下三种写法等价：

|写法|使用场景|
|---|---|
|`Nat : Type`|最常见，日常 Lean 编程与证明|
|`Nat : Type 0`|需要明确 Universe Level 时|
|`Nat : Sort 1`|研究 Sort、Universe 或进行底层翻译时|

### 为什么翻译到 Lean 里面要用Sort
- `Sort u`可以表示 `Prop`，也可以表示任意 `Type` 层级。 但是 `Type u`只能表示 `Type` 家族，不能表示 `Prop`。所以，`Sort u` 能覆盖更多情况。
- 对于普通的数据类型，写 `Type u` 更容易理解；但翻译器需要处理 Rocq 中的 `Prop`、`Set` 和不同 Universe 的 `Type`，所以在 Lean Kernel AST 中使用 `Sort s` 能更完整地保留这些区别。
假设 Lean 中生成的 list：
```
inductive Rocq.list.{s} (A : Sort s) :
    Sort (max 1 s) where
  | nil : Rocq.list A
  | cons : A → Rocq.list A → Rocq.list A
```
- `s` 是 Universe Parameter。表示的是`list` 的元素类型 `A` 所属的 Universe Level
- `list.{s}`：表示使用 Universe Level `s` 实例化这个多态 Inductive。
- `max 1 s`：控制整个 `Rocq.list A` 所属的 Universe Level。对于 `Rocq.list`，只要 `s ≥ 1`，List 与它的元素类型 `A` 就处于相同的 Sort 层级。
这个声明可以处理：
情况 A：`s = 1`
```
A : Sort 1     -- A : Type 0
Rocq.list A : Sort 1  # Rocq.list A 表示整个 List 类型
```
情况 B：`s = 2`
```
A : Sort 2     -- A : Type 1
Rocq.list A : Sort 2
```
情况 C：`s = 0`
```
A : Sort 0     -- A : Prop
Rocq.list A : Sort 1
```
- 注意第三种情况：参数 `A` 本身是命题，但 `Rocq.list A` 仍然是一个数据类型。
如果把声明改成：
```
inductive Rocq.list.{u} (A : Type u) : Type u
```
那么就不能再处理 `A : Prop` 这种情况，因为 `Type u` 不包含 `Sort 0`。

## Rocq 里面有哪些 Sort？
Rocq 也有不同 Level 的 Sort，但通常不写成 `Sort 0`、`Sort 1`、`Sort 2`。这种数字化的 `Sort n` 写法主要是 Lean 的表示方式。

|Rocq Sort|它自身的 Type|Universe Level|含义|
|---|---|---|---|
|`SProp`|`Type 1`|特殊层级 `SProp`|严格证明无关的命题|
|`Prop`|`Type 1`|特殊层级 `Prop`|普通逻辑命题|
|`Set`|`Type 1`|`0`|最低的 Predicative Universe，例如 `nat`、`bool`|
|`Type 1`|`Type 2`|`1`|比 `Set` 高一级|
|`Type 2`|`Type 3`|`2`|更高一级|
|`Type@{u}`|`Type@{u+1}`|`u`|由 Universe Level `u` 决定的 Sort|

- `Set` 可以理解为 `Type` 家族的最低层级，而 `Prop` 和 `SProp` 需要单独处理。
### Rocq 和 Lean 的对比

|Universe Level|Rocq 的 Sort|Lean 的 Sort|
|---|---|---|
|特殊命题层|`SProp`|无完全对应的独立 Sort|
|命题层|`Prop`|`Sort 0` = `Prop`|
|数据类型 Level 0|`Set` = `Type@{0}`|`Sort 1` = `Type 0`|
|数据类型 Level 1|`Type@{1}`|`Sort 2` = `Type 1`|
|数据类型 Level 2|`Type@{2}`|`Sort 3` = `Type 2`|
|数据类型 Level u|`Type@{u}`|`Sort (u+1)` = `Type u`|

注意：这里比较的是通常的数据类型 Universe 层级；`Prop` 的映射需要单独处理。

### 为什么 Rocq 不直接使用 `Sort n`？
因为 Rocq 将 Sort 分为：
```
Sort
 ├── SProp
 ├── Prop
 ├── Set
 └── Type@{u}
```
而 Lean 使用统一的编号：
```
Sort 0 = Prop
Sort 1 = Type 0
Sort 2 = Type 1
Sort 3 = Type 2
...
```


## Rocq Inductive Example
## Inductive 中的两个 `Type` 分别是什么意思？
```coq
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```
这里的两个 `Type` 分别描述不同的东西：
- `(A : Type)`：表示输入 `A` 本身是一个类型，例如 `nat`、`bool`。
- `: Type`：表示 `list A` 也是一个类型，并指定它所属的 Sort。
需要注意，`list` 本身是一个 Type Constructor，接收类型 `A`，返回一个新的类型 `list A`；而 `nil A`、`cons A ...` 才是这个列表类型的具体 Value。
## Universe Level `u` 是从哪里来的？
在 Rocq 中，直接写 `Type` 并没有指定固定的 Universe Level。Rocq 会自动引入 Universe Parameter，并根据类型检查建立相应约束。因此，上面的两个 `Type` 可以先理解为：
```coq
A      : Type@{u}
list A : Type@{v}
```
这里 `u` 描述元素类型 `A` 的 Universe Level，`v` 描述列表类型 `list A` 的 Universe Level。它们不是普通的函数参数，也不需要立即确定为具体数字。
对于这个默认采用 Template Polymorphism 的 `list`，Rocq 推断的形式可以写成：
```coq
list : Type@{u} -> Type@{max(Set,u)}
```
因此，结果 Universe Level 由输入类型的 Level 决定：
$$
\boxed{
\begin{aligned}
A &: \mathrm{Type}@\{u\}\\
list\ A &: \mathrm{Type}@\{\max(Set,u)\}
\end{aligned}
}
$$
为什么使用 `max(Set,u)`？因为 `cons` 需要保存一个 `A` 类型的元素，所以列表类型的 Universe 必须能够容纳元素类型的层级，同时这个数据类型的结果层级至少为 `Set`。因此需要取两者的最大值。
## 传入具体类型后会发生什么？
例如，我们想构造一个 Natural Number List，传入的是 `nat`，而不是自然数 `3`：
```coq
nat : Set
3   : nat

list nat : Set
nil nat  : list nat
```
这里 `nat` 是 Type，`3` 是 Value；`list nat` 是新的 Type，`nil nat` 是它的 Value。

不同输入类型对应的结果如下：

| 输入类型 A | A 所属的 Sort | 生成的类型 | list A 所属的 Sort |
|---|---|---|---|
| `nat` | `Set` | `list nat` | `Set` |
| `bool` | `Set` | `list bool` | `Set` |
| `B` | `Type@{w}` | `list B` | `Type@{max(Set,w)}` |
| `True` | `Prop` | `list True` | `Set` |

其中 `True : Prop` 也可以作为列表的元素类型，这是因为 Rocq 的 Cumulativity 允许命题类型在适当的 `Type` 位置使用，而不是将 Universe Level `u` 设置为 `Prop`。

对于普通的 `B : Type@{w}`，当 `Set ≤ w` 时，有 `max(Set,w)=w`，因此：
```coq
B      : Type@{w}
list B : Type@{w}
```
这说明 `B` 和 `list B` 可以处于相同的 Universe Level，但它们并不是同一个 Type。

## 核心总结
- `A`：元素类型，例如 `nat`。
- `Type@{u}`：描述元素类型 `A` 所属的 Universe Level。
- `list A`：根据 `A` 构造出来的新列表类型。
- `Type@{max(Set,u)}`：描述 `list A` 所属的 Universe Level。
- `nil A`、`cons A ...`：具体的列表 Value，类型为 `list A`。
因此，最重要的区别是：**`A` 和 `list A` 都是 Type，而 `Type@{u}` 和 `Type@{max(Set,u)}` 描述的是它们各自所属的 Sort。**