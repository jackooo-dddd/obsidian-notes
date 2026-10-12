
| Skill                                              | 现在在 ProsaBuddy 里干什么                                                                                                                                 | 迁移到 Lean 要改什么                                                                                                                                                                                                            | 改动程度     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **`count-bridging`** (`ssreflect-count-bridging`)  | 专门解决“同一个计数量在不同表示之间来回变化”：`indicator sum → filtered bigop → count → min/arithmetic`。例如 `big_mkcond`、`sum1_count`、`count`、`minn`。                      | **核心思想保留**。把 MathComp 的 `\sum_`、`big_mkcond`、`sum1_count`、`move/ltP` 等全部换成 Lean 翻译后真实使用的 `sumFiltered` / `List` / `Finset` / `Nat.min` 等接口，以及相应的 `rw`、`simp`、局部 lemma。Bool→Prop 也要改成 Lean 的 `b = true` / proposition 处理。 | **大改**   |
| **`failure-signature`** (`coq-failure-signatures`) | 根据 Coq error 判断真正的问题。例如 `LHS does not match any subterm` 往往代表当前 expression shape 不对，不应该继续乱 rewrite。                                                 | 保留“**error → cause → next action**”这个设计，但错误字符串全部换成 Lean，例如 `tactic 'rewrite' failed`、`application type mismatch`、`failed to synthesize`、`unsolved goals`、`unknown identifier` 等。里面 `big_const_ord`、`mul1n` 等案例全部换掉。      | **大改**   |
| **`goal`** (`goal-focus-discipline`)               | 防止 proof state 漂移。特别处理 Coq 的 bullets、`{ ... }`、`case`、`have` 产生多个 goals 后，agent 还以为自己在原来的 goal 上。                                                   | **思想非常重要，保留。** 但 Lean 没有同样的 `{ ... }` local proof / Coq bullet semantics。要改成 Lean 的 `·`、`case`、`next`、`have h : P := by ...`、缩进 scope，以及 Lean goal list。                                                                 | **中到大改** |
| **`guide`** (`rocq-proof-methodology`)             | 最通用的 proof recovery skill：读真实 goal → 修第一个可靠错误 → 做一个小改动 → 再验证。还规定不能 `Axiom` / `Admitted` 改题。                                                         | 这是**最容易保留的一个**。把 `Qed.`、`Admitted.`、Coq tactics、`coqc/checkpoint` 等换成 Lean 的 `by` proof、`sorry`、Lean validation。总体 methodology 基本不用变。                                                                                    | **小到中改** |
| **`math`** (`coq-proof-state-discipline`)          | 解决“数学上明明相等，但 rewrite 就是不工作”。要求严格看当前 syntax，再选择 lemma；大量处理 `bigop → iter → multiplication`。                                                          | “**按真实 expression shape 推理**”完全保留。但 MathComp-specific 的 `big_const_ord`、`iter_addn`、`mulnC`、`\sum_` 等全部换成 Lean 当前翻译里的表示和 Mathlib lemma。                                                                                  | **大改**   |
| **`parameter`** (`coq-goal-driven-apply`)          | 区分两类东西：① apply 之后产生的普通 premise；② theorem 在形成之前必须先确定的 implicit parameter / Section argument / typeclass instance。防止 agent 写巨大的 `exact (@lemma ...)`。 | **这个思想在 Lean 一样重要。** 改成 Lean implicit arguments、named arguments、typeclass synthesis、`apply` / `refine` / `exact` 的行为；错误改成 `failed to synthesize ...`、`cannot synthesize placeholder`、application mismatch 等。             | **中改**   |
| **`prosabuddy-guard-recovery`**                    | 这不是 Coq 数学技巧，而是教 agent 怎么理解 ProsaBuddy runtime 的 guard：stale transaction、scope rejection、failed route、premise audit、session desync、checkpoint 等。    | **基本可以原样保留。** 主要把 `coq_session` / `coqc certificate` 换成 Lean backend 的 `lean_session` / Lean validation certificate，并调整 region/session 的 Lean 实现。                                                                        | **小改**   |
| **`tactics`** (`by-expansion-diagnostics`)         | 专门处理 Coq/SSReflect 的 `by ...`：Coq 的 `by tac` 会要求 tactic 立即关闭所有 goals，所以失败时先去掉 `by`，暴露真正的剩余 goal。                                                    | **这个不能直接翻译。** Lean 的 `by` 是进入 tactic block 的基本语法，不能采用“删掉 `by`”这个规则。Lean 版应该改成：把压缩的一行 tactic 拆成多步，逐步检查 goal，例如把 `by simpa [...]` 拆成 `by rw [...]` / `simp` 后检查中间状态。                                                       | **几乎重写** |
|                                                    |                                                                                                                                                     |                                                                                                                                                                                                                          |          |
### **count-bridging**
在 SSReflect/MathComp 中，在统计满足条件的元素个数的时候，这个计数量可以有多种表示形式，例如用sum逐项求和、筛选后求和或直接使用 `count` 计数，这样最后的表达式，他就会略有不同。但某些定理要求计数量采用特定的表达形式。当 agent 想使用已有定理，却发现当前表达式与定理要求的形式不匹配时，这个 skill 会指导 agent 利用已有引理，将计数量转换为定理能够接受的形式，再继续完成证明。
在 Lean / Mathlib 里，同一个“满足条件的元素个数”也可以有多种表示。

| 表示方式 | Lean / Mathlib 写法 |
|---|---|
| 逐项求和（indicator sum） | `∑ x ∈ s, if p x then 1 else 0` |
| 先筛选再计数 | `(s.filter p).card` |
| List 中按条件计数 | `l.countP p`（这里 `p` 返回 Bool） |
| List 中先筛选再计数 | `(l.filter p).length` |
Mathlib 提供了连接这些表示的 lemma，例如 `Finset.sum_boole` 可以将 indicator sum 转换成满足条件的元素数量，`Finset.sum_filter` 则连接条件求和与筛选后的求和。因此，Lean 中同样需要处理不同 counting representation 之间的转换。例如，假设已有 `h : (s.filter p).card ≤ 5`，但当前目标是 `⊢ (∑ x ∈ s, if p x then 1 else 0) ≤ 5`。虽然两者表示相同的计数量，但由于表达形式不同，不能直接使用 `exact h`。这时可以先执行 `rw [Finset.sum_boole]`，将目标转换成 `(s.filter p).card ≤ 5`，再用 `exact h` 完成证明。这就是 **count bridging** 的核心作用：先将 counting expression 转换成已有 theorem 能够匹配的形式，再继续证明，即 **representation normalization first, arithmetic second**。
**Count-Bridging Skill — 迁移到 Lean 的修改** 由于 Lean 不使用 SSReflect/MathComp 的证明体系，原有的 `big_mkcond`、`sum1_count`、`move/ltP` 等定理和证明操作需要替换为 Lean/Mathlib 或已翻译的 Lean Prosa 中对应的内容。代码示例和转换步骤也需要根据 Lean 实际使用的计数、求和表示重新编写。
**Bool / Prop Separation 可以删除：** 这一部分原本指导 agent 在计数完成后，将 SSReflect 中布尔形式的 `<`、`≤` 转换为逻辑命题，完成算术证明后再转换回来。Lean 中普通的 `<`、`≤` 本身就是命题，可以直接使用 `lia`、`omega` 等方法证明， 因此不需要保留这套固定的往返转换流程。（这也说明了，Lean里面比rocq要简单？）这样的话，可以从 Bool / Prop Separation 一直删除到 Boundary Failure Signs
Normal-Form Decision：把求和简化成两种形式，一种是用sum，一种是用count，那么久把它们改成Lean里面的sum 和 count
Bridge Templates 里面换成，从rocq里面的相互转换，替换成Lean 里面的，表示 满足条件的元素个数 的多种表示的相互转换

failure-signature （可以考虑删除，或者之后再建立）
skill告诉agent对于一些常见的错误，这些误意味着什么，可能是什么原因，以及应该如何修复。表中的具体报错和例子来自 Coq/MathComp，迁移到 Lean 时，这张速查表本身也需要重新建立。
常见的报错信息，如果你觉得这个表里面很有用，那么在后面我们可以让prosabuddy在Lean上面真实跑的时候，去记录一些Lean里面经常遇到的error message，然后把它记下来
这个example是在干什么？它里面的错误信息是什么呀？

**Goal Skill** 主要用于确保 agent 当前正在证明的目标，就是它实际应该解决的目标，避免证明过程中出现目标混乱。例如，`case`、`have` 等操作可能产生多个新的子目标，如果 agent 没有及时检查当前的证明状态，就可能在某个局部结论尚未证明完成时，错误地返回外层的大结论继续证明。因此，这个 skill 要求 agent 在产生、切换或完成子目标后，检查当前还需要证明的内容和已有的假设，确保先完成当前局部证明，再返回外层目标，避免实际的证明进度与 agent 预期的不一致。
Hard Recovery Protocol：`goal` skill 中的 **Hard Recovery Protocol** 需要重新考虑，甚至可以在 Lean 版本中删除整个章节。原协议将“当前 focused goal 的数量不等于 1”直接视为异常，并要求不断执行 recovery，直到只剩一个 goal。但实际上，无论在 Rocq 还是 Lean 中，`case`、`have`、`constructor` 等操作都可能合法地产生多个 goals，因此 **goal count ≠ 1 并不代表 proof state 出错**。真正需要检查的是 agent 当前处理的 goal 是否仍然是预期目标，以及是否错误地跳过了尚未完成的局部证明。
此外，原协议中的 `Abort.` 是 Rocq 的证明终止命令，不能直接用于 Lean 的恢复流程。


guide
**Guide Skill** 用于 agent 在证明过程中遇到问题，但暂时无法确定具体原因的情况。它要求 agent 先检查当前需要证明的目标、已有假设，错误信息，按照语法与证明结构进行顺序排查。每次只针对第一个明确的错误进行修改，然后立即验证。已经验证成功的证明部分需要保留，失败时只撤回或修复出错的部分，不能通过修改原定理或增加假设来绕过问题。如果已经确定是目标切换、参数匹配、计数转换等特定问题，则优先使用对应的专门 skill。
`Prefer a narrower skill when the diagnostic already identifies a specific pattern such as goal focus, `by` expansion, failed lemma application, count/bigop bridging`
- 目标切换 → `goal focus`，对应 `goal` skill。
- 参数匹配 → `failed lemma application`，可能对应 `parameter` skill，但原文没有明确提到 parameter。
- 计数转换 → `count/bigop bridging`，对应 `count-bridging` skill。
**Scope and Proof Integrity：** 原来的 skill 使用 `Qed.` 判断 Rocq 证明是否结束，并要求 agent 只能修改被授权的 theorem 或 proof region。迁移到 Lean 后，由于没有 `Qed.`，需要重新定义证明结束位置的判断方式。对于局部 `have` 证明，可以采用统一的 `:= (by ... )` 格式，通过匹配最外层括号确定证明块的结束位置；对于整个 theorem，则需要结合 Lean 的缩进规则和语法结构确定声明边界。
Completion check 里面的 the final theorem terminator 要换成 Lean 的

Math
**Math Skill** 主要用于解决证明中等式改写不匹配的问题。例如，agent 想利用一个已有定理，把当前表达式改写成与它相等的另一种形式，但证明器发现定理中的表达式与当前目标不匹配，导致改写失败。这个 skill 会要求 agent 先检查当前需要证明的表达式，以及所用定理的具体形式，判断两者之间缺少哪一步转换。如果表达式的形式不同，就先利用已有定理进行必要的化简或转换；如果没有直接适用的定理，则可以单独证明一个小等式作为连接。每次改写后，agent 都需要重新检查当前的证明目标，确认表达式是否朝着预期的形式变化，避免在不同的等价表达式之间反复转换。
**Math Skill** 的修改主要是将原来依赖 Rocq/MathComp 的定理、语法和证明方法替换为 Lean/Mathlib 中对应的内容，并优先使用已经翻译好的 Lean Prosa 定理。如果某些 MathComp 特有的操作或证明技巧在 Lean 中没有适用的对应方式，就删除相关内容。其次，将 **Bridge Lemma Templates** 中的 Coq 代码替换为 Lean 代码；**Bigop Endgame Discipline** 中涉及 SSReflect 的求和、改写和化简规则也需要相应调整；最后，将 **Common Failure Signatures** 中的 Coq 报错及其解决方法替换为 Lean 中对应的错误信息和处理策略。整体保留原来根据当前证明目标选择改写方式、通过中间等式连接不同表达式的核心思想。

Parameter （比较看不懂）
**作用：** 当 agent 找到一个看起来可以解决当前目标的定理，但证明器无法成功应用时，这个 skill 会帮助 agent 判断问题是出在尚未确定的参数或实例，还是缺少需要进一步证明的前提。
对于定理应用前必须确定的参数，例如隐式参数、Section 参数或类型类实例，agent 需要检查定理的完整类型，找出无法自动推断的参数，并补充必要的参数。
里面有非常多的，RTS的东西
Postponable Example：这个里面有 Prosa 的东西，所以翻译的时候要把 Lean-Prosa的东西放进去，要严格按照 我们自己定义的 Prosa 的语法来做

`prosabuddy-guard-recovery`
当 agent 的操作被 ProsaBuddy 的系统检查拒绝时，这个 skill 负责指导 agent 理解错误原因并恢复工作。例如，agent 基于旧版本的证明进行了修改，但当前证明文件已经更新，系统就会拒绝这次修改，要求 agent 重新读取最新版本。类似的问题, 在Recovery Map里面，还包括修改超出允许范围、重复使用已经失败的证明方法、缺少必要的证明前提，以及当前证明状态与系统记录不一致等。这个 skill 要求 agent 先查看完整的系统反馈，确定具体的拒绝原因，只修复相关问题，同时保留之前已经验证成功的证明部分，避免重复失败或丢失有效进展。它主要负责系统检查失败后的恢复流程，不负责具体的数学证明。
总体改的地方非常少

tactics （全部删除？）
当 agent 使用一段简短的证明代码完成多个证明步骤，但证明器只报告整个步骤失败，无法确定具体原因时，这个 skill 会帮助 agent 将紧凑的证明代码逐步展开，找出真正出错的位置。它主要针对 Rocq/SSReflect 中的 `by ...` 写法，要求 agent 先保留原有的证明操作，去掉起压缩和收尾作用的 `by`，重新运行并检查出现的中间目标或剩余未完成的证明条件，再判断下一步。
- 这份 skill 最核心的动作是“去掉 by，再运行里面的步骤”，以便看清 SSReflect 紧凑证明哪里失败。但 Lean 的 by 是进入 tactic 证明块的入口，删掉后里面的命令通常不再构成合法证明。
SSReflect 中的 `by`：执行 tactic，并尝试完成证明
- 在 Rocq/SSReflect 中 by tactic. 意思是：先执行指定的 tactic，再通过 `done` 尝试自动完成剩余目标。如果仍然有无法完成的目标，整个 `by` 就会失败。
```
例如： Goal forall P Q : Prop, P -> P /\ Q.
move=> P Q hP.
by split.
```
- 这里 `split` 把 `P /\ Q` 拆成两个目标：Goal 1: P， Goal 2: Q 因为已有 `hP : P`，第一个目标可以解决，但没有足够的信息证明 `Q`。因此 `by split.` 无法完成整个证明。原来的 Tactics Skill 就是针对这种情况： 把 `by split.` 展开成：`split.`然后重新查看剩余目标，发现真正的问题是缺少 `Q` 的证明，而不是继续尝试其他 tactic。
Lean 中的 `by`：进入 tactic 证明模式
- Lean 的 `by` 是用来构造一个 proof term 的语法，它表示：接下来使用一段 tactic 代码完成这个命题的证明。Lean 不会像 SSReflect 的 `by tactic` 那样，在执行 tactic 后额外附加一个 `done` 来尝试自动解决剩余目标。**如果证明结束时仍有未完成的目标，Lean 会报告 `unsolved goals`。**
```
theorem demo (P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q := by
  constructor
  · exact hP
  · exact hQ
```
- 不过，Lean 仍然可能出现多个 tactic 压缩在一起，导致难以定位具体失败步骤的问题。不过即使要保留，也几乎要整个全部重写 （把所有和by有关的东西都删了）
When to Use 里面 Lean by 是普通证明块入口，不能据此判断存在压缩失败。
Core Rule 里面的删掉by 是肯定要改的，只拆内部动作，再查看每步目标。
Why by Hides the Useful Error 里面都是  SSReflect by的行为，要全部换成 记录 Lean 真实错误及其位置