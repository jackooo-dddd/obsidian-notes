在 Rocq 中，Opaque 既可以用于 Definition，也可以用于 Theorem。它描述的是 Constant 的 Body 是否允许被 Kernel 展开，而不是这个 Constant 属于哪种 Declaration。

### 1. Opaque Theorem

例如：

```coq
Theorem my_theorem : 1 = 1.
Proof.
  reflexivity.
Qed.
```

这里：
- Type：`1 = 1`，属于 `Prop`。
- Body：证明 `1 = 1` 的 Proof Term。
- Opacity：Opaque，因为使用了 `Qed`。

大多数使用 `Qed` 结束的 Theorem 默认都是 Opaque。如果改用 `Defined`，则会保留 Proof Body 的透明性。

### 2. Opaque Definition

例如：

```coq
Definition x : nat.
Proof.
  exact 3.
Qed.
```

这里 `x` 同样是 Opaque，但它的 Body 是普通数据 `3`，而不是 Proposition 的证明。因此，Opaque 不一定意味着这个 Constant 是 Theorem。

### 3. 在 Rocq → Lean 项目中的分类

| Declaration | Opaque? | 项目中的分类 |
|---|---|---|
| `Theorem ... Qed.` | Yes | `statement_only` |
| `Theorem ... Defined.` | No | `statement_only` |
| `Definition x : nat := 3.` | No | `transparent` |
| `Definition x : nat. ... Qed.` | Yes | `opaque_data` / `opaque_interface` |

项目中的处理主要取决于 Declaration 是否为 Proof-valued：

- Opaque Theorem：Body 是 Proof，项目只保留 Statement，不翻译原始 Proof Body。
- Opaque Data：Body 是数据或函数的具体实现，项目需要尝试导出并机械翻译这个 Body，同时保留其 Opaque 属性。

因此，Opaque 不仅用于 Definition，也可以用于 Theorem。只是我们的项目需要特别处理非 Proof-valued 的 Opaque Constant，所以才引入 `opaque_data` 和 `opaque_interface` 两种分类。

最重要的是区分两个维度：Proof-valued / Data-valued 决定 Declaration 表示证明还是普通数据；Transparent / Opaque 决定 Kernel 是否允许展开它的 Body。