## 1. Unfold（展开）与 Definitional Equality
在 Rocq 中，每个 Constant 都有一个 Name 和 Type，而 Definition 通常还包含 Body。例如：
```coq
Definition x : nat := 3.
Definition y : nat := x + 1.
```

| 部分 | 内容 | 含义 |
|---|---|---|
| Name | `x` | Constant 的名字 |
| Type | `nat` | `x` 是一个自然数 |
| Body | `3` | `x` 的具体定义 |

当 Rocq Kernel 需要计算 `y` 时，可以进行：
```text
y
↓ 展开 y 的 Body
x + 1
↓ 展开 x 的 Body
3 + 1
↓ 计算加法
4
```
其中，将 Constant `x` 替换为其 Body `3` 的过程称为 Unfold，在类型论中属于 δ-reduction（Delta Reduction）。
Unfold 并不等于执行整个函数，而是允许 Kernel 查看某个 Constant 的 Body，并利用它继续计算。
### 为什么 Kernel 需要 Unfold？
Rocq Kernel 不仅需要检查一个 Term 是否具有正确的 Type，还需要判断两个表达式是否 Definitionally Equal（定义相等）。
例如：
```coq
Definition x : nat := 3.
Definition test : x = 3 := eq_refl.
```
虽然 `eq_refl` 只能直接证明一个值等于自身，但 Kernel 可以通过计算：
```text
x = 3
↓ Unfold x
3 = 3
```
发现两边 Definitionally Equal，因此接受 `eq_refl`。
所以，Unfold 是 Rocq Kernel 进行 Reduction 和 Definitional Equality Checking 的重要机制。

## 2. Transparent 与 Opaque 的区别
Opaque 描述的是 Constant 的透明性：Kernel 是否允许通过 δ-reduction 展开其 Body。
考虑两个 Declaration：
```coq
(* Transparent *)
Definition a : nat := 3.

(* Opaque *)
Definition b : nat.
Proof.
  exact 3.
Qed.
```
虽然 `a` 和 `b` 的 Body 都是 `3`，但它们具有不同的透明性：

| | Transparent `a` | Opaque `b` |
|---|---|---|
| Type | `nat` | `nat` |
| Body | `3` | `3` |
| Kernel 能否展开 Body | 可以 | 不可以 |
| Definitional Reduction | `a → 3` | `b` 保持不变 |

因此：
```coq
Definition test_a : a = 3 := eq_refl.
```
可以通过，因为 Kernel 能将 `a` 展开为 `3`。
但：
```coq
Fail Definition test_b : b = 3 := eq_refl.
```
会失败，因为 `b` 是 Opaque，Kernel 无法仅通过 Reduction 判断 `b` 和 `3` Definitionally Equal。
这不代表 `b = 3` 在数学上是假的，也不代表 `b` 没有 Body，只是 Kernel 不允许通过展开 Body 来证明它。
### 为什么可以使用 `Proof` 给普通数据赋值？
```coq
Definition b : nat.
Proof.
  exact 3.
Qed.
```
在 Rocq 的类型论中，普通数据和证明都是具有 Type 的 Term：
- `3 : nat`：`3` 是一个 `nat` 类型的 Term。
- `eq_refl : 3 = 3`：`eq_refl` 是一个命题证明，也是一个 Term。
因此，`Definition b : nat` 表示需要构造一个 `nat` 类型的 Term，而 `exact 3` 就是提供这个 Term。这里的 `Proof` 只是交互式构造 Term 的方式，并不意味着 `3` 是 Proposition 的证明。

最终透明性由结束方式决定：
```coq
(* Transparent *)
Definition a : nat := 3.

(* Opaque *)
Definition b : nat.
Proof.
  exact 3.
Qed.

(* Transparent *)
Definition c : nat.
Proof.
  exact 3.
Defined.
```
`Qed` 使 Definition 成为 Opaque，而 `Defined` 保持 Transparent。

## 3. 为什么需要 Opaque Data？
Opaque Data 是一个 Data-valued Constant，其 Body 不允许在 Kernel 的 Definitional Equality Checking 中展开。
```coq
Definition secret_number : nat.
Proof.
  exact 42.
Qed.
```
- 这里 `secret_number` 是一个 `nat` 类型的数据对象，而不是 Proposition 的证明。由于使用 `Qed`，它的 Body 是 Opaque。
Opaque Data 的主要意义有两个：控制计算开销，以及将实现与 Specification 分离。
### 3.1 避免不必要的计算
假设有一个复杂函数：
```coq
Definition complicated (n : nat) : nat :=
  (* complex computation *)
  ...
```
当其他 Declaration 使用 `complicated 100` 时，如果该函数是 Transparent，Kernel 在进行 Reduction 或 Conversion Checking 时可能需要展开复杂的 Body，从而产生较大的计算开销。
如果函数是 Opaque，Kernel 不会通过 δ-reduction 展开它，可以避免某些不必要的计算。
需要注意，这并不意味着 Opaque 一定让所有证明更快，因为某些依赖计算的证明可能反而无法直接完成。
### 3.2 隐藏实现，让其他证明依赖 Specification
考虑一个简单的平方函数：
```coq
Definition square (n : nat) : nat := n * n.
```
由于 `square` 是 Transparent，下面的证明可以直接成功：
```coq
Example test : square 3 = 9.
Proof.
  reflexivity.
Qed.
```
Kernel 可以计算：
```text
square 3 = 9
↓ 展开 square
3 * 3 = 9
↓ 计算乘法
9 = 9
```
但如果我们希望其他证明不直接依赖 `square` 的实现，就可以先证明它的 Specification，再将其设为 Opaque：
```coq
Definition square (n : nat) : nat := n * n.

Lemma square_spec (n : nat) :
  square n = n * n.
Proof.
  reflexivity.
Qed.

Opaque square.
```
此时，`square` 的 Body 仍然存在，但 Kernel 不再允许通过 δ-reduction 展开它。
因此 `Fail Definition test : square 3 = 9 := eq_refl.` 会失败，因为 `square 3` 无法直接化简成 `9`。但我们仍然可以使用之前证明的 `square_spec`：
```coq
Example test : square 3 = 9.
Proof.
  rewrite square_spec.
  reflexivity.
Qed.
```
证明过程为：
```text
square 3 = 9
↓ Rewrite using square_spec
3 * 3 = 9
↓ Reflexivity
9 = 9
```
这里有一个重要区别：
- `unfold square`：依赖 Kernel 直接展开 `square` 的 Body。
- `rewrite square_spec`：使用已经证明的 Propositional Equality，不需要展开 `square`。
如果未来修改 `square` 的实现，只要仍能证明相同的 Specification，依赖 `square_spec` 的其他证明就不必直接依赖原来的 Body。

此外，Opaque 不仅影响证明，也会影响普通的计算。例如，当我们计算 `square 3` 时，通常需要先将 `square` 展开为 `fun n => n * n`，再进行乘法运算。但将 `square` 标记为 Opaque 后，普通的 Reduction（例如 `cbv`、`cbn`）不会展开它，因此计算可能停留在 `square 3`，而无法进一步化简为 `9`。这并不意味着函数没有具体的计算结果，而是当前的 Reduction 过程不允许使用它的 Body。

因此，Opaque 的代价是限制了 Definitional Reduction：Kernel 仍然可以进行其他计算和 Type Checking，但不能随意通过展开这个 Opaque Function 来获得结果。如果需要确定函数的返回值，可以使用已经证明的 Specification，例如 `square_spec`，通过 Propositional Equality 推导结果，而不是直接依赖函数内部的计算。

### 3.3 Definitional Equality 和 Propositional Equality

上述例子体现了 Rocq 中两种不同的相等关系：

| | Definitional Equality | Propositional Equality |
|---|---|---|
| 含义 | 两个表达式可以通过允许的计算规则判断为相同 | 通过 Proof 证明两个表达式相等 |
| 典型方式 | Reduction、Unfold、`reflexivity` | `rewrite`、应用已证明的 Lemma |
| 是否需要 Proof Term | 类型检查中的 Conversion 不需要额外的等式证明 | 需要 Equality Proof |
| Opaque 的影响 | 不能通过展开该 Constant 的 Body 建立定义相等 | 仍可通过已有定理证明相等 |

因此，Opaque 限制的是 Definitional Equality Checking 中对该 Constant 的展开，而不是禁止证明关于这个 Constant 的性质。

## 4. Rocq → Lean 项目中的 Opaque Data
在我们的项目中，Constant 的分类涉及两个不同维度：
1. Proof-valued vs Data-valued：Constant 的 Type 是 Proposition，还是普通的数据或函数类型？
2. Transparent vs Opaque：Kernel 是否允许展开 Constant 的 Body？
例如：
```coq
(* Opaque Data *)
Definition x : nat.
Proof.
  exact 3.
Qed.

(* Opaque Theorem *)
Theorem t : 1 = 1.
Proof.
  reflexivity.
Qed.
```
两者都是 Opaque，但 `x` 是 Data-valued，而 `t` 是 Proof-valued。因此，Opaque 不等于 Theorem。
对于 Data-valued 的 Opaque Constant，Exporter 还需要判断其 Body 能否成功导出并通过 Statement Preparation，由此分成两种情况。

### 4.1 `opaque_data`：能够成功翻译 Body
例如：
```coq
Definition secret_number : nat.
Proof.
  exact 42.
Qed.
```
虽然 Rocq Kernel 不允许在普通 Reduction 中展开它，但 Exporter 可以尝试通过专门的接口读取其 Body。
如果成功取得并准备：
```text
Name    : secret_number
Type    : nat
Body    : 42
Opacity : opaque
```
那么翻译器可以生成：
```lean
opaque Rocq.secret_number : Nat := 42
```
这里即使已经成功翻译了 Body，也仍然使用 Lean `opaque`，因为需要保留源 Declaration 的不透明性，而不是擅自改变它的计算行为。

### 4.2 `opaque_interface`：无法成功翻译 Body

如果 Exporter 无法取得 Body，或者 Statement Preparation / Rocq Kernel Re-check 失败，那么只能得到：

```text
Name    : secret_number
Type    : nat
Body    : unavailable
Opacity : opaque
```

此时，翻译器知道这个 Constant 的 Type，但没有足够的信息机械翻译其实现。

因此只能保留 Type Interface，不能随意使用另一个 `Nat` 值替代原始 Body，也不能声称原 Definition 已经成功翻译。

| | `opaque_data` | `opaque_interface` |
|---|---|---|
| Rocq 中是否 Opaque | Yes | Yes |
| 是否知道 Type | Yes | Yes |
| Body 是否成功准备 | Yes | No |
| 是否能机械翻译 Body | Yes | No |
| Lean 中的处理 | 生成带 Body 的 `opaque` Declaration | 保留 Interface，不能声称实现已翻译 |

这一区分在 MathComp 中尤其重要。例如，一些 `reflect` 相关的证明对象虽然主要用于逻辑推理，但其类型属于 `Set`，因此会被分类为 Data-valued。它们的 Body 可能包含复杂的 Proof Terms，翻译器不能简单地把它们当成普通 `Prop` Theorem，只保留 Statement。

## 5. 总结

- Unfold：通过 δ-reduction 将 Constant 替换为其 Body，以便进一步计算。
- Transparent：允许 Kernel 展开 Body，适合需要 Definitional Reduction 的函数和数据。
- Opaque：禁止 Kernel 在普通 Conversion Checking 中展开 Body，但仍然可以使用 Constant，并通过已证明的 Specification 推导其性质。
- Opaque Data：一个 Data-valued 的 Opaque Constant，不一定是 Theorem 或 Proof。
- `opaque_data`：Exporter 成功准备 Body，可以翻译实现，同时保留不透明性。
- `opaque_interface`：无法成功准备 Body，只能保留 Type Interface。

