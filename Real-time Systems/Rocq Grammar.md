
| Thing     | Role                                        | Example                                              |
| --------- | ------------------------------------------- | ---------------------------------------------------- |
| Rocq      | base language / proof assistant             | `Definition`, `Lemma`, `forall`, `->`                |
| SSReflect | proof tactic language/style                 | `move=>`, `have`, `by`, `rewrite /foo`               |
| MathComp  | mathematical library built around SSReflect | `eqType`, `seq`, `\sum_`, `ltnNge`                   |
| Prosa     | real-time scheduling library built on these | `schedule`, task/job models, schedulability theorems |
### Context
`Context` **introduces assumptions/variables without giving them a concrete value**.
```coq
(1.1) Context {Job : eqType}.
```
- Assume there is some type `Job` with equality support. 
- `eqType` is a MathComp type meaning a type whose elements can be compared using equality. Thus, we can write `j1 == j2` which evaluates to Boolean. This is important as schedules frequently need to check is the job scheduled at time t exactly the same job.
	- `Context {Job : Type}.` only says `Job` is some arbitrary Rocq type.
```coq
(1.2) Context (x : nat).
```
- Assume there is some natural number `x`.
- Again, Rocq does not know whether `x` is `1`, `5`, `100`
- By contrast, `Definition notebook_time := 5.` Define `notebook_time` concretely to be `5`.

### Variable
`Variable` introduces an arbitrary object of a given type without defining what its actual value/function is.
```coq
(2.1) Variable x : nat.
```
- Assume some `x` of type `nat`, but we do not know its concrete value.
```coq
(2.2) Variable job_arrival : Job -> time.
```
- Assume some function job_arrival that maps each Job to a time.
- Rocq knows the function's interface/type (takes Job and produces time), but does not know its actual mapping (what arrival time each job actually has, such as `J1 → 3`) unless define that separately. 
- `Variable job_arrival : Job -> time.`一开始的定义是可以是任意满足这个类型的函数, 约束是在hypothesis里慢慢加上去的，比如说`time > 0.` 然后可以通过 `Hypothesis` 给这个任意函数逐渐增加约束。例如：`Hypothesis H_arrival_positive :forall j, 0 < job_arrival j.` 这就相当于不再考虑所有 Job -> time 函数，只考虑那些每个 job 的 arrival time 都大于 0 的函数。
### `Definition`
`Definition` **creates a named object and gives it an actual definition/value**.
```coq
Definition name (arguments...) := expression.
```
**Full Syntax:** `Definition name (arguments...) : ReturnType := expression.`
- The result type is determined by `expression`. For example, this definition returns a number:
```coq
	Definition double (n : nat) := n + n.
	Full syntax: Definition double (n : nat) : nat := n + n.
```
`double 3` becomes: `3 + 3 → 6.` Here, `input: nat, output: nat`
- Another definition can take no input and return a function:
```coq
	Definition add_one := fun n => n + 1.
```
- Another definition can take and return a pair of natural number:
```coq
	Definition make_pair (a b : nat) := (a, b).
```
 $\boxed{\texttt{Definition}=\text{give a name to some expression/computation}}$ The expression can return many different kinds of values, such as `bool`, `nat`, `Job`, `time`, a pair, a list, a function, or a proposition.
```coq
(3) Definition scheduled_at (j : Job) (t : time) := sched t == Some j.
```
-  expression `sched t == Some j` checks whether `sched t` returns `Some j`. For example, `sched 5 = Some J1` means `J1` is running at time 5.
- `scheduled_at j t` means: **Is job `j` scheduled at time `t`?**

```coq
(4) Definition service (j : Job) (t : time) :=
  \sum_(0 <= t' < t) scheduled_at j t'.
```
- The syntax `\sum_(...)` comes from MathComp's big operators,  counting how many time slots before `t` were allocated to job `j`.
$$
\sum_{0\le t'<t} scheduled\_at(j,t')
$$
-     Assume: `time       0   1   2   3   4`
			`schedule   J1  J1  J2  J1  ...`
    Then `service J1 4` computes:
```text
	scheduled_at J1 0 = 1
	scheduled_at J1 1 = 1
	scheduled_at J1 2 = 0
	scheduled_at J1 3 = 1
	service = 1 + 1 + 0 + 1 = 3`
```
- `service j t` represents how much processor service job `j` has received before time `t`.

```coq
(5) Definition completed_by (j : Job) (t : time) :=
  job_cost j <= service j t.
```
Mathematically means:
$$
C_j\le service(j,t)
$$
If `job_cost j = 3` and `service j t = 3`, then the job has completed. `completed_by j t` means Job `j` has received enough processor service to complete by time `t`.

```coq
(6) Definition notebook_time : instant := 5.
```
- `notebook_time` takes no input arguments
- Its  type is explicitly declared as `instant`, with value of 5. When use the name `notebook_time`, Rocq unfolds it to the value 5 of type instant.
- a `Definition` does not need to take inputs. It can just assign a name to a value.

### `Hypothesis`
A `Hypothesis` is something Rocq is allowed to assume. General syntax:
```coq
Hypothesis name : proposition.
```
Rocq does not automatically verify that the real schedule actually satisfies the `Hypothesis`.
```coq
(7) Hypothesis H_service_leq_job_cost:forall j t, service j t <= job_cost j.
```
The assumption states:
$$
\forall j,t,  service(j,t)\le cost(j)
$$
for every job and every time. In other words, the schedule never gives a job more execution time than it needs.

### Lemma
A Lemma is a statement Rocq will prove from the existing definitions, variables, and hypotheses.
```coq
(8) Lemma scheduled_implies_not_completed :
  forall j t, scheduled_at j t -> ~~ completed_by j t.
```
The arrow `scheduled_at j t -> ...` means implication $scheduled\_at(j,t)\Rightarrow ...$
The expression `~~ completed_by j t` is MathComp boolean negation.
So the theorem means:
$$
scheduled\_at(j,t)\Rightarrow\neg completed\_by(j,t)
$$
or: **If job `j` is scheduled at time `t`, then it has not already completed by time `t`.**

# Starting the Proof
`Proof` switches Rocq into **proof mode**. Conceptually, Rocq creates:
```text
∀ j t, scheduled_at j t → not completed_by j t
```
The following tactics from SSR library gradually transform this goal until nothing remains.

### `move=>`
`move=>` introduces variables/assumptions from the front of the goal into the local proof context.
```coq
Lemma example :
  forall x, P x -> Q x.
Proof.
  move=> x H.
```
- changes `∀ x, P x → Q x` into:
	x : ..., 
	H : P x
	================
	Q x
	- Meaning: Take `x` and the assumption `P x` from the goal, give them the local names `x` and `H`, and now prove `Q x`
- SSReflect introduces the variable `x` and the assumption `P x` into the local context 
### `rewrite /completed_by`
`rewrite` transforms the current goal by replacing one expression with an equivalent expression given by a definition or lemma.
```
Lemma example (a b : nat) :
  a + b = b + a.
Proof.
  rewrite addnC.
Qed.
```
- `addnC` is the commutativity lemma `addnC : forall a b, a + b = b + a`
- The goal starts as `a + b = b + a` 
- After `rewrite addnC.`, Rocq finds the expression `a + b`, and rewrites it using `a + b = b + a`, so the goal becomes `b + a = b + a` which is obviously true.
Suppose`Lemma H : x = y.`
- `rewrite H.` does `x  →  y`
- `rewrite -H.` does `y  →  x`
- The `-` before a lemma means to use the rewrite rule **backwards**:
	```text
	rewrite lemma     : left → right
	rewrite -lemma    : right → left
	```
### `have`
have proves or obtains an intermediate fact, gives it a name, and adds it to the local proof context to use it later.
Suppose we already know `H1 : a <= b, H2 : b <= c` and eventually want to prove something involving `a <= c`. First create that intermediate fact:
```
have H3 : a <= c := leq_trans H1 H2.
```
- `:=`  Here is the expression that proves it.
- Create a fact named `H3` whose type is `a <= c`, using `leq_trans H1 H2` as the proof.
- We can also write `have H3 := leq_trans H1 H2.` Rocq looks at the result of `leq_trans H1 H2` and figures out that `H3 : a <= c`. 
- If we want to separate the proof
	```
	have H3 : a <= c.
	{
	  exact: leq_trans H1 H2.
	}
	```

Suppose the hypothesis is:
```coq
Hypothesis H_service_leq_job_cost :
  forall j t,
    service j t <= job_cost j.
```
- This is a general fact $\forall j,t,\quad service(j,t)\le cost(j)$. It works for **any** job `j` and **any** time `t`.
Now we specifically want this fact for the current job `j` at time `t + 1`
```coq
have H_comp := H_service_leq_job_cost j (t + 1).
```
The proof context now contains:
```text
j : Job
t : time
...
H_service_leq_job_cost :
  forall j t, service j t <= job_cost j

H_comp :
  service j (t + 1) <= job_cost j
========================================
current goal
```
The important point is that `have H_comp := H_service_leq_job_cost j (t + 1)` does not create a new assumption out of nowhere. It takes an existing general fact and specializes it to the particular `j` and `t + 1` needed in the current proof.

#### `Fixpoint`
`Fixpoint` 在 Rocq 里是定义递归函数，要求这种递归能够被 Rocq 判断为一定会终止。
```
Fixpoint rocq_nat_to_imported (n : nat) : Nat :=
  match n with
  | O => Nat_zero
  | S n' => Nat_succ (rocq_nat_to_imported n')
  end.
```
- 定义函数 rocq_nat_to_imported
- 输入：n : Rocq 自己的 nat / 输出：Nat，也就是从 Lean 导进来的 Nat
- `rocq_nat_to_imported n'` 函数在自己的定义里面又调用了自己，所以是**递归函数**，因此不能只是普通的 `Definition`，这里使用 `Fixpoint`。
- rocq_nat_to_imported 2 实际上相当于 `rocq_nat_to_imported (S (S O))` `→ Nat_succ (rocq_nat_to_imported (S O)) → Nat_succ (Nat_succ (rocq_nat_to_imported O)) → Nat_succ (Nat_succ Nat_zero)` 
实际上就是按照下方的对应一层一层地转换过去
```
Rocq nat                imported Lean Nat
O          ─────────→   Nat_zero
S O        ─────────→   Nat_succ Nat_zero
S (S O)    ─────────→   Nat_succ (Nat_succ Nat_zero)
...
```
- 这个 bridge 之所以必须递归，是因为两个 `nat` 虽然语义上都是自然数，但在 Rocq kernel 看来是**两个不同的 inductive type**，所以只能把 `O/S` 和 `Nat_zero/Nat_succ` 一层层对应起来。