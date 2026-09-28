Rocq is a proof assistant, give Rocq precise math definitions, assumptions and a theorem. Then after constructing a proof, Rocq will check whether every step is logically valid.
**How Rocq works**: Definitions + Theorem + Proof goals → Rocq → Rocq kernel checks a formal proof object according to its underlying logic/type system → valid proof / proof error
#### **Tactics**
Tactics in Rocq are commands that telling Rocq how to attack the current proof goal,  helping construct a proof step by step. Suppose we want to prove:
$$
\forall n\in\mathbb{N},\quad n+0=n.
$$
In Rocq, the initial proof goal may look like `forall n : nat, n + 0 = n `
This means Rocq is asking to prove that for every natural number $n$, we have $n+0=n$. Then apply **tactics** one by one to transform or simplify the current goal.
Rocq proof is often an interactive process of:
$$
\boxed{
\text{Goal}
\rightarrow
\text{Tactic}
\rightarrow
\text{New Goal}
\rightarrow
\text{Tactic}
\rightarrow
\cdots
\rightarrow
\text{No Goals}
}
$$
When no proof goals remain, Rocq has successfully constructed and verified the proof.
#### **Tactics Example**
```coq
Theorem add_zero :
  forall n : nat, n + 0 = n.
Proof.
  intros n.
  induction n.
  - reflexivity.
  - simpl.
    rewrite IHn.
    reflexivity.
Qed.
```
Here, `intros`, `induction`, `simpl`, `rewrite`, and `reflexivity` are all tactics.
- **intros:** `intros n` introduces an arbitrary natural number n, puts n into the context (the list of assumptions). The goal becomes $\forall n,\ P(n)\rightarrow P(n).$ `intros` moves universally quantified variables into the proof context.
- **reflexivity:** If the goal is `0 = 0`, then `reflexivity` solves it immediately.
- **simpl:** Let Rocq calculate the obvious parts. Suppose the current goal is `S n + 0 = S n`, where `S n` means the successor of n. So the goal intuitively means $(n+1)+0=n+1.$ When running `simpl.`, Rocq looks at the formal definitions of operations such as natural-number addition and performs the computation that is immediately possible.
	- For natural numbers, addition is defined recursively as `0 + m = m, S n + m   = S (n + m).` Therefore,  $S\,n+0$ can be simplified to `S(n+0).` This convert the goal into `S (n + 0) = S n`
	$\boxed{\texttt{simpl}=\text{automatically evaluate and simplify what Rocq can compute directly}}$
- **rewrite:** Use a known equality or theorem to transform the current expression. Suppose the context contains `H : x = y` and the goal is `x + 1 = 5.` Running `rewrite H` replaces x with y,  offering `y + 1 = 5`
- apply: Suppose already know $A\rightarrow B$ and the current goal is $B$, running `apply theorem_name` changes the goal to $A$ 
- induction: If the goal is $\forall n,\ P(n),$ then after introducing `n, `Rocq creates two cases $\boxed{P(0)}$ and $\boxed{P(n)\Rightarrow P(n+1)}$, the second case includes an induction hypothesis, for example `IHn : n + 0 = n`
###  **Full Proof Process**
##### 1. The Setup: `intros n`
**Initial Goal:** `forall n : nat, n + 0 = n`
- **What it means:** "For every natural number `n`, `n + 0` equals `n`."
- **Action:** `intros n` takes the `forall n` out of the goal and puts `n` into the **context** (the list of assumptions on the left side of the screen).
- **New Goal:** `n + 0 = n` (where `n` is now a specific, but arbitrary, natural number).
##### 2. The Split: `induction n`
Because natural numbers are defined recursively (0, and the successor of a number), we use mathematical induction. This splits the goal into two separate branches.
###### Branch A: The Base Case
**Goal:** `0 + 0 = 0`
- **Action:** `reflexivity`
- **How it resolves:** In Rocq/Coq, addition (`+`) is defined as a recursive function. When it sees `0 + 0`, it matches the base case of the addition definition, which says "0 plus anything is that thing". Therefore, `0 + 0` **computes/evaluates** directly to `0`.
- The goal becomes `0 = 0`. `reflexivity` checks if both sides are identical. They are. **Goal solved.**
###### Branch B: The Inductive Case
**Context:** We now have `n` (the current number) and the **Induction Hypothesis (IHn)**: `n + 0 = n`. (This is our assumption that the theorem holds true for `n`). **Goal:** `S n + 0 = S n`
Here is how the three tactics resolve this goal:
**Step 1: `simpl
- **Goal before:** `S n + 0 = S n`
- **How `simpl` works:** Rocq looks at the left side (`S n + 0`). According to the recursive definition of addition, adding 0 to a successor `S n` results in `S (n + 0)`. Rocq computes this reduction.
- **Goal after:** `S (n + 0) = S n`
**Step 2: `rewrite -> IHn` (Rewrite using Induction Hypothesis)**
- **Goal before:** `S (n + 0) = S n`
- **How `rewrite` works:** We have `IHn : n + 0 = n` at our context. The `rewrite` tactic tells Rocq: "Wherever you see `n + 0` in the goal, replace it with `n`, as IHn proves they are equal."
- **Goal after:** `S n = S n`
**Step 3: `reflexivity`**
- **Goal before:** `S n = S n`
- **How `reflexivity` works:** Both sides of the equation are now syntactically identical. `reflexivity` confirms this. **Goal solved.**
##### 3. The Final Step: `Qed.`
Once all branches of the tree are solved, type `Qed.` Up until this point, the tactics (`intros`, `induction`, `rewrite`, etc.) were just helping build a massive, complex mathematical object called a **Proof Term** in the background.
When type `Qed.`, Rocq throws away the tactics and passes the Proof Term to the Rocq Kernel.
- The Kernel is a tiny, highly trusted piece of code (only a few thousand lines). It does not use tactics. Kernel simply checks if the proof term match the theorem asked to prove. 
- If yes, the theorem is permanently added to the library. If no, it rejects it.