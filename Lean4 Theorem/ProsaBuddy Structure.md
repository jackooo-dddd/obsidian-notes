LLM生成proof有两个流程。
- 生成并冻结 theorem-level proof skeleton
- 逐个解决局部 proof obligations
```
给定 theorem
   ↓
LLM 生成整个 proof 的结构 
   ↓
have H1 : ...
have H2 : ...
have H3 : ...
...
   ↓
把难的局部部分变成 proof_region
   ↓
lemma agent 一个局部 proof 一个局部 proof 地解决
   ↓
在每个局部 proof 内：
tactic → 看 Coq goal
       → tactic
       → 看新的 goal
       → tactic
       → ...
```
