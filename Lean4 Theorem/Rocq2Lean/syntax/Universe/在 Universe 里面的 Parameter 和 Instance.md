## Universe Parameter、Universe Instance 和 Universe Metavariable

Universe Parameter 和 Universe Instance 在 Rocq 和 Lean 中都存在，并不是 Lean 独有的概念。它们的核心区别是：Universe Parameter 是定义函数时声明的 Universe 形式参数；Universe Instance 是引用函数时为这些参数提供的具体 Universe Levels；Universe Metavariable 则是翻译或类型推断过程中使用的临时待求解变量。

## 1. Universe Parameter（定义时的参数）

例如 Lean 中：

```lean
def id.{u} (A : Type u) (x : A) : A := x
```

这里的 `u` 就是 Universe Parameter，表示 `id` 可以用于不同 Universe Levels 的类型，具体使用哪个 Level 由调用时决定。注意，`u` 不是固定数字，也不是待求解的 Metavariable，而是定义中声明的符号参数。

## 2. Universe Instance（调用时的实例）

假设调用前面定义的 `id`：

```lean
id.{0} Nat 3
id.{1} (Type 0) Nat
```

第一行使用 Universe Instance `{0}`，即把定义中的 `u` 实例化为 0，因为 `Nat : Type 0`；第二行使用 `{1}`，因为 `Type 0 : Type 1`。所以同一个 Universe-Polymorphic Function 可以在不同的调用中使用不同的 Universe Instances。

| 概念 | 定义时 | 调用时 |
|---|---|---|
| Universe Parameter | `u` | — |
| Universe Instance | — | `0`、`1`、`v` 等 |
| 示例 | `id.{u}` | `id.{0}` |

## 3. Universe Metavariable（求解过程中的临时变量）

假设翻译器正在处理：

```lean
fun (A : Type v) (x : A) =>
  id.{?k} A x
```

这里 `u` 是 `id` 定义时的 Universe Parameter，`?k` 是本次调用使用的临时 Universe Metavariable，而 `v` 是当前参数 `A` 所在的 Universe Level。Lean Type Checker 根据 `id` 的参数类型和实际输入 `A : Type v`，可以推断：

$$
?k=v
$$

因此，求解后的调用为：

```lean
id.{v} A x
```

这里 `{v}` 就是最终的 Universe Instance。也就是说，Universe Metavariable 只是推断过程中的临时变量，求解完成后才确定实际使用的 Universe Expression。

## 4. Rocq 中也有 Universe Parameters 和 Instances 吗？

有，尤其是在 Universe Polymorphism 中。例如：

```coq
Polymorphic Definition id (A : Type) (x : A) : A := x.
```

Rocq 会为 `id` 引入 Polymorphic Universe Level，例如 `u`，每次引用时可以使用不同的 Universe Instance：

```coq
id@{Set} nat 3
```

这里 `Set` 对应最低的 Predicative Universe Level。需要注意，对于普通 Monomorphic Definition，Rocq 使用的是声明时确定的 Global Universe Levels，而不是每次引用时都能自由实例化的 Universe Parameters。

## 5. 在 Rocq2Lean 项目中的特殊情况

Rocq 的 Monomorphic Global Universe Levels 在翻译过程中，也可能被转换成 Lean Universe Parameters。例如源 Rocq：

```coq
Definition id (A : Type) (x : A) : A := x.
```

翻译后的 Lean Declaration 可能示意为：

```lean
def Rocq.id.{u} (A : Type u) (x : A) : A := x
```

这里 Lean 的 `u` 是目标 Declaration 的 Universe Parameter，但它对应的是源 Rocq 中的 Monomorphic Global Universe Level。因此，虽然在 Lean 中表现为可实例化的 Universe Parameter，也不能直接认为它与 Rocq 原始的 Universe-Polymorphic Definition 具有完全相同的实例化自由度。翻译器还需要根据 Source Universe Constraints 和 Global Universe Facts，检查引用时的 Universe Instances 是否合法。

## 总结

| 概念 | 作用 | 例子 |
|---|---|---|
| Universe Parameter | 定义时声明的形式参数 | `id.{u}` |
| Universe Metavariable | 翻译或类型推断时的临时未知 Level | `id.{?k}` |
| Universe Instance | 引用时实际传入的 Universe Expression | `id.{0}`、`id.{v}` |

最重要的区别是：**Parameter 是定义时的形式参数，Metavariable 是求解过程中的临时变量，Instance 是引用时最终使用的 Universe Level。** 对于 Rocq2Lean，还必须额外考虑源 Rocq 的 Monomorphic Global Levels 与 Lean Universe Parameters 之间的语义差异。