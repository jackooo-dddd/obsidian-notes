### Prover.txt
- 读 theorem，做 `proof_plan`，建立 theorem skeleton，划分 `proof_region`，调度 `lemma`，最后验收
Coq tools → Lean tools
```
12: - `coq_session`: preferred tool for incremental proof construction and validation
13: - `coqtop`: quick `Check`, `About`, `Print`, and `Search` queries
14: - `coqc`: narrow compilation check when it is the simplest validation
```
要把这些替换成 Lean 侧实际提供的工具

`{ ... }` proof-region boundary → Lean `by` + indentation
```
26: Freeze every delegated ... proof_region begin/end that wraps
    ... its complete `{ ... }` proof block ...
28: Brace discipline and connector-fact policy:

29: ... must discharge that subgoal inside `{ ... }` immediately ...
30: ... state a named fact ... in `{ ... }` ...

69: ... prefer a one-line `by` when truly one-step;
    otherwise isolate the proof in `{ ... }` ...
    
84: ... write that unit as a `proof_region begin/end` ...
85: Place `proof_region begin` before the exported target statement ...
and place `proof_region end` immediately after that target's
`{ ... }` proof block ...
Do not put the markers only inside the target's braces.
```
`region end` 的位置必须通过匹配包裹整个 Lean `by` proof block 的最外层 `(` 和 `)` 来确定，而不是依赖 indentation scope 或 Coq 的 `}`。具体来说，`region end` 应放在与 `:= (by ... )` 中最外层左括号匹配的右括号 `)` 之后。

Prosa / MathComp lemma → Lean Prosa / Mathlib
```
59: library_instantiation:
    ... existing Prosa, MathComp, or local lemma.
70: Use `prosa:`, `mathcomp:`, `local:`, `context:`,
    `coq:`, or `compiler:` evidence ...
128：expected:
... Prosa scheduling semantics,
MathComp bigop/cardinality/count lemmas,
...
```

Coq AST / audit feedback → Lean audit
```
94: Final `coqc`/`checkpoint` success is not committable
    until the Rocq AST audit also accepts it.

    If either tool reports `status: ast_audit_rejected`,
    the main prover owns the repair ...
```
需要把当前 Coq validation pipeline 转化为 Lean 的validation pipeline

### lemma.txt
- 一个 subagent 只负责一个 frozen `proof_region`，不断交互证明直到局部 gap 关闭
Coq tools → Lean tools
```
11: `.v` file; their LSP diagnostics...
12: `coq_session`
13: `petanque`
14: rocq-lsp/coq-lsp
15: `coqtop`
16: `coqc`
以及之后所有用到这些tools的地方
```

Region parsing 有大量的地方解释括号的意义以及依赖括号来告诉agent在什么地方进行证明，需要把这些替换成 Lean 里面的()
```
37 Empty `{}` proof blocks are partition boundaries.
...
keep the existing braces
...
do not collapse the block into a `by` proof

39 proof_region begin
...
complete `{ ... }` proof block
...
proof_region end

73 markers are wrongly placed inside the target's braces and cannot include the exported proposition...
```

SSReflect tactics Rocq里面证明theorem的包，这些东西是Lean里面没有的
```
213 Do not use ssreflect repeat-rewrite syntax
`rewrite !...` or `rewrite -!...`

214 Do not use the `intuition` tactic...
Use explicit tactics
(`left`/`right`/`split`/`apply`/`exact`)

63 bigop/minn rewrite mismatch
78 Lean Prosa / Mathlib Finset.sum / Nat.min / corresponding lemmas
```
这些替换可以参考我们当时翻译的时候是怎么在 Lean 里面写 Proof的

**80–88 行**几乎整个 section 都必须 Lean 化：
这是 lemma agent 在 Rocq 里面完成一个局部 proof gap 时的完整证明循环。它描述的是从构思下一步证明 → 执行 tactic → 查看当前 goal → 成功后保存 → 失败后诊断 → 查 lemma/definition → 编译验证 → 再继续修改的一整套 workflow。目前这套 workflow 从头到尾都是围绕 Rocq 工具链设计的，所以迁移到 Lean 时，证明循环这个架构可以保留，但底层执行机制要整体换成 Lean 的。
```
80: Open coq_session or petanque
81: Snapshot
83: coq_session step / petanque run
84: coq_session goal / petanque goals / lsp proofGoals
85: snapshot new state
86: bullet/focus repair
87: coqtop Check/Print/Search
88: coqc
```

### fixer.txt
**`fixer`** 在其他 agent 已经写了一段证明、Rocq compiler/LSP/tactic 报出了一个具体错误以后，把**错误信息 + 出错代码 + 当前 goal + local context + 已尝试的方法**交给 fixer。fixer 只诊断这个错误的根因，做**最小局部修改**，然后重新调用 Rocq 工具验证；如果发现必须改 theorem structure、import 或 proof architecture，就停止并 escalate。

现在fixer报错的Error message都是Rocq里面的，我们要把它换成Lean里面的报错信息
```
6 Error: The exact Coq error message
(prefer LSP diagnostics; fallback to coqc error-only output)

8 Goal:
proof state immediately before the error
(focused goal + local hypotheses from `Show.`)
```
`Show.` 是 Rocq-specific。要替换成 Lean 里面展示信息的手段

`Common Coq Error Patterns`：55–62 整段都是围绕 **Coq 报错文本 + Coq syntax + Coq tactic semantics** 写的。
```
55: # Common Coq Error Patterns

57: "Unable to unify"
58: "Not found" / "Cannot find"
59: "Syntax error" → missing period...
60: "No matching clauses" → match/destruct...
61: "Cannot infer" → use @...
62: Section-generalized foralls → apply/eapply...
```
这部分改成 Lean 时，主要就是把原来针对 **Coq 报错文本、Coq 语法和 tactic 习惯** 的规则，换成 Lean 常见错误及对应修复方式。例如把 `Unable to unify` 换成 Lean 常见的 `type mismatch` / `application type mismatch`，把 `Not found` 换成 `unknown identifier`，把 `Cannot infer` 换成 `failed to synthesize instance` 或隐式参数推断失败，把 Coq 的 `match/destruct`、period、`apply/eapply` 等修复建议换成 Lean 的 `match` 分支、`by`/缩进、`rw`/`simp`/`exact`/`apply`、typeclass instance 和 elaboration 相关修复。整体结构不用变，还是“看到某类典型错误 → 判断常见原因 → 给出最小修复建议”，只是错误模式和修复手段全部替换成 Lean 的。

最后还要把 tools Rocq → Lean
```
16 Use `coqc` or `coq_session step`
to verify your fix compiles

35 Do not report success without
checkpoint / coq_session / coqc compiler certificate

72 Verify with `coq_session step` or `coqc`.
```

### diagnoser.txt
基本不需要改
`diagnoser.txt` 现在的问题分类：
```
local_tactic_failure
definition_unfolding_needed
library_shape_mismatch
missing_preceding_bridge
missing_uniqueness_bridge
missing_context_strengthening
theorem_spine_mismatch
subgoal_modeling_error
not_local_obligation
```
这些都是**语言无关的 conceptual categories**，在 Lean 里面也完全可能会出现
就把一些基础的 wording 从coq 换到  Lean 就可以啦

### explore.txt
基本不需要改。 explore **是一个只负责“查资料”的辅助 subagent**。它的工作是：prover/lemma 当前缺一个 definition、lemma、已有 proof pattern 时，让 explorer 去代码库里搜，读完以后把“在哪里、能不能支持当前这个 proof step”返回
```
7: Mapping concrete lemmas, definitions, and proof patterns
   back to a caller's paper step, equation,
   or local `pose` / `have` obligation
16: distinguish whether a finding supports a `pose`,
    a `have`, or only Coq technical support 
```
- 把搜索对象从 Rocq 风格 改成 Lean 风格， 像是 local fact / local definition，current subgoal

### compaction.txt
`compaction.txt` ： 当前 agent 的上下文太长、即将 compaction 或换到下一轮 agent 时，把“现在证明做到哪里、当前 goal 是什么、哪些代码已经验证、哪些失败过、哪些 region 不能动、下一步该干什么”压缩成一个 continuation summary，让下一个 agent 能从同一个状态继续，而不是重新探索。
```
Rocq proof state → Lean proof state
→ lines 18, 43, 51
→ coq_session/petanque snapshot, Coq goal/hypotheses/error
   become Lean goal/local-context/diagnostic/session state

```

### whole-lemma.txt
这个是不是和lemma的agent是非常相似的？只是这个的范围是整个theorem，而lemma agent是整一个proof region
- 绕过 `prover → proof_region → lemma` 那套分层流程，直接把当前整个 theorem 当成一个大 proof obligation，然后像 `lemma` agent 一样，用交互式 proof loop 一步一步往前证明。它主要用于 **wide fallback / direct whole-theorem proving**；也就是说想直接试试看，现有 theorem context + library facts 能不能把整个 theorem 一口气证明下来。
7–15 行 Tools 全换
核心是 **31–41 行**：
```
31 Read .v theorem
32 Search definitions / lemmas / proof patterns
33 Start proving directly
34 coq_session / petanque
35 atomic tactics → inspect goal → snapshot → rollback
36 successful step → write back to .v
37 LSP + coq_session/petanque/coqc feedback
38 diagnose Coq by / bullet / focus
39 coqtop lookup
40 preserve validated fragments
41 coqc compile
```
所以这和 `lemma.txt` 的 Long-Running Interactive Proof Loop 本质上是同一类迁移：
> **从一个完整的 Rocq “构思 → tactic → goal inspection → diagnostic → 修改 → 编译”循环，整体改成 Lean 的同类循环。**