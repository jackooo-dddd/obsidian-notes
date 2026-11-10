普通函数返回一个值，而类型族返回一个类型。
### 一个简单的 Rocq 例子
```
Definition F (A : Type) : Type := A -> A.
```
- 输入 `A`：一个类型，例如 `nat`、`bool`。
- 输出 `A -> A`：也是一个类型。
- 因此，`F` 是一个 Type Family。
例如：
```
F nat    (* nat -> nat *)
F bool   (* bool -> bool *)
```
注意，`F nat` 返回的不是一个具体函数，而是函数的类型。
### 为什么 Type Family 会涉及 Universe？
考虑：
```
Polymorphic Definition F (A : Type) : Type := A -> A.
```
概念上，我们可以为其中的 `Type` 标出 Universe：
```
F : forall (A : Type@{u}), Type@{v}
```
这里翻译器需要确定：
- `u`：输入类型 `A` 所处的 Universe。
- `v`：返回类型 `A -> A` 所处的 Universe。
- `u` 和 `v` 之间需要满足什么约束。
由于 `A -> A` 至少可以位于 `A` 所处的 Universe，因此需要满足 `u ≤ v`。在允许的情况下，可以选择 `v = u`。
### 与普通返回类型有什么区别？

|情况|Rocq 示例|返回的东西|
|---|---|---|
|普通函数|`Definition id (A : Type) (x : A) := x.`|一个值 `x : A`|
|类型族|`Definition F (A : Type) : Type := A -> A.`|一个类型 `A -> A`|
|归纳类型族|`list A`|一个类型，例如 `list nat`|

- 类型族还可以依赖数值索引，例如 `Vector A n`，其中不同的 `n` 对应不同长度的向量类型。
回到 Constant Translation： 类型族之所以需要单独考虑，是因为一个 Constant 的返回结果可能本身就是类型，而不是普通值。翻译器不仅需要正确翻译输入参数的 Universe，还必须确定输出类型的 Universe，以及两者之间的约束。
另外，类型族不一定是 Universe Polymorphic 的；它是否能在不同引用处独立实例化 Universe，仍然取决于 Rocq 声明的 Universe 模式。