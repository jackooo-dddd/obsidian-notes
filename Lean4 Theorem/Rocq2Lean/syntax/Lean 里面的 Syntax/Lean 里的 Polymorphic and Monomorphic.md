Lean 中 Monomorphic 和 Polymorphic Definition 都很常见，但与 Rocq 的设计存在一个重要区别：
- Rocq：普通 Definition 默认通常是 Universe Monomorphic，需要显式声明 `Polymorphic` 才能让 Universe 在不同调用中独立实例化。
- Lean：不需要切换 Monomorphic / Polymorphic 模式。定义中如果使用 Universe Parameters {u}，就可以成为 Universe Polymorphic；如果没有，则是 Universe Monomorphic。
另外，Lean 不支持 Rocq 那样的 Universe Cumulativity，但这不意味着 Lean 不需要 Monomorphic。相反，Universe Polymorphism 对通用定义更加重要。
## 1. Lean 中的 Monomorphic Definition
先看一个普通函数：
```lean
def addOne (n : Nat) : Nat :=
  n + 1
```
因为：
```lean
Nat : Type 0
```
所以 `addOne` 的输入和输出类型都固定为 `Nat`，不需要任何 Universe Parameters：
```lean
addOne : Nat → Nat
```
Lean 原生的 `Nat.add` 也属于这一类：
```lean
Nat.add : Nat → Nat → Nat
```
它们都是 Universe Monomorphic Definition。
##### Monomorphic Identity
考虑：
```lean
def monoId (A : Type) (x : A) : A := x
```
Lean 中有一个非常重要的语法规则：
$$
\boxed{\texttt{Type}=\texttt{Type 0}=\texttt{Sort 1}}
$$
因此，上面的定义等价于：
```lean
def monoId (A : Type 0) (x : A) : A := x
```
- 例如 `#check monoId Nat 3` 可以成功，因为 `Nat : Type 0`。
- 但是 `#check monoId (Type 0) Nat` 会失败，因为 `Type 0 : Type 1` 而 `monoId` 要求第一个参数满足 `A : Type 0`。
需要注意，虽然 `monoId` 是 Universe Monomorphic，但它仍然具有普通的 Type Polymorphism，可以接受 `Nat`、`Bool`、`String` 等不同类型，只要它们都处于 `Type 0`。
因此需要区分：
- Type Polymorphism：能否接受不同的类型？
- Universe Polymorphism：能否接受属于不同 Universe Levels 的类型？
## 2. Lean 中的 Polymorphic Definition
将上面的 Identity Function 改成：
```lean
universe u

def polyId (A : Type u) (x : A) : A := x
```
它的完整接口为：
```lean
polyId.{u} :
  (A : Type u) → A → A
```
这里 `u` 不再固定为 `0`，而是一个 Universe Parameter，可以在每次调用时独立实例化。
- `#check polyId Nat 3` 对应 `polyId.{0} Nat 3`
- `#check polyId (Type 0) Nat` 对应 `polyId.{1} (Type 0) Nat`
因此，同一个 Definition 可以在两个不同的 Universe Levels 上使用。

| 输入 A | Monomorphic：`A : Type 0` | Polymorphic：`A : Type u` |
|---|---|---|
| `Nat : Type 0` | 可以 | 可以，`u = 0` |
| `Type 0 : Type 1` | 不可以 | 可以，`u = 1` |

关键区别在于：Universe Level 是固定的，还是可以在不同调用中独立实例化。
##### Lean 是否自动使用 Universe Polymorphism？
Lean 不需要像 Rocq 一样显式开启 `Polymorphic` 模式。例如：
```lean
def myId (A : Type u) (x : A) : A := x
```
在默认 `autoImplicit = true` 的情况下，Lean 会自动将 `u` 识别为 Universe Parameter，相当于：
```lean
def myId.{u} (A : Type u) (x : A) : A := x
```
但是必须显式使用 `Type u`，不能认为：
```lean
def myId (A : Type) (x : A) : A := x
```
也会自动成为 Universe Polymorphic，因为这里的 `Type` 就是固定的 `Type 0`。
## 3. Universe Polymorphism 和 Cumulativity 的区别
- 这是 Lean 和 Rocq Universe System 的重要区别。两者解决的是不同的问题。
##### 3.1 Universe Polymorphism：允许选择不同的 Universe Level
```lean
def polyId.{u} (A : Type u) (x : A) : A := x

# 默认情况下，Lean 会自动把 u 识别为 Universe Parameter。
def polyId (A : Type u) (x : A) : A := x
```
每次调用可以选择不同的 `u`：`u = 0, u = 1, u = 2`
##### 3.2 Universe Cumulativity：允许低 Level 的类型用于高 Level
在 Rocq 中，如果 `A : Type@{u}`, 并且满足：
$$
u \leq v
$$
那么通过 Cumulativity，可以在需要 `Type@{v}` 的位置使用 `A`。

但是 Lean 不支持这种一般性的隐式 Universe 提升。例如：
```lean
def promote.{u} (A : Type u) : Type (u + 1) :=
  A
```
这无法通过 Lean Type Checking，因为 Body `A` 的类型是 `Type u`，而函数承诺返回 `Type (u+1)`。
即使满足 `u ≤ u+1`，Lean 也不会自动将 `A` 提升到更高 Universe。
如果需要显式提升，可以使用 `ULift`：
```lean
def promote.{u} (A : Type u) : Type (u + 1) :=
  ULift.{u + 1} A
```
`ULift` 会构造一个包装原类型的新类型，而不是直接将 `A` 视为更高 Universe 的成员。

| 概念 | 作用 | Lean 是否支持 |
|---|---|---|
| Monomorphism | 定义使用固定的 Universe Levels | 支持 |
| Polymorphism | 不同调用可以实例化不同的 Levels | 支持 |
| Cumulativity | 较低 Universe 的类型直接用于较高 Universe | 不支持一般性的隐式提升 |
| Explicit Lifting | 使用 `ULift` 构造更高层级的包装类型 | 支持 |

## 4. Lean 的 declaration可以有多个 Universe Parameters 吗？
可以，而且非常常见。例如 Lean 中的 `Prod`：
```lean
Prod.{u, v}
  (A : Type u)
  (B : Type v) :
  Type (max u v)
```
它接受两个类型，且两个类型可以位于不同的 Universe Levels。
例如：
```lean
A : Type 0
B : Type 2
```
那么：
```lean
Prod A B : Type 2
```
- 这里的 `max u v` 是 Lean Universe Level Expression，表示新生成的 Product Type 所属的 Universe。
- 但这不是 Cumulativity，因为 Lean 并没有把原来的 `A : Type 0` 直接提升到 `Type 2`，而是根据 `Prod` 的定义生成一个新的类型。
Lean 能通过 Level Expressions 表达不同 Universe Levels 之间的关系，但不能直接实现 Rocq 的所有 Cumulative Universe 行为。
## 5. 为什么 Lean 仍然大量使用 Monomorphic？
因为大部分普通函数并不需要跨 Universe Levels 使用。例如：
```lean
def square (n : Nat) : Nat :=
  n * n

def isEven (n : Nat) : Bool :=
  n % 2 == 0

def sumList (xs : List Nat) : Nat :=
  xs.foldl (· + ·) 0
```
这些定义都不需要 Universe Parameters。

| 定义 | Universe 类型 | 原因 |
|---|---|---|
| `Nat.add` | Monomorphic | 只涉及固定的 `Nat` |
| `square` | Monomorphic | 只处理自然数 |
| `monoId` | Monomorphic | 输入类型限定在 `Type 0` |
| `List` | Polymorphic | 可以构造不同 Universe 的列表 |
| `List.map` | Polymorphic | 输入和输出元素类型可以位于不同 Universe |
| `Prod` | Polymorphic | 支持两个独立 Universe Parameters |
| `polyId` | Polymorphic | 可以接受不同层级的 `Type u` |

## 6. Rocq 和 Lean 的 Universe Polymorphism 有什么区别？
对于 Rocq → Lean Translation，这个区别尤其重要。
##### 6.1 Rocq Monomorphic Global Universe
假设 Rocq 中有：
```coq
Definition id1 (A : Type) (x : A) : A := x.
```
默认 Monomorphic 时，Rocq 会为 `Type` 创建一个 Global Universe Level，例如 `id1.u0`。
需要注意，Rocq 的 Monomorphic Global Universe 并不等于 Lean 中固定的 `Type 0`。
Rocq 中的 Global Level 可能具有 Universe Constraints，并且通过 Cumulativity 允许较低层级的类型作为参数使用。

但是 Lean 中：
```lean
def id1 (A : Type) (x : A) : A := x
```
明确表示：
```lean
A : Type 0
```
如果翻译成：
```lean
def id1.{u} (A : Type u) (x : A) : A := x
```
- 虽然目标定义更加通用，但这也改变了 Rocq 原始 Monomorphic Global Universe 的实例化方式。
##### 6.2 Rocq Polymorphic Definition
对于：
```coq
Polymorphic Definition id2
  (A : Type) (x : A) : A := x.
```
则可以更自然地翻译为：
```lean
def id2.{u} (A : Type u) (x : A) : A := x
```
因为两者都支持在不同调用中实例化 Universe Parameters。
##### 6.3 项目中的 `length.{u}`
例如，当前 Rocq → Lean 项目生成的：
```lean
def Rocq.Corelib.Init.Datatypes.length.{u} :
  (A : Sort u) →
  Rocq.Corelib.Init.Datatypes.list.{u} A →
  Rocq.Corelib.Init.Datatypes.nat := ...
```
这是一个 Universe Polymorphic Definition。这里的 `u` 可以在不同调用中实例化，因此 `length` 能够接受不同 Universe Levels 的元素类型。
特别需要注意，Lean 中的 `Sort u` 和 `Type u` 并不相同：
$$
\texttt{Type u} = \texttt{Sort (u+1)}
$$

| 输入 A | A 所属的 Sort | 若要求 `A : Type u` | 若要求 `A : Sort u` |
|---|---|---|---|
| `Nat` | `Type 0 = Sort 1` | `u = 0` | `u = 1` |
| `Type 0` | `Type 1 = Sort 2` | `u = 1` | `u = 2` |
| `P : Prop` | `Prop = Sort 0` | 不适用 | `u = 0` |

- 因此，`length.{u}` 中的 `u` 表示输入类型 `A` 所属的完整 Sort Level，而不是 `Type u` 中的 Universe 参数。
无论输入类型属于哪个 Universe，`length` 的返回类型始终是翻译得到的 `Rocq.Corelib.Init.Datatypes.nat`。
## 7. 总结
Lean 中需要区分三个概念：
1. Monomorphic Definition：不需要 Universe Parameters，使用固定的 Universe Levels，例如 `Nat.add` 和 `square`。
2. Polymorphic Definition：声明包含 Universe Parameters，可以在不同调用中独立实例化，例如 `List`、`Prod` 和 `polyId`。
3. Universe Cumulativity：允许较低 Universe 的类型直接在较高 Universe 使用。Rocq 支持这种机制，但 Lean 不支持一般性的隐式 Cumulativity。
对于 Rocq → Lean Translation，生成 `def f.{u}` 本身并不困难，因为 Lean 原生支持 Universe Polymorphism。
真正的困难在于：Rocq 的 Monomorphic Global Universe 可以通过 Cumulativity 接受不同层级的输入，而 Lean 即使支持 Universe Parameters，也不能直接表达这种隐式的 Universe 提升。
因此，一些 Rocq Declaration 即使语法结构简单，在翻译到 Lean 时仍可能遇到 Universe Constraints、Level Unification 和 Generality Preservation 等问题。
参考：[Lean Language Reference — Universes](https://lean-lang.org/doc/reference/latest/The-Type-System/Universes/)

## Lean 中的 Universe Level：何时固定，何时随 Input Type 实例化？
如果希望 Lean 中同一个 Definition 能够接受处于任意 Universe Level 的 Input，那么它就需要支持 Universe Polymorphism。
但需要区分两个概念：
- Type Polymorphism：支持不同的 Input Type。
- Universe Polymorphism：支持位于不同 Universe Levels 的 Input Type。
#### Monomorphic：可以接受不同 Type，但 Universe 固定
例如：
```lean
def myId (A : Type) (x : A) : A := x
```
Lean 中的 `Type` 默认是 `Type 0`，因此等价于：
```lean
def myId (A : Type 0) (x : A) : A := x
```
这个 Definition 可以接受不同的 `Type 0` 类型：
```lean
#check myId Nat 3
#check myId Bool true
```
但是不能接受：
```lean
-- myId (Type 0) Nat  -- 不可以
```
原因是 `Type 0 : Type 1`，而 `myId` 要求 `A : Type 0`。
因此，Monomorphic Definition 可以具有 Type Polymorphism，但不能在不同调用中独立改变其 Universe Level。
#### Polymorphic：Universe 随 Input 实例化
如果定义为：
```lean
def polyId.{u} (A : Type u) (x : A) : A := x
```
那么不同调用可以使用不同的 Universe Instances：
```lean
#check polyId Nat 3
-- u = 0

#check polyId (Type 0) Nat
-- u = 1

#check polyId (Type 1) (Type 0)
-- u = 2
```
`u` 是 Universe Parameter，每次调用都可以独立实例化，通常由 Lean Type Checking 自动推断。
而且，在默认开启 `autoImplicit` 的情况下，不需要显式写出 `.{u}`：
```lean
def polyId (A : Type u) (x : A) : A := x
```
Lean 会自动把 `u` 作为 Universe Parameter，因此这仍然是 Universe Polymorphic Definition。
####  与 Rocq 的关键区别

| 特性 | Rocq Monomorphic | Lean Monomorphic | Lean Polymorphic |
|---|---|---|---|
| Universe 在声明层面确定 | 是 | 是 | 否，声明使用 Universe Parameters |
| 接受不同 Input Type | 可以 | 可以 | 可以 |
| 每次调用独立实例化 Universe | 不可以 | 不可以 | 可以 |
| 利用 Cumulativity 接受较低 Universe 的类型 | 可以 | 不可以 | 不可以，但可以选择匹配的 Universe Instance |

需要注意，Rocq Monomorphic 使用的 Global Universe Level 不一定是固定的具体数字，但它属于全局声明，不能像 Polymorphic Universe Parameter 一样在每次调用时独立实例化。

### 对 Rocq → Lean Translation 的影响
如果希望翻译后的 `id` 能够在不同 Universe Levels 上使用，最自然的 Lean 表示是：
```lean
def Rocq.id.{u} (A : Type u) (x : A) : A := x
```
但是，如果源 Rocq `id` 是 Monomorphic，这种翻译实际上将原本共享的 Global Universe Level 转换成了可以独立实例化的 Universe Parameter。
虽然这提高了 Lean Declaration 的 Universe Polymorphism，但不一定严格保留源 Rocq Declaration 的 Universe 语义。
因此，翻译器还需要通过 Universe Interface Checks，验证目标 Universe Parameters 的使用方式是否符合源声明的 Universe Constraints 和 Generality Requirements。
核心区别是：**Monomorphic 可以支持不同的 Input Type，但只有 Universe Polymorphic 才能让同一个 Definition 在不同调用中独立实例化 Universe Levels。**