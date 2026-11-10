在 Rocq 中，直接写 `Type`，并不意味着默认 `Type 0`，而是让 Rocq 自动推断它的 Universe Level。
- 可以把 `A : Type` 理解成 `A : Type@{u}`
- 这里的 `u` 是 Rocq 自动引入、需要根据上下文确定的 Universe Level
### Rocq 中不同的 Type

|写法|含义|
|---|---|
|`Set`|最低的计算性类型宇宙，即 `Type@{0}`|
|`Type@{u}`|显式指定 Universe Level `u`|
|`Type`|由 Rocq 自动推断 Universe Level|

### 回到 `list`
```
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```
这里的两个 `Type` 不一定从一开始就具有相同的 Universe Level。概念上可以先表示为：
```
Inductive list (A : Type@{u}) : Type@{v} := ...
```
- 对于`list`，Rocq 默认通常会启用 Template Polymorphism，因此 `u` 不是固定的全局 Universe Level，而是可以随着输入类型 `A` 改变的。
##### 在 Template Polymorphism 下
```
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```
Rocq 实际上可以将其表示为类似：
```
list : Type@{u} -> Type@{max(Set, u)}
```
这里：
- `u`：表示输入类型 `A` 所在的 Universe Level，可以在不同使用中变化。
- `v`：表示结果 `list A` 所在的 Universe Level，并不是完全独立的变量，而是由 `u` 决定。
- 固定的是它们之间的关系，而不是每次使用时 `u` 的具体值。
例如：

| 使用                | 输入 `A` 的 Universe | `list A` 的 Universe |
| ----------------- | ----------------- | ------------------- |
| `list nat`        | `Set`             | `Set`               |
| `list (Type@{i})` | `Type@{i+1}`      | `Type@{i+1}`        |


## Definition 中 `Type` 的 Universe Level（Non-template）
对于普通的 `Definition`，如果没有显式声明 `Polymorphic`，默认采用 Monomorphic Universe。
- Rocq 会为声明中未指定层级的 `Type` 自动创建或推断 Universe Level。
- 这些 Levels 属于全局 Universe Context，而不是每次调用 Definition 时重新创建的参数。
- 不同的 Definition 不一定共享同一个 Global Universe Level，每个声明都可能引入自己的 Levels。
- Level 有固定的全局标识，但不一定被确定为具体数字，而是受到 Universe Constraints 约束。
### 1. Monomorphic Definition：使用 Global Universe Level
```coq
Definition id (A : Type) (x : A) : A := x.
```
概念上可以展开为：
```coq
Definition id (A : Type@{u}) (x : A) : A := x.
```
其中 `u` 是 Rocq 为这个声明引入的 Monomorphic Universe Level，具有以下特点：
- `u` 属于全局 Universe Environment。
- `u` 不会因为每次调用 `id` 而独立实例化。
- `u` 不一定对应某个固定数字，例如 `0` 或 `1`，而是受到全局 Universe Constraints 的限制。
例如：
```coq
id nat 3
id bool true
```
两个调用都可以成立，因为：
```coq
nat  : Set
bool : Set
```
Rocq 支持 Universe Cumulativity，因此处于较低 Universe Level 的类型，可以在满足约束时传入要求较高 Universe Level 的参数位置。
这里虽然传入了不同的类型，但 `id` 自己的全局 Universe Level `u` 并没有改变。
如果传入：
```coq
A : Type@{v}
```
那么调用 `id A x` 需要满足：
$$
v \leq u
$$
Rocq 可能因此为全局 `u` 增加约束，但这些约束作用于共享的 Global Level，而不是每次调用独立创建一个新的 `u`。
### 2. Polymorphic Definition：使用 Universe Parameters
如果显式声明： 
```coq
Polymorphic Definition poly_id
    (A : Type) (x : A) : A := x.
```
那么它的 Universe Level 就是可以实例化的参数，概念上表示为：
```coq
poly_id@{u} :
  forall (A : Type@{u}), A -> A
```
不同调用可以使用不同的 Universe Instances：
```coq
poly_id@{u1} A1 x1
poly_id@{u2} A2 x2
```
其中 `u1` 和 `u2` 可以不同。Rocq 也可以根据实际参数自动推断这些 Universe Instances，不一定需要手动显式指定。
### Monomorphic 与 Polymorphic 的区别

| 特性 | Monomorphic Definition | Polymorphic Definition |
|---|---|---|
| `Type` 的 Universe Level | Global Universe Level | Universe Parameter |
| Level 是否固定 | 使用共享的全局标识 | 每次引用可以独立实例化 |
| Universe Constraints | 保存在全局 Universe Context | 作为声明的 Universe Context 随实例化应用 |
| 能否接受较低 Universe 的输入 | 可以，通过 Cumulativity | 可以，通过 Cumulativity |
| 不同调用能否使用不同 Universe Instances | 不可以 | 可以 |

需要注意，如果显式开启：
```coq
Set Universe Polymorphism.
```
那么后续不写 `Polymorphic` 的普通 Definition 也可以默认采用 Universe Polymorphism。
