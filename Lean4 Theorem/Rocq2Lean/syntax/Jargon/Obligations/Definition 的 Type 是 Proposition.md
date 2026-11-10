Rocq 中，如果一个 `Definition` 的 Type 是 Proposition，而它的 Body 是这个 Proposition 的 Proof，那么它本质上就和 `Theorem` 非常相似。
例如：
```
Definition my_proof : 1 = 1 := eq_refl.

Theorem my_theorem : 1 = 1.
Proof.
  reflexivity.
Qed.
```
这两个 Declaration：
- Type 都是 `1 = 1`，这是一个 `Prop`。
- Body 都是证明 `1 = 1` 的 Proof Term。
- 都会作为 Constant 存储在 Rocq 的 Environment 中。
### 1. 最主要的区别：Transparency

|特征|`Definition my_proof`|`Theorem my_theorem`|
|---|---|---|
|Type|`1 = 1`|`1 = 1`|
|Body|Proof Term|Proof Term|
|是否是 Proof-valued|Yes|Yes|
|默认透明性|Transparent|Opaque（使用 `Qed`）|
|Kernel 能否展开 Body|可以|不可以|

这里的区别并非严格来自 `Definition` 和 `Theorem` 关键字，而主要来自结束证明的方式：
- `Qed`：Opaque
- `Defined`：Transparent
### 2. 在我们的翻译项目里
这两个都会被归类为：
```
body_state = "statement_only"
```
因为 Exporter 判断的是 Constant 的 Type 是否为 Proposition，而不是源代码使用了 `Definition` 还是 `Theorem`。
所以两者都会只保留 Statement，而不导出原本的 Proof Body。

### 3. 还有一个很容易混淆的地方
对比：
```
Definition P : Prop := 1 = 1.
Definition p : P := eq_refl.
```
- `P` 的 Type 是 `Prop`，但 `P` 的 Body 是一个命题，因此它不是 Proof-valued Constant。
- `p` 的 Type 是 `P`（也就是 `1 = 1`），Body 是一个证明，因此它是 Proof-valued Constant。
总结： 在 Rocq 的类型论层面，Theorem 本质上也可以看作一个返回 Proof 的 Constant。我们的翻译器正是基于这一点，将 Proof-valued Definitions 和 Theorems 统一处理为 `statement_only`。