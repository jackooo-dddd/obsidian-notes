#### 翻译部分
(Q1) 为什么不直接一句话一句话的翻译 Theorem Proof?
Prosa proof里面有大量的`ssreflect tactics`在Lean里面不存在，要用Lean里面的lemma和tactic写。 比如说Rocq里面用到了`find_ex_minn` 这个 theorem，lean里面没有功能类似的theorem，那么模型就要在`Lean Mathlib`里面找工具来实现这个功能. （这里也是在考验模型的能力）

(Q2) 翻译里面，skill中的，为什么要固定关键词的来源？
防止 translator 仅根据符号外观进行翻译。比如，对于 Rocq 中基于 `seq` 的聚合，若 `xs = [1; 1; 2]`，那么 `\sum_(x <- xs) x` 会保留重复项，因此结果是 `1 + 1 + 2 = 4`。如果在 Lean 中正确翻译为 `List` 上的求和，结果仍然是 4，因为 `List` 不会去重。但如果 translator 只是看到 Rocq 中的 `\sum_`，就直接联想到 Lean 里外观相似的 `∑`，那么很可能会使用 `Finset.sum`。由于 `Finset` 会自动去除重复元素，`[1, 1, 2]` 会变成 `{1, 2}`，最终得到 `1 + 2 = 3`。因此，虽然两边的求和符号看起来很相似，但如果不确认符号背后实际对应的数据结构和语义，就可能得到一个能够编译、却语义错误的翻译。
**Skill里的，关键词匹配是怎么来的**
1. **确定 source semantics**：从 Prosa v0.6 结合实际 imports、notation scope、instance selection 和 elaborated expression，确定 notation 在 Rocq 中真正表示的语义。
2. **寻找 Lean 对应表示**：在 Lean 中寻找能够保留相同语义的表示或实现，包括数据结构、计算行为、顺序、重复项、默认值等 source 中可观察的性质。
3. **证明 correspondence:** 对选择的 Rocq–Lean 映射建立correspondence，通过 Rocq kernel、assumption audit 等验证其语义匹配。
4. **沉淀为 Skill 规则**：对于已经确认并具有足够验证证据、且可以在后续翻译中稳定复用的模式，将其总结为 translation / representation rule 写入 Skill，作为之后翻译的默认指导。

(Q3) 参数数量如何对齐，隐式参数如何处理，大模型如何找到theorem里面所有的 definition？
- 不会直接看文件里 theorem statement 出现了几个参数来判断是否对应，而是先把两边的完整Type打出来，Rocq 用 `Check @name` 配合 `Set Printing All`，Lean 用 `#check @name`。这样可以看到真正参与声明的所有参数，包括隐式参数、instance 参数和 Section 中被带进来的变量。
- 参数全部展开后，按照`representation_policy.md`里的rules 做对应。参数大致分三种：两边直接共用同一个对象，例如 `Job`、`j`；通过 certificate library 里的 relation 对应，例如数字用 `SubNatRel`、schedule 用 `SvcScheduleRel`；以及 proof 参数，这类不要求 proof term 本身一一对应，只证明命题对应。
- 除了 proof 参数以外，其他需要 relation 的参数会优先从 certificate library 里找到已经认证的 relation / adapter 来复用。
-  参数对应不一定是 1 对 1。Rocq 有时会把多个信息放在一个 structure 里，而 Lean 会把它们拆开。例如 Rocq 的 `Job : eqType` 对应 Lean 的 `Job : Type`+`[DecidableEq Job]`；`finType` 类似地对应 `Type + Fintype + DecidableEq`。这种表示方式由 representation policy 决定，并通过像 `svc_decidable_eq` 这样的 adapter，从 Rocq 的 `eqType` 构造出特定的 Lean `DecidableEq`。
- 这些参数关系会成为 correspondence theorem / definition 的前提。

(Q4) 参数对应之后，如何说明 correspondence
- 对于 theorem，要证明的是只要两边输入参数是对应的，那么 Rocq statement 成立时，Lean statement 也成立；反过来 Lean statement 成立时，Rocq statement 也成立。
- 对于普通 definition，返回是 `Nat`、`Bool`、`List`、schedule 等数据。这时要证明的是：在两边输入参数已经满足对应关系的前提下，两边 definition 算出来的结果也满足对应的 representation relation。例如 Rocq 输入 `xR` 和 Lean 输入 `xL` 已经是对应的，Rocq 最后返回 `nR : nat`，Lean 返回 `nL : Nat`，那么就证明 `SubNatRel nR nL`，表示这两个不同系统里的结果代表同一个自然数语义。对于 List、schedule 或其他结构也是一样：先要求输入 related，再证明输出 related。
#### 验证一致性部分
（Q1）哪些做了一致性检查，哪些没有做
做了一致性检查的
- **Definition / Fixpoint**：相关输入必须得到相关输出。
- **Lemma / Theorem / Corollary / Fact**：在相关输入下，证明两边的 statement 逻辑对应；不要求 proof term 相同。
-  **Hypothesis**：它的 statement / proposition 需要和 Lean 侧对应的 premise 做 correspondence。
- **Inductive / Variant / datatype**：建立两种数据表示之间的 relation，并证明 constructors 及其参数对应。
- **Class / Structure / Record**：定义 instance 之间的 relation，验证所需字段/性质对应。
- **Instance**：证明具体的 Rocq instance 和 Lean instance 满足对应的 class relation。

没有验证一致性的
- **Variable / Context（Section 参数）**：`Variable` 和 `Context` 本身不会证明 correspondence。Section 里面写的 `Variable` / `Context`，如果被后面的 declaration 用到了，那么 Section 结束以后，这些变量会自动出现在 declaration 的完整参数列表里。
	有些参数在 Rocq 和 Lean 两边使用的是同一个底层对象，因此可以直接共用，例如 `j : Job`：correspondence theorem 中两边都直接使用这个 `j`，不需要再额外定义一个 `JobRel` 来连接它们；而有些参数在两边的类型或表示方式不同，例如 Rocq 的 `schedR` 和 imported Lean 的 `schedL`，这时需要同时保留两个参数，并用 `Hsched : SvcScheduleRel ... schedR schedL` 这样的 relation 来说明它们表示的是同一个语义上的 schedule。
- `private` helper：private declaration 不是 public API，因此不会计入 public declaration 的翻译覆盖率，也不会要求每个 helper 都有一个独立的公开 correspondence certificate。
- `Hint` **/** `Ltac` **/** `Arguments` **/** `Notation`：属于 proof automation、参数显示方式或语法层面的机制，本身不承载需要翻译的数学语义。例如 `Notation` 只决定源码中怎样写表达式，真正需要验证的是 elaboration 后实际使用的 operation；`Ltac` 和 `Hint` 只影响 Rocq 怎样找到 proof，并不改变最终 theorem statement；`Arguments` 主要控制参数是显式还是隐式，验证时看的是完整 elaborated declaration type。
- `namespace` **/** `open`：只负责名称组织和名称解析。例如 Lean 中的 `namespace Prosa.Behavior.Service` 不需要和 Rocq 中某个 `Module` 建立 semantic correspondence。重要的是 namespace 中产生的 declaration 是否被正确映射，例如 Rocq 的 `completed_by` 必须映射到 Lean 的 `Prosa.Behavior.Service.completed_by`。

