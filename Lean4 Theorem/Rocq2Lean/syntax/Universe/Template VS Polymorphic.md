在 Rocq 中，Template Polymorphism 和普通 Universe Polymorphism 有两个共同点：
1. 都支持同一个 Inductive 在不同调用中使用不同的 Universe Levels。
2. 都不需要把所有 Universe Levels 固定为某个全局 Level，因此可以在不同使用位置进行实例化。
区别在于：
- Template Polymorphism 的 Universe Level 由输入的类型参数决定。
- Universe Polymorphism 的 Universe Level 是声明显式绑定的参数，在每次引用时进行实例化，并满足对应的 Universe Constraints。
## 1. Template Polymorphism：由输入参数决定 Universe
```
Inductive TList (A : Type) : Type :=
| tnil : TList A
| tcons : A -> TList A -> TList A.
```
假设 Rocq 将其识别为 Template Polymorphic Inductive。
概念上可以理解为：
```
TList (A : Type@{u}) : Type@{max(Set, u)}
```
当使用它时：

|Input|Input 所属 Universe|TList 的结果 Universe|
|---|---|---|
|`nat`|`Set`|`Set`|
|`Type@{i}`|`Type@{i+1}`|`Type@{i+1}`|

关键在于：`u` 是通过类型参数 `A` 绑定的。
Template 有额外限制，例如其 Template Universe Levels 必须由合适的参数绑定，不能任意出现在 Constructor Fields 或其他位置。
## 2. Universe Polymorphism：每次引用独立实例化
```
Polymorphic Inductive PBox@{u}
    (A : Type@{u}) : Type@{u} :=
| box : A -> PBox A.
```
这里的 `u` 是一个明确的 Universe Parameter。
- 可以实例化为：`PBox@{Set} nat`
- 也可以在满足 Universe Constraints 的情况下选择其他 Universe：`PBox@{i} nat`
其中 `i` 可以高于 `Set`，因为 Rocq 支持 Cumulativity。
这表明：普通 Universe Polymorphism 不要求 Universe Level 必须精确等于输入类型的最低 Universe Level。
- 但注意，普通 Polymorphic 的 Universe 也不是完全自由的。它仍然需要满足输入类型要求和声明的 Universe Constraints。
- 而且，调用 `PBox nat` 时，Rocq 通常也能够自动推断 Universe Instance，并不意味着必须手动写 `@{u}`。
## Template Polymorphism 和 Universe Polymorphism 的区别

| 特性 | Template Polymorphism | Universe Polymorphism |
|---|---|---|
| 不同调用使用不同 Universe | 可以 | 可以 |
| Universe 实例化依据 | 根据实际类型参数，通过 Template 规则确定 | 根据引用处的 Universe Instance 和 Constraints 确定 |
| 支持多个 Universe Levels | 可以 | 可以 |
| Universe 结构限制 | 更严格 | 更灵活 |
| 可以用于 Definition | 不可以，仅用于 Inductive | 可以 |
| 引用中保存显式 Universe Instance | 不需要 | 需要（可由 Elaborator 自动填入） |
| 支持特殊的 Prop/Type Sort Polymorphism | 部分支持 | 普通 Universe Polymorphism 不自动支持 |

其中最重要的区别是：Template 的 Universe 主要由实际类型参数决定，而普通 Polymorphic 的 Universe Instance 是声明引用的一部分。
####  Universe Instance 如何确定？
考虑两个 Rocq Inductives：
```coq
(* Template Polymorphism *)
Inductive TList (A : Type) : Type :=
| tnil : TList A
| tcons : A -> TList A -> TList A.

(* Universe Polymorphism *)
Polymorphic Inductive PBox@{u}
    (A : Type@{u}) : Type@{u} :=
| box : A -> PBox A.
```
现在分别使用：
```coq
Check TList nat.
Check PBox nat.
```
两者都可以自动确定所需的 Universe，但内部机制不同。
**Template Polymorphism**
```text
TList nat
    ↓
检查实际参数 nat : Set
    ↓
根据参数计算 Template Universe
    ↓
TList nat : Set
```
- Template 的 Universe 由输入类型的 Sort 决定，不需要在 Inductive 引用中显式保存 Universe Instance。
##### 普通 Universe Polymorphism
```text
PBox nat
    ↓
为本次引用创建 Universe Instance ?u
    ↓
Type Checking 产生约束 Set ≤ ?u
    ↓
求解 ?u（例如 Set）
    ↓
PBox@{Set} nat : Set
```
普通 Universe Polymorphism 允许显式选择其他满足约束的 Universe Instance，例如：`PBox@{i} nat`. 只要满足 `Set ≤ i`，就可以通过 Rocq 的 Cumulativity 接受 `nat`。
因此，两者虽然都可以自动推断 Universe，但机制不同：
- Template：根据实际类型参数，使用特殊的 Template 规则确定 Universe。
- Polymorphic：每次引用都有自己的 Universe Instance，由 Elaborator 根据类型约束求解，也可以显式指定。
##### 特殊区别：Prop/Type Sort Polymorphism
某些 Template Inductives，例如符合条件的 `prod`，还支持 Prop 和 Type 之间的 Sort Polymorphism。
例如：
```coq
Check prod True True.
(* prod True True : Prop *)
```
当两个参数都是 Proposition 时，整个 Product 也可以属于 `Prop`。
但普通 Universe Polymorphism 只是通过 `u`、`v` 等 Universe Parameters 实例化不同的 Type Levels，并不会自动获得这种 Prop/Type Sort Polymorphism。
另外，Template Inductive 的 Universe 结构受到更多限制，例如 Template Levels 需要与适当的参数关联，不能任意出现在 Constructor Fields 中；普通 Universe Polymorphism 可以支持更灵活的 Universe 结构。
- Template Polymorphism 是专门针对 Inductive 的特殊、受限制的 Polymorphism 机制；普通 Universe Polymorphism 则将 Universe Instance 作为声明引用的显式结构。
- 在 Rocq → Lean Translation 中，这个区别尤其重要。即使 Rocq 源代码中都写成 `I A`，Exporter 提供的 Universe 信息及其解释方式也可能不同。因此，翻译器需要区分 Template 和 Non-template / Ordinary Polymorphic Inductives，不能完全使用相同的 Universe Translation 规则。