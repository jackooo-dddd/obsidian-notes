在 Rocq 中，Universe主要用于确定 Type 所处的层级，以及不同 Type 之间能否相互使用。
当我们定义一个 `Definition` 时，Universe 会影响三个方面：
1. Definition 的参数类型：例如 `(A : Type@{u})`，限制参数 `A` 所处的 Universe。
2. Definition 的返回类型：返回值属于哪个 Universe，以及它与参数 Universe 的关系。
3. Definition 的实例化：使用这个 Definition 时，Universe Level 能不能改变。
其中，第三点取决于 Definition 是 Monomorphic（单态） 还是 Polymorphic（多态）。
## 1. Universe 如何作用在 Definition 上？
```
Definition id (A : Type) (x : A) : A := x.
```
这是一个恒等函数，接受类型 `A` 和该类型的元素 `x`，返回 `x`。

Rocq 在内部需要给 `Type` 一个 Universe Level `u`，可以理解为：
```
Definition id (A : Type@{u}) (x : A) : A := x.
```
例如：
```
nat : Type@{0}  # `Type@{0}` 通常写成 `Set`。
bool : Type@{0}
Type@{0} : Type@{1}
Type@{1} : Type@{2}
```
对于 `id`：
- `A : Type@{u}`：参数 `A` 必须能够被视为处于 `Type@{u}` 的类型。
- `x : A`：`x` 是类型 `A` 的元素。
- 返回类型是 `A`，不需要另外引入一个 Universe Level。
- `id` 的完整类型是 `forall (A : Type@{u}), A -> A`. 这个函数类型本身也有 Universe 层级。由于它量化了 `A : Type@{u}`，整个函数类型通常位于 `Type@{u+1}`。
## 2. Global Universe Levels
首先，Rocq 有一个全局 Universe 环境，用来记录已声明的 Universe Levels，以及它们之间的约束。
```
Universe u v.
Constraint u < v.
```
这表示：
- 声明两个Global Universe Levels：`u` 和 `v`。
- 要求 `u` 严格低于 `v`。
- Rocq 会在全局 Universe Graph 中记录这个关系。
Global Universe Level 是一个固定身份的层级变量，但不代表它已经被赋予了具体数字。
- `Universe u.` 表示 Rocq 创建了一个名为 `u` 的， 在当前全局环境中可被引用的 Level。它需要满足所有相关 Universe Constraints。

## 3. 默认的 Definition：Monomorphic Universe
在默认设置下：
```
Definition id1 (A : Type) (x : A) : A := x.
```
Rocq 会自动创建一个 Universe Level，例如：`id1.u0`
它是这个 Definition 引入的 Global Universe Level。
可以抽象理解为：
```
Global Environment:
    id1.u0
Declaration:
    id1 : forall (A : Type@{id1.u0}), A -> A
```
- `id1.u0` 的身份已经固定，之后每次使用 `id1`，引用的都是同一个 Universe Level。
例如：
```
Check (id1 nat 3).
Check (id1 bool true).
```
这两次调用都使用同一个 `id1.u0`。
- 但为什么同一个 Level 可以接受不同的类型？由于 Rocq 支持 Universe Cumulativity，假设 `nat : Type₀`，并且满足 Universe Constraint $0 \leq u$，那么 `nat` 就可以在 `Type@{u}` 的位置使用。
![[Pasted image 20261021200931.png|677]]

## 4. Polymorphic Definition：每次使用都可以实例化 Universe
```
Polymorphic Definition id2 (A : Type) (x : A) : A := x.
```
此时可以抽象理解为：
```
Declaration:
    id2@{u} :
        forall (A : Type@{u}), A -> A
```
注意，这里的 `u` 不再是一个由该 Definition 固定引入的全局 Level，而是 Universe Parameter。
每次引用 `id2`，都可以创建一个新的 Universe Instance。
- 例如 `Check (id2@{Set} nat 3).`
- 或者让 Rocq 自动推断：`Check (id2 nat 3).`
![[Pasted image 20261021201146.png|628]]

## 5. 每个 Definition 不会使用同一个 Global Universe `u` 吗
```
Definition id1 (A : Type) (x : A) := x.
Definition id2 (A : Type) (x : A) := x.
```
在默认 Monomorphic 模式下，Rocq 通常会分别创建：
```
id1.u0
id2.u0
```
它们是两个不同的 Global Universe Levels。

但如果你显式声明：
```
Universe u.

Definition f (A : Type@{u}) := A.
Definition g (B : Type@{u}) := B.
```
那么 `f` 和 `g` 确实引用了同一个全局 `u`。
所以区别是：
- 自动生成的 Monomorphic Levels：通常每个 Definition 引入自己的 Levels。
- 显式声明并复用的 Global Levels：多个 Definitions 可以共享。
- Polymorphic Levels：绑定在声明的 Universe Context 中，每次引用可以重新实例化。

## Monomorphic：所有调用共享同一个 `u`
```
Definition id1 (A : Type) (x : A) : A := x.
```
假设 Rocq 自动创建了一个 Global Universe Level `u`：
```
id1 : forall (A : Type@{u}), A -> A
```
那么，不管你调用多少次：
```
id1 nat 3
id1 bool true
id1 (list nat) (nil)
```
它们都使用同一个 `u`。也就是说：
```
id1 nat 3        → u
id1 bool true    → u
id1 (list nat)   → u
```
由于 Rocq 支持 Universe Cumulativity，`nat` 和 `bool` 都可以作为参数传入，所以这些调用没有问题。
## Polymorphic：每次调用可以有自己的 `u`
```
Polymorphic Definition id2 (A : Type) (x : A) : A := x.
```
那么，`u` 就是一个 Universe Parameter：
```
id2@{u} : forall (A : Type@{u}), A -> A
```
不同的调用可以选择不同的 Universe Instances：
```
id2 nat 3        → u₁
id2 bool true    → u₂
id2 (list nat)   → u₃
```
其中 `u₁`、`u₂`、`u₃` 不需要相同。
## 为什么翻译到 Lean 时，这个区别很重要？
因为 Lean 中通常这样定义函数：
```
def id1.{u} (A : Type u) (x : A) : A := x
```
这里的 `u` 是 Lean 的 Universe Parameter。
例如：
```
id1.{0} Nat 3
id1.{1} (Type 0) Nat
```
Lean 允许两次调用使用不同的 Universe Levels。

但如果源 Rocq 的 `id1` 是 Monomorphic，这就改变了源程序的 Universe 语义。
原本 Rocq 要求：
```
调用 1 → 固定的 global u
调用 2 → 固定的 global u
```
现在 Lean 却允许：
```
调用 1 → u = 0
调用 2 → u = 1
```
这等于给原来的 `id1` 增加了 Universe Polymorphism。

### 一个真正会产生区别的例子：Self-Application
Rocq 官方文档给出了一个例子。
```
Definition identity {A : Type} (a : A) := a.

Fail Definition selfid := identity (@identity).
```
为什么失败？
假设 `identity` 使用固定的 Global Universe Level `u`。
那么：
```
identity :
    forall A : Type@{u}, A -> A
```
而 `identity` 这个函数本身的类型，位于 `Type@{u+1}`。
当你尝试把 `identity` 传给自己时：
```
identity (@identity)
```
就要求：`u + 1 ≤ u`. 显然不可能，所以 Rocq 拒绝这个 Definition。
但是，如果我们使用：
```
Polymorphic Definition pidentity {A : Type} (a : A) := a.

Definition selfpid := pidentity (@pidentity).
```
就可以成功。
因为这时两次引用的 Universe 可以不同：
- 内层 `pidentity` 使用 `u₁`。
- 外层 `pidentity` 使用 `u₂`。
- 只需要满足 `u₁ + 1 ≤ u₂`。
所以，如果我们把 Monomorphic 的 `identity` 翻译成 Lean 的 Universe Polymorphic `def identity.{u}`，原本在 Rocq 中不合法的 Self-Application，可能在 Lean 中变成合法。
这就说明了：虽然 Lean Kernel 接受翻译结果，但不代表它完整保留了 Rocq 原始 Universe 约束。

## 对你的 Rocq → Lean 项目，应该怎么理解？
由于 Lean 的 Universe Parameters 默认支持按引用实例化，如果直接将 Rocq 的 Monomorphic Global Levels 转换为 Lean Universe Parameters，就可能赋予原声明额外的多态能力。因此，翻译器不仅需要处理 Universe Levels 的映射，还需要保留或验证 Rocq 原有的全局约束，防止目标程序接受源程序不允许的 Universe 实例化。