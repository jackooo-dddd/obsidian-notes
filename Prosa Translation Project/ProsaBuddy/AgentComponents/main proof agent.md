| 角色                      | 主要负责什么                                                       |
| ----------------------- | ------------------------------------------------------------ |
| **主 prover agent**      | 理解 theorem、选择证明路线、决定需要哪些中间结论、编写 proof skeleton，以及最后的证明组合与修复。 |
| **`proof_plan` 工具**     | 接收主 prover 提交的计划，检查 DAG、目标、候选引理及前提来源，并将审查结果交给 workflow 记录。   |
| **`proof-workflow.ts`** | 保存当前计划及其状态，管理计划修订、提供当前计划的建议/主 prover 接下来应该做什么                |
### 主 prover 调用 `proof_plan` 的流程
#### 第一步：主 prover 提出准备怎样证明
`假设原始目标是证明 T。主 prover 考虑后提出：先从原始假设证明 A；再利用 A 和原始假设证明 B；最后由主 prover 利用 B，完成 T。其中 A、B 准备交给 lemma subagent。`
这时，A、B 是主 prover 提出的中间命题，还不是已经成立的事实。主 prover 将这些内容组织成 nodes、edges、formal_goal、depends_on、候选引理等字段，调用 proof_plan 工具。该工具接收的参数正是这类结构化计划。
#### 第二步：proof_plan 审查计划
proof_plan 工具检查主 prover 提交的内容，例如：DAG 有没有循环、依赖是否指向不存在的节点、提交的 theorem 和 root goal 是否对应当前绑定的真实目标，以及候选引理的前提来源是否有依据。对于直接应用的引理，还会调用 auditPlanLibraryCandidates(...) 做应用尝试与剩余前提检查。 
这里还有一个限制：不能把整个原始目标 T 换个名字，作为一个“子目标”全部扔给 lemma subagent。代码会检查 delegated node 的目标是否与 theorem root 匹配，并可能报 parent_equivalent_leaf。
#### 第三步：`proof_plan` 把结果交给 workflow
关键调用是：
```
SessionProofWorkflow.recordDecompositionPlanAttempt({
  sessionID: ctx.sessionID,
  file: binding.file,
  source: boundSource!,
  plan: reviewedPlan,
  review,
})
```
- 把这份计划、审查结果和对应源码交给 workflow。workflow 保存 `last_candidate_plan`、`last_review`、`accepted_plan`、修订次数等，然后给主 prover 返回下一步建议。

| 返回的建议                                            | 主 prover 接下来应该做什么             |
| ------------------------------------------------ | ----------------------------- |
| `revise_semantic_dag`                            | 调整证明拆解或依赖路线。                  |
| `repair_plan_metadata`                           | 修复节点 ID、引用或目标描述等元数据问题。        |
| `materialize_once` / `materialize_accepted_plan` | 按照已接受的计划，把证明骨架写入源码，而不是继续反复规划。 |

这里的 `accepted` 只表示计划通过了当前的规划审查，可以继续实施；不表示 A、B 或 T 已经被证明。整个计划的实际正确性，仍需要后续编写证明并由编译器验证。

### 主 prover 将计划✍️成源码中的 proof skeleton
主 Prover 会调用独立的 `edit` 工具，把类似下面的 Rocq 代码写入 `.v` 文件：
```
Theorem T : P /\ Q.
Proof.

  (* proof_region begin owner: lemma admit_id: A theorem: T ... *)
  have HA : P.
  {
    admit.
  }
  (* proof_region end admit_id: A *)

  (* proof_region begin owner: lemma admit_id: B theorem: T ... *)
  have HB : Q.
  {
    admit.
  }
  (* proof_region end admit_id: B *)

  (* 主 Prover 负责的最终组合 *)
  exact: conj HA HB.

Qed.
```
- region 必须包住整个 `have` statement 和对应的 `{ ... }` proof block，而不是只包住 `admit.`
- 主 Prover 写完 skeleton 后，workflow 需要检查实际 region 与已接受的 plan 是否一致。随后，Lemma Agent 只能修改分配给自己的 region，并把 `admit.` 换成真正的 tactics。
- 等 A、B 都证明完成，主 Prover 留下的最终组合代码就可以使用 `HA` 和 `HB` 完成原始 theorem。若 B 依赖 A，workflow 还应等 A 验证通过后再调度 B。

### Subagent 卡住后，主 prover 的任务
Lemma Agent 返回失败 / 放弃 / Escalation 后，Workflow 检查失败原因和现有进度，然后判断是局部证明问题 还是结构性问题。
- **Accepted plan 通常会被锁定**，避免主 Prover 在证明过程中随意修改已经确认的证明计划。
- 如果只是 **proof skeleton 的局部问题**，例如 proof region 的 marker 位置不正确，或者外层证明缺少一段 bridge，主 Prover 可以在符合 workflow 规则的前提下，直接调用 `edit` 修改源码，**不需要重新提交整个** proof_plan。
- 但如果问题涉及**证明计划本身的结构性变化**，例如需要调整 DAG 中的依赖关系、重新划分子目标或改变证明路线，就可能需要修订 accepted plan。只有当 workflow 根据实际的编译失败或结构性问题提供了明确的修订依据，并允许进行修订时，主 Prover 才能再次调用 `proof_plan`，对已接受的计划进行受约束的修改。
Workflow 怎样阻止 Subagent 一直重复失败
- workflow 不仅记录“失败了”，还需要把失败绑定到具体的任务状态，例如 `admit_id`、region fingerprint、source fingerprint、未完成的证明目标以及已经验证的进展。
- 失败但有有效进展：保留经过允许的修改，后续可以继续。
- 失败且没有实质进展：不能靠重复提交相同任务冒充新的尝试。
- 出现结构性问题：升级给具有 theorem-level 权限的 Prover 处理。
- 修复后：需要重新检查 skeleton、编译状态以及实际证明进度，才能继续后续任务。

#### 所有 region 完成后，主 prover 还要做什么
主 prover 要负责把局部结果连接到原始 theorem 的最终结论。这部分外层组合可能早已写在 skeleton 里，也可能需要继续补全或修复。
主 prover 再通过 `coqc`／`checkpoint` 检查最终源码。以 `checkpoint` 为例，它会调用 workflow 的 final gate 和进度分类，并接入 AST audit；源码里明确存在“编译成功，但最终审计未通过，因此不接受当前版本”的分支。主 prover 可以提出‘我完成了’，但是否接受这份最终结果，要由验证流程决定。