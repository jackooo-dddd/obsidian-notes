### When an early success causes later failures

**The short version:** each declaration is translated alone, in order, and the first translation that passes every check is kept for good. Sometimes that translation is valid but more specific than needed. Later declarations must fit what was kept, and some of them no longer can.

#### An everyday picture

Think of the Sudoku again, filled in one cell at a time.

- You write a number in a cell. It breaks no rule, so it’s a legal move.
- Twenty cells later, another cell has no legal number left, because of that earlier choice.
- Nothing was wrong when you wrote the first number. The error appears far away, at the later cell, and that is where you start looking, in the wrong place.

The translator works the same way. Each declaration is a cell, and once it’s accepted, it’s written in pen.

#### Why the checks don’t catch it

- The checks look at **one declaration at a time**. They ask: does this translation obey Rocq’s universe rules, and is no protected Prosa statement weaker than in Rocq?
- A declaration may legitimately choose how to express a level it uses internally, as long as Rocq’s rules are respected. Many choices are valid, and the ladder keeps the first valid one.
- Nobody asks: “will this choice still fit everything that uses this declaration later?” The later users haven’t been translated yet, so nobody can ask that.

### Example 1: the arrival-curve level gets glued to the job’s level (81 Prosa rows)

**The Prosa definitions** (simplified):

ArrivalCurvePrefix   := duration * seq (duration * nat)      -- level A (arrival curves)
task_arrivals_bound  := Periodic nat | Sporadic nat | ArrivalPrefix ArrivalCurvePrefix
concrete_task        := { ...; task_arrival : task_arrivals_bound; ... }
concrete_job         := { ...; job_arrival; ...; job_task : concrete_task : eqType }
Instance JobArrival  : JobArrival (concrete_job : eqType) := job_arrival

Two levels matter:

|Name here|Real level|What it is|
|---|---|---|
|**A**|`extrapolated_arrival_curve.21`|size of arrival curves (and so of tasks)|
|**E**|`eqtype.51`|size of the types packed into MathComp’s `eqType`|

A job is packed as an `eqType` and contains a task, which contains an arrival curve. So in Rocq a job’s level just has to be at least E and at least A. Rocq never says how E and A compare: they are independent.

**Step 1: an early, valid choice.** When the `JobArrival` instance was translated, Lean had to write the job’s level as a formula. It chose `max(E, A)`. That is true (a job is at least as big as both), it obeys all of Rocq’s rules, and it was accepted. `JobCost` made the same choice.

**Step 2: a later use that needs something else.** Much later, a Prosa refinement uses a generated helper statement about the equality test on arrival bounds (`eqn_task_arrivals_bound`, obligation 1). One of that helper’s level slots is about arrival curves, so Rocq allows only “at most A” there. Coming from the job side, the refinement has to pass in `max(E, A)`.

**Step 3: the refusal.** `max(E, A) ≤ A` holds only if `E ≤ A`. Rocq never said that, because E and A are independent. So the check refuses, correctly, with: “argument `max(u_51, u_21)`: `eqtype.51 ≤ extrapolated_arrival_curve.21` is not entailed by the source universe graph”.

**Step 4: the damage spreads.** Every refinement built on that one fails too: 81 Prosa rows. Their final error messages say things like “`eqtype.58` solved as 0, but Rocq needs it above `Set`”, which points nowhere near `JobArrival`, the real cause.

**In plain words:** early on, the translator wrote down “a job is as big as the bigger of A and E”. That’s true, but it threw away the fact that A and E are unrelated. A later user needed that fact, and it was gone.

### Example 2: the S24 incident (a measured loss of 3 protected roots)

**The players.** CoqEAL’s `refines_apply` is a general lemma that relates two programs through relations between their types. Rocq lets these relations live at independent levels.

**Before (run S23):**

- `refines_apply` was accepted late in the ladder, by rule R-OCC, which keeps its levels as **six independent parameters**. That is the most general form.

**Run S24:**

- Two new rules were switched on, and they also ran in early tiers.
- One of them accepted `refines_apply` first, in a form where two of its relation levels are **merged into one**.
- That is also valid for `refines_apply` alone, so every check passed.

**What broke:**

1. `refines_abstr2` uses `refines_apply` with relations whose levels must differ, so it no longer fit and failed.
2. Then the Prosa refinements `refine_ltn`, `refine_foldr` and `refine_hep_task` failed, because they depend on it.
3. Result: **3 protected roots that S23 had were lost.**

**Why it was nearly missed.** We measured the new rules with incremental runs, which re-translate only declarations that previously failed. `refines_apply` hadn’t failed, so its new, worse form was never looked at.

**The fix.**

- The two rules now run only in the last tiers, after every older attempt has had its chance, so they can’t take over a declaration that already worked.
- Every adopted rule now gets a full run plus a row-level “leak check” that lists any declaration that lost its translation or changed form.

**In plain words:** a new rule answered first with a less flexible version of a basic lemma. The lemma itself was fine, but things built on it no longer fit.

### Why this gets worse in a bigger library

- **More users per declaration.** A core MathComp structure is used by thousands of declarations. One early choice there has to fit all of them.
- **Longer chains.** The distance between a choice and the failure it causes grows, which makes the real cause harder to find.
- **More valid choices.** With more levels there are more ways to be “valid but too specific”, and the ladder takes whichever valid one it reaches first.
### What can be done

|Approach|Idea|Status|
|---|---|---|
|Detect|Full runs plus leak checks, so damage from a change is visible|In use since S25|
|Prefer general forms|When several forms pass, keep the one with more independent levels|Partly: definitions are retried with more independent levels and kept if that’s more general|
|Plan across declarations|Collect what all users need before fixing a level choice|Solver stage C, planned|

Detection only finds the damage, and preferring general forms helps only inside one declaration. The real fix is planning across declarations: choosing levels with all the users in view, like solving the whole Sudoku rather than one cell at a time.
## Universe Translation：Local Success 不保证 Downstream Success
在 Rocq → Lean Translation 中，一个 Declaration 可能已经成功翻译，并且通过 Lean Kernel 和当前的 Universe Checks，但它采用的 Universe Interpretation 过于具体，导致后续依赖它的 Declarations 无法翻译。
这种情况可以概括为：
- Local Success：当前 Declaration 的 Universe Mapping 合法，Lean Type Checking 通过。
- Downstream Failure：后续 Declaration 使用这个已保存的 Mapping 时，产生了原始 Rocq Universe Graph 并不要求的额外约束。
# Case Study: Early Universe Translation Success Causes Downstream Failures

`JobArrival` 是一个典型例子：某个 Declaration 的 Universe Translation 在当前检查中合法，但 Lean Unification 过早固定了一个 Universe Level，使后续 Declarations 无法使用原本允许的 Universe Instantiation。

需要注意，不是 `JobArrival` 这个 Definition 的值等于 `max(E,A)`，而是它涉及的 Source Global Universe Level `task.43` 被求解为对应的 Lean Level Expression。

## Step 1. Rocq 原本有哪些 Universe Constraints？
首先定义三个源 Global Universe Levels：

| Rocq Level | 简写 | 含义 |
|---|---|---|
| `eqtype.51` | `E` | Job / MathComp `eqType` 相关的 Universe Level |
| `extrapolated_arrival_curve.21` | `A` | Arrival Curve 相关的 Universe Level |
| `task.43` | `T` | `JobArrival` 中涉及的 Task Universe Level |

在 Prosa 中，`JobArrival` 用于获取 Job 的到达时间。Job 属于某个 Task，而 Task 又包含 Arrival Bound 相关信息，因此其类型依赖会涉及 Job、Task 和 Arrival Curve 对应的 Universe Levels。
根据 S25i 案例中导出的 Rocq Universe Graph：
$$
\boxed{A\leq E\leq T}
$$
即：
$$
A\leq E,\qquad E\leq T,\qquad A\leq T
$$
其中 `A ≤ T` 可以由前两个约束推导得到。

这里 `E` 和 `A` 并不是完全独立的。Rocq 要求 `A ≤ E`，但不要求反方向的 `E ≤ A`。因此，`E` 可以严格高于 `A`，而 `T` 又可以高于 `E`。
例如，以下是一个满足 Source Universe Facts 的数值模型：
$$
E=3,\qquad A=1,\qquad T=4
$$
因为：
$$
1\leq3\leq4
$$
这些数字只是用来展示合法的 Universe Assignment，并不意味着 Rocq Monomorphic Global Levels 会在每次函数调用时动态改变。
## Step 2. 为什么 `JobArrival` 第一次翻译成功？

### 2.1 Lean Unification 求解 `task.43`

在 S25i 中，`JobArrival` 和 `JobCost` 的翻译记录显示，Lean Unification 将 `task.43` 对应的 Universe Metavariable 求解为：
$$
\boxed{I(T)=\max(u_E,u_A)}
$$
其中：
- `u_E`：源 Global Level `eqtype.51` 对应的 Lean Parameter。
- `u_A`：源 Global Level `extrapolated_arrival_curve.21` 对应的 Lean Parameter。
- `I(T)`：源 Level `task.43` 的目标 Universe Interpretation。
这里不是 Translator 主动选择了一个最优 Mapping，而是 Lean Unifier 在 Type Checking 过程中得到了这个解。为什么可以通过检查？
因为：
$$
u_E\leq\max(u_E,u_A)
$$
$$
u_A\leq\max(u_E,u_A)
$$
因此，这个 Interpretation 满足 `E ≤ T` 和 `A ≤ T` 所要求的下界关系。
而在满足 Rocq Source Facts `A ≤ E` 的赋值下：
$$
\max(E,A)=E
$$
所以该解实际上使 `T` 采用了源约束允许的最小上界 `E`。
只要目标 Declaration 的 Type、Body 以及适用的 Universe Checks 都通过，Translator 就可以接受这个结果。
### 2.2 为什么这个 Interpretation 过于具体？
原始 Rocq 只要求：
$$
A\leq E\leq T
$$
但当前 Lean Mapping 固定为：

$$
I(T)=\max(u_E,u_A)
$$
因此，`task.43` 不再保留独立的 Lean Universe Parameter `u_T`。

| Rocq 原始约束 | 已接受的 Lean Interpretation |
|---|---|
| `A ≤ E ≤ T` | `T = max(E,A)` |
| `T` 可以严格高于 `E` | 在合法源赋值下，`T = E` |
| `T` 可以保留额外的 Universe 自由度 | 没有独立的 `u_T` |

例如：
$$
E=3,\quad A=1,\quad T=4
$$
是合法的 Source Assignment，但当前映射只能得到：
$$
I(T)=\max(3,1)=3
$$

无法独立表达 `T=4`。

一种更一般的候选 Interpretation 是：
$$
I(T)=\max(u_T,u_E,u_A)
$$
它既能满足原始下界关系，也能表示更高的 `T`。
因此，早期的问题不是违反了 Rocq Constraints，而是 Unification 得到了一个局部合法、但没有保留全部 Universe Generality 的结果。
## Step 3. 后续 Declarations 为什么失败？

S25i 中，八个 Refinement Declarations 出现了相同类型的直接 Universe Rejection，涉及 EDF / FP、Preemptive / Nonpreemptive 变体中的 `sched_valid`、`sched_jobs_must_be_ready_to_execute` 和 `sched_nonpreemptive_next` 等声明。
这里需要区分已经确认的错误，以及尚未完全验证的上游传播路径。
### 3.1 已确认：`JobArrival` 保存了较具体的 Interpretation
前面已经确认：
$$
I(T)=\max(u_E,u_A)
$$
这个结果保存在已经接受的 `JobArrival` Translation 中。后续 Declarations 会使用已翻译好的 Dependencies，而不会自动重新翻译并重新选择这些 Dependencies 的 Universe Interface。
### 3.2 已确认：Helper Reference 的 Universe Argument 被 R3 拒绝
后续 Refinement 在引用以下生成的 Proof Obligation Statement 时发生错误：
```text
eqn_task_arrivals_bound__rocq2lean_obligation_1.statement
```

典型诊断可以简化为：
```text
Reference:
  eqn_task_arrivals_bound__rocq2lean_obligation_1.statement

Actual Universe Argument:
  max u_eqtype_51__c1
      u_extrapolated_arrival_curve_21

R3 Check:
  eqtype.51__c1 + 0
    ≤ extrapolated_arrival_curve.21

Result:
  Not entailed by the source universe graph
```

将这次传入的 Universe Argument 记为：
$$
\boxed{\sigma=\max(u_{E'},u_A)}
$$
其中：
- `u_A` 对应源 Arrival Curve Level `21`。
- `u_E'` 对应 `eqtype.51__c1`，是源 Level `E` 的一个目标 Level Copy。
- `__c1` 是 Translator 在 R-CARRIER / Per-operand Copy 机制中生成的名称，不能直接假设它与原始 `E` 保持所有相同关系。

需要特别区分：`__c` Copies 与 R-SPLIT 使用的 `__s` Binder Copies 是不同的机制。

### 3.3 R3 No-Raising 为什么拒绝这个 Argument？

这次 Helper Reference 的目标 Universe Slot 对应源 Level `A`。

根据 R3 Reference Instantiation 规则，传入这个 Slot 的 Universe Argument 必须能够被 Source Universe Facts 证明不高于 `A`。

因此，需要检查：

$$
\boxed{\sigma\leq u_A}
$$

注意，这不是 Helper 源代码显式声明的一个新 Constraint，而是 Translator 为确保 Reference Instantiation 合法而执行的 R3 No-Raising Check。

代入实际 Argument：

$$
\max(u_{E'},u_A)\leq u_A
$$

这个条件要求：

$$
\boxed{u_{E'}\leq u_A}
$$

但是，Source Universe Graph 并不蕴含这条关系，因此 Translator 必须拒绝该 Reference Instantiation。

即使暂时忽略 Copies，直接考虑原始 Levels，Rocq 已知的关系也是：

$$
A\leq E
$$

而这里需要的是：

$$
E\leq A
$$

方向正好相反。在 `A ≤ E` 的前提下：

$$
\max(E,A)=E
$$

所以如果要求：

$$
\max(E,A)\leq A
$$

实际上就需要：

$$
E\leq A
$$

两者合起来会要求 `E=A`，但源 Universe Graph 并没有要求相等。

对于真实错误中的 Copy `E'`，更不能直接将原始 `A ≤ E` 当作关于 `E'` 的完整关系。当前检查没有源事实依据证明 `E' ≤ A`，因此不能接受 `max(E',A)`。

### 3.4 与 `JobArrival` 的上游关系
目前可以确认：

| 事实 | 状态 |
|---|---|
| `JobArrival` 的 `task.43` 求解为 `max(E,A)` | 已确认 |
| 后续 Helper Reference 使用了 `max(E',A)` | 已确认 |
| R3 因无法证明 `E' ≤ A` 而拒绝 | 已确认 |
| `max(E',A)` 经过哪些中间 Declarations 从 `JobArrival` 传播而来 | 尚未完整验证 |

因此，当前可以将它描述为 Upstream Universe Coupling Diagnosis，但不能仅凭两个 `max` Expressions 的相似形状，就断言已经验证了完整 Dependency Propagation。

简化后的疑似失败链：

```text
JobArrival / JobCost
          │
          │ task.43 solved by Unification
          ▼
I(T) = max(u_E, u_A)
          │
          │ 可能经由中间 Dependencies 传播
          ▼
Later Prosa Refinement
          │
          │ Helper Reference Argument
          ▼
σ = max(u_E', u_A)
          │
          │ R3 No-Raising
          ▼
需要 σ ≤ u_A
          │
          ▼
需要 u_E' ≤ u_A
          │
          ▼
Source Facts 无法证明
          │
          ▼
UNIVERSE_REJECTED
```

## Step 4. 使用具体数字理解失败

为了展示冲突机制，先忽略 Copy `E'`，使用原始 Levels。

假设：

$$
A=1,\qquad E=3,\qquad T=4
$$

满足：

$$
A\leq E\leq T
$$

第一次翻译中，Unification 得到：

$$
I(T)=\max(3,1)=3
$$

该结果满足当前声明要求的下界：

$$
1\leq3,\qquad3\leq3
$$

但后续 Helper 的 Universe Argument 必须不高于 `A=1`。

如果传入：

$$
\sigma=\max(E,A)=3
$$

那么 R3 要求：

$$
3\leq1
$$

显然不成立。

| 检查对象 | Universe Assignment | 结果 |
|---|---|---|
| Rocq 原始 Constraints | `1 ≤ 3 ≤ 4` | 合法 |
| `JobArrival` 的局部求解 | `T := max(3,1) = 3` | 当前检查通过 |
| Helper Reference 的要求 | `σ ≤ A = 1` | 必须满足 |
| 实际传入的 Argument | `σ = max(3,1) = 3` | 拒绝 |

这个数字模型解释的是原始 Levels 的冲突结构。真实 S25i 错误使用 `E'` 的 Copy，因此实际 R3 Check 仍然需要依据 Copy 对应的 Source Facts。

关键是：早期 `max(E,A)` 是当前 Declaration 的合法 Universe Solution，但不能因此认为它可以被所有后续 Universe Slots 接受。

## Step 5. 为什么 Rocq 原本可以接受？

已确认的是，原始 Rocq Development 能够通过 Rocq Type Checking，而当前机械翻译在部分 Lean References 中遇到了 R3 No-Raising 冲突。

一个可能的解释是，Rocq 的 Universe Cumulativity 允许较低 Universe 的类型在较高 Universe Context 中使用，而 Lean 缺少相同形式的隐式 Cumulativity。

为了说明这种差别，假设后续 Helper 的某个 Universe Argument 记为 `H`。

源约束是：

$$
A\leq E\leq T
$$

而 Helper 的对应使用位置允许：

$$
H\leq A
$$

只要 Source AST 没有要求 `H=T`，就可以分别选择：

$$
A=1,\quad E=3,\quad T=4,\quad H=1
$$

于是：

$$
1\leq3\leq4
$$

以及：

$$
H=1\leq A=1
$$

全部成立。

这里最重要的是：

$$
\boxed{H\text{ 不一定等于 }T}
$$

但是，如果 Lean Translation 在 Universe Unification 或 Reference Instantiation 中，将 Helper 的 Argument 绑定到较大的 Expression：

$$
H:=\max(E,A)
$$

那么 Helper 就必须满足：

$$
\max(E,A)\leq A
$$

从而引入原始 Source Graph 不保证的 `E ≤ A`。

因此，这个案例揭示的一种可能机制是：源语言中不必具有相同 Universe Interpretation 的两个使用位置，在目标翻译时被耦合到了同一个表达式。

但真实 `H`、`T` 在 Source AST 中的关系，以及究竟是哪一次 Unification 或 Reference Instantiation 导致了耦合，还需要结合完整 Trace 验证。这里的 `H` 是用于解释机制的简化记号，而不是已确认的源码变量。

## Step 6. 为什么早期 Universe Checking 没有发现？

第一次翻译 `JobArrival` 时，Translator 主要检查当前 Declaration 的候选结果。

| 检查内容 | `JobArrival` 结果 |
|---|---|
| Lean Unification 是否成功 | 成功，得到 `max(E,A)` |
| 当前 Solution 是否满足适用的 Source Facts | 通过 |
| Type / Body 是否通过 Lean Kernel | 通过 |
| 当前 Universe / Interface Checks | 通过 |
| 是否保留 `T` 所有合法的独立取值 | 没有独立的 `u_T` |
| 是否兼容未来全部 Dependencies | 尚未检查 |

因此，早期成功不意味着当时存在未被发现的 Universe Constraint Violation。

问题在于，Translator 按 Declaration 顺序处理，并接受通过当前检查的候选。已经保存的 Universe Interface 后续通常不会因为另一个 Declaration 的失败而自动重新求解。

在 S25i 中，`JobArrival` 和 `JobCost` 都接受了 `task.43 := max(E,A)`。随后，八个 Refinement Declarations 在 Helper Reference 处遇到 `E' ≤ A` 无法证明的问题。

这类上游问题还可能通过 Dependency Chain 影响更多 Prosa Rows。此前诊断将其归入涉及 81 Rows 的失败组，但不能认为 81 Rows 全部具有相同的直接 R3 Error。

因此：

$$
\boxed{
\text{Local Translation Success}
\not\Rightarrow
\text{Downstream Compatibility}
}
$$


## 总结

整个案例可以概括为：

```text
Rocq Source Facts:
    A ≤ E ≤ T
    不要求 E ≤ A

Early Translation:
    I(T) = max(u_E, u_A)
    JobArrival / JobCost 局部检查通过
    但 T 不再拥有独立 Parameter

Later Helper Reference:
    σ = max(u_E', u_A)

R3 No-Raising:
    要求 σ ≤ u_A
         │
         ▼
    需要 u_E' ≤ u_A
         │
         ▼
    Source Facts 不蕴含
         │
         ▼
    UNIVERSE_REJECTED
```

`JobArrival` 的问题不是早期 Universe Solution 不满足 Source Constraints，而是局部合法的 Unification 结果可能过早固定了 Universe Interpretation，失去独立的 `T`，并在后续 References 中形成不必要的 Level Coupling。

当前已确认早期 `task.43 := max(E,A)` 和后续 `max(E',A)` 的 R3 Rejection；完整的上游传播链仍需实际 Trace 才能最终确定。

因此，这个 Case Study 的核心结论是：Universe Translation 不仅需要检查当前 Declaration 是否能够通过 Lean Kernel，还需要关注早期保存的 Universe Interface 是否保留了足够的 Generality，以支持后续 Declarations 的合法 Universe Instantiation。

### 补充：`JobArrival` 涉及哪些结构？
在 Prosa 中，**Task（任务）** 描述一类需要执行的工作，而 **Job（作业）** 是某个 Task 的一次具体执行实例。
它们之间有以下依赖关系：
`ArrivalCurvePrefix` → `task_arrivals_bound` → `concrete_task` → `concrete_job` → `JobArrival`
具体来说：
1. `ArrivalCurvePrefix`：描述任务的到达曲线，即在一定时间范围内，任务最多可能到达多少次。
2. `task_arrivals_bound`：描述任务的到达模式，可以是周期性（`Periodic`）、偶发性（`Sporadic`），或者使用 `ArrivalCurvePrefix`。
3. `concrete_task`：记录一个 Task 的信息，包括 ID、执行开销、Deadline，以及 `task_arrivals_bound`。
4. `concrete_job`：记录一个具体 Job 的信息，包括到达时间（`concrete_job_arrival`）、执行开销，以及它所属的 `concrete_task`。
5. `JobArrival`：一个 Typeclass，提供 `job_arrival : Job → instant` 接口，用于获取某个 Job 的到达时间。具体的 `JobArrival` Instance 使用 `concrete_job_arrival` 实现这个接口。
这里还有 MathComp 的 `eqType`：它表示带有可判定相等关系的类型。Prosa 将 `concrete_job` 注册为 `eqType`，使 Job 可以使用 MathComp 的相等性操作。
因此，虽然 `JobArrival` 本身只负责取得 Job 的到达时间，但它的输入类型 `concrete_job` 包含 `concrete_task`，而后者又包含 Arrival Curve 相关结构。
这就解释了为什么在翻译 `JobArrival` 时，Translator 可能同时遇到三个来源不同的 Universe Levels：
- `E`：MathComp `eqType` 相关的 Level。
- `A`：Arrival Curve 相关的 Level。
- `T`：Task 相关的 Level。

**注意：这些 Universe Levels 不是 Job 的到达时间或 Arrival Curve 的数值，而是 Rocq 类型系统中用于约束 Type 所在层级的变量。** 它们之间具体有哪些大小约束，仍然需要查看 Rocq 导出的 Universe Graph。

Both relations hold in the universe graph Rocq exported for the Prosa corpus (run S25i). That export records Rocq’s own answer, from its universe-graph check, for every ordered pair of levels in the corpus.

|Relation|In Rocq’s graph|
|---|---|
|`eqtype.51 ≤ task.43`|**holds** (`le`)|
|`task.43 ≤ eqtype.51`|not entailed|
|`extrapolated_arrival_curve.21 ≤ task.43`|**holds** (`le`)|
|`task.43 ≤ extrapolated_arrival_curve.21`|not entailed|
|`extrapolated_arrival_curve.21 ≤ eqtype.51`|holds (`le`)|
|`eqtype.51 ≤ extrapolated_arrival_curve.21`|not entailed|
|`Set < each of the three`|holds (`lt`)|

The full level names are `mathcomp.boot.eqtype.51`, `prosa.implementation.definitions.task.43` and `prosa.implementation.definitions.extrapolated_arrival_curve.21`.
**What this means:**
- **Not strict.** Both of your relations are `≤`, not `<`. Rocq allows the two sides to be equal, but doesn’t require it.
- **A chain.** Rocq actually forces `extrapolated_arrival_curve.21 ≤ eqtype.51 ≤ task.43`, so your second relation also follows from the first plus this extra one.
- **None of them are forced equal.** Every reverse direction is “not entailed”. Merging any two of these levels into one Lean parameter would therefore narrow the statement, unless that is done only where the levels aren’t input universes.
- **“Not entailed” isn’t “false”.** It means Rocq doesn’t require the relation. A particular choice of universe values may still satisfy it.