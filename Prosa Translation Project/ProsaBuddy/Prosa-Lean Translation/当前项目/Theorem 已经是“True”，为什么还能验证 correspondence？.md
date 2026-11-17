如果已有`PR is proved AND PL is proved`, 或者`hR : PR, hL : PL`, 那么显然 `PR <-> PL`
```coq
Theorem bad_correspondence : PR <-> PL.
Proof.
  split.
  - intro _. exact hL.
  - intro _. exact hR.
Qed.
```
- 这里 `PR -> PL` 根本没有利用 `PR`，只是直接返回已经存在的 `hL`；反方向也一样。所以虽然形式上得到了$PR \leftrightarrow PL$.  但这个证明没有说明 PR 和 PL 的结构或语义存在对应关系。
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
| Layer               | Rocq side                                                              | Lean/imported side                                                     | What correspondence proves                                                |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Theorem statement   | `PR`                                                                   | `PL`                                                                   | Goal is to prove $PR \leftrightarrow PL$                                  |
| Quantified time `t` | `tR`                                                                   | `tL`                                                                   | `tR ~ tL`                                                                 |
| Quantified time `u` | `uR`                                                                   | `uL`                                                                   | `uR ~ uL`                                                                 |
| Order condition     | `tR ≤ uR`                                                              | `tL ≤ uL`                                                              | $(tR \le uR) \leftrightarrow (tL \le uL)$                                 |
| Completion at `t`   | `completed_by_R j tR = true`                                           | `completed_by_L j tL = true`                                           | `completed_by_R j tR ↔ completed_by_L j tL`                               |
| Completion at `u`   | `completed_by_R j uR = true`                                           | `completed_by_L j uL = true`                                           | `completed_by_R j uR ↔ completed_by_L j uL`                               |
| Whole theorem       | `∀ t u, t ≤ u → completed_by_R j t = true → completed_by_R j u = true` | `∀ t u, t ≤ u → completed_by_L j t = true → completed_by_L j u = true` | Combine the lower-level correspondences to derive $PR \leftrightarrow PL$ |

所以`apply ar_forall_nat_correspondence, apply ar_imp_correspondence, exact (svc_bool_truth_correspondence ...)...`是在按照 theorem的结构进行correspondence证明
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

**仅仅看到 `PR ↔ PL` 这个结论还不够，还必须检查这个 equivalence 是怎么证明出来的。**
有说服力的标准是：
$$
\boxed{
\begin{aligned}
&\text{不依赖 source theorem proof 和 target theorem proof，}\\
&\text{而是由底层 correspondence 独立证明 } PR \leftrightarrow PL
\end{aligned}
}
$$

为了不依赖source theorem proof 和 target theorem proof，`source_theorem_dependency = false` 和 `target_theorem_dependency = false` 是两个非常关键的 audit 条件。
- 它们表示 certificate 在证明 $PR \leftrightarrow PL$ 时，没有直接依赖 source theorem 或 target theorem 已经存在的 proof，而是通过底层的 correspondence 独立推出两边statement 的对应关系。