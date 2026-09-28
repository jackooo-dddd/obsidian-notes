如果已经有`PR is proved AND PL is proved`, 或者`hR : PR, hL : PL`, 那么可以很“平凡”地证明`PR <-> PL`
```coq
Theorem bad_correspondence : PR <-> PL.
Proof.
  split.
  - intro _. exact hL.
  - intro _. exact hR.
Qed.
```
- 这里 `PR -> PL` 根本没有利用 `PR`，只是直接返回已经存在的 `hL`；反方向也一样。所以虽然形式上得到了$PR \leftrightarrow PL$.  但这个证明没有说明 PR 和 PL 的结构或语义存在对应关系。更准确地说，并不是 `PR` 这个 proposition “等于 True”，而是因为它已经有 proof，所以我们已经知道它成立。

#### 真正需要验证的是什么？
```text
parameter correspondence
definition correspondence
hypothesis correspondence
operator correspondence
        ↓
拆解 theorem statement 的结构
        ↓
      PR ↔ PL
```
**不能利用 source theorem 和 target theorem 自己已经有 proof 这个事实**，而应该从底层 correspondence 独立推出两边 statement 的 equivalence。

#### 例子：`completion_monotonic`
假设两边的 theorem statement 分别是：
```text
PR :=
∀ t u,
  t ≤ u →
  completed_by_R j t = true →
  completed_by_R j u = true
```

```text
PL :=
∀ t u,
  t ≤ u →
  completed_by_L j t = true →
  completed_by_L j u = true
```

一个有意义的 correspondence proof 应该证明
```text
tR ~ tL
uR ~ uL
   ↓
(tR ≤ uR) ↔ (tL ≤ uL)

completed_by_R j tR
        ↔
completed_by_L j tL

completed_by_R j uR
        ↔
completed_by_L j uL
   ↓
整个 PR ↔ PL
```

所以`apply ar_forall_nat_correspondence, apply ar_imp_correspondence, exact (svc_bool_truth_correspondence ...)...`是在按照 theorem statement 的结构，一层一层证明:
```text
forall correspondence
→ implication correspondence
→ operator correspondence
→ predicate correspondence
→ whole theorem correspondence
```
#### 为什么 PR、PL 都是 theorem 仍然可以验证？
一个 theorem 可以分成statement和proof
```text
Theorem completion_monotonic :
  forall t u, ... .
  
statement:
  forall t u, ...

proof:
  completion_monotonic : forall t u, ...
```
correspondence 验证真正比较的是`statement_R  vs  statement_L`
而不是使用`completion_monotonic_R, completion_monotonic_L` 本身作为 proof 来构造 equivalence。
因此这两个 audit 条件非常关键：
```text
source_theorem_dependency = false
target_theorem_dependency = false
```
它们表示 certificate 没有依赖左右 theorem 已经被证明这个事实来制造$PR \leftrightarrow PL$

## 核心区别

```text
情况 A：平凡 equivalence

PR 已证明
PL 已证明
   ↓
PR ↔ PL

没有验证语义结构
```

```text
情况 B：有验证意义的 correspondence

PR 的内部结构
   ↓
底层 correspondence
   ↓
PL 的内部结构
   ↓
PR ↔ PL

真正验证 translation correspondence
```

所以，**仅仅看到 `PR ↔ PL` 这个结论还不够，还必须检查这个 equivalence 是怎么证明出来的。**

真正有说服力的标准是：

$$
\boxed{
\begin{aligned}
&\text{不依赖 source theorem proof 和 target theorem proof，}\\
&\text{而是由底层 correspondence 独立证明 } PR \leftrightarrow PL
\end{aligned}
}
$$

这也是 `source_theorem_dependency = false` 和 `target_theorem_dependency = false` 在 certificate 中非常重要的原因。