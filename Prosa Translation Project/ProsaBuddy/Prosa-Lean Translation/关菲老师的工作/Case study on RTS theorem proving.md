Procedures
1. Case Study先从论文里提取Theorem，总共37个。
2.  用 Coq Prosa 表达论文定理。只提供theorem statement，没有完整 Coq proof。因此 Coq 文件的作用是提供一个参考 formal specification，而不是提供可直接翻译的 proof。
3. 把 Coq statement 翻译到 Lean Statement
4. 使用 Lean Prosa 尝试证明theorem
#### Case Study 和Dashboard 的区别
主 Prosa translation
- 输入官方 Prosa Coq library， Coq 中 theorem 已经有proof，翻译的任务只用把 statement 翻译到 Lean + 参考 Coq proof 重建 Lean proof。
- dashboard 中的 1,804 是原始 Prosa 已有的 Coq proofs。
Case Study
- 输入论文+手工写出的 Coq/Prosa statement+Admitted
- 任务是把 statement 翻译到 Lean + 利用 Lean Prosa 从头证明
- Case Study 比普通 translation 更接近真正的 theorem proving benchmark

#### Statement 翻译统计
37 个 Case Study 的 Coq theorem statement 被对应到 Lean statement 后，34 个通过自动审计，3 个存在潜在翻译问题。它们主要被标记为 `binder_shortfall`：Lean statement 中显式出现的变量、量词和前提数量明显少于 Coq 版本，可能有参数或条件被隐藏、合并或遗漏，需要人工核对。
#### Lean proof 统计
- 37 个 Lean theorem；
- 3 个被报告为已经填入 proof、没有 `sorry`；
- 34 个仍然使用 `sorry`；
- 0 个存在污染依赖。
报告列出的 3 个无 `sorry` theorem 是：
- `2007-RTSS-Theorem2`
- `2009-RTSS-Lemma1`
- `2014-RTCSA-Theorem3`
注意，这和“34 clean / 3 flagged”是两条不同维度：
- **34 clean / 3 flagged**：检查 statement 翻译。
- **3 proved / 34 sorry**：检查 proof 是否完成。
例如 `2009-RTSS-Lemma1` 可以同时是：
- statement：`flagged`
- proof：无 `sorry`
这表示 Lean 确实证明了某个 statement，但该 statement 是否完整忠实对应 Coq/论文定理仍需要人工检查。

Conclusion
- Case Study 共 37 个。statement 翻译结果是 **34 clean、3 flagged**。
- 原始 Coq theorem 全部是 `Admitted`，因此没有 Coq proof 被直接翻译；Lean proof 需要依靠 Lean Prosa 重新构造。
- 另一份报告声称 3 个 Lean proof 已完成、34 个仍有 `sorry`。












