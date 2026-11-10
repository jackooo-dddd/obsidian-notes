在 Rocq → Lean 的 `statement-only` 模式中，Exporter 判断一个 Declaration 是否属于 `statement_only`，并不是根据源码使用了 `Theorem` 还是 `Definition` 关键字，而是根据其 Type 是否属于命题层（`Prop` / `SProp`）。
对于普通 Definition，即使它的返回类型不是命题，Body 内部仍然可能包含 Proof Subterms。这些证明会在 Statement Preparation 阶段被提取为独立的 Obligations。
### 1. Proof-valued Declaration：`statement_only`
例如 Rocq 中：
```coq
Theorem add_zero : forall n : nat, n + 0 = n.
Proof.
  ...
Qed.
```
它的类型是：
```coq
add_zero : forall n : nat, n + 0 = n
```
由于这个 Type 属于 `Prop`，Exporter 会：
- 保留 Type AST，即需要证明的 Statement。
- 不导出原始 Proof Body。
- 设置 `body_state = "statement_only"`。

即使使用 `Definition`，只要它的类型属于命题层，也会采用同样的处理方式：
```coq
Definition my_proof : 1 = 1 := eq_refl.
```
因此，`statement_only` 的判断依据是 Declaration 是否为 Proof-valued，而不是声明使用的关键字。

### 2. 普通 Definition：提取 Proof Obligations
考虑：
```coq
Definition packed (n : nat) : {m : nat | m = n} :=
  exist _ n (eq_refl n).
```
这里 `{m : nat | m = n}` 是一个 `sig` 数据类型，属于 `Type`，而不是 `Prop`。因此，Exporter 会尝试保留这个 Definition 的 Body。
但 Body 中包含：
```coq
eq_refl n
```
这是一个 Proof Subterm，用于证明 `n = n`。因此，Statement Preparation 会将它提取为独立的 Obligation：
```coq
packed__rocq2lean_obligation_1 :
  forall n : nat, n = n
```
然后用 Obligation 的引用替换原来的 Proof：
```coq
packed n :=
  exist _ n (packed__rocq2lean_obligation_1 n)
```
这样，Definition 的计算逻辑得以保留，而原本包含的证明被转化为后续需要完成的 Proof Task。

### 3. 两者的核心区别

| | `statement_only` | Proof Obligation Extraction |
|---|---|---|
| Declaration 类型 | Proof-valued（`Prop` / `SProp`） | 普通数据或函数类型 |
| 原始 Proof | 整个 Body 是证明 | Proof Subterm 包含在 Body 内部 |
| Exporter 处理 | 只保留 Statement | 保留计算 Body，提取内部 Proof |
| `body_state` | `statement_only` | 原 Definition 保留相应 Body State，新生成的证明标记为 `obligation` |
| 后续任务 | 证明原 Declaration 的 Statement | 证明提取出的 Obligations |

最重要的区别是：`statement_only` 处理整个 Declaration 本身就是证明的情况；Proof Obligation Extraction 则处理普通 Definition 内部包含证明的情况。两者都不会直接翻译原始 Proof Body，但会保留明确的证明目标。

![[Pasted image 20261024094548.png]]