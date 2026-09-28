#### Types and ":"
`:` means left-hand side has the type shown on the right-hand side.
`n : Nat` 
- `n` is an object/value
-  `Nat` is a type
- `:` connects the object to its type
``` 
P : Prop
hP : P
```
- `Prop` is the type of propositions
- `P` is a proposition
- `hP` is a proof/value of type `P`, `hP` proves `P` is True
Types themselves also have types. For example, `Nat : Type`,  `Bool : Type`
#### Proposition
proposition（命题）是一个“可以被证明为真的陈述”。
Example Propositions:
- 3 = 0：“3 等于 0”这个命题。
- P → Q: 如果 P，那么 Q
- `∀ x : Nat, x + 0 = x`: 对于所有自然数 x，x + 0 = x
`theorem one_plus_one : 1 + 1 = 2 := by rfl`
  - 1 + 1 = 2 is a proposition
  - `:= by`: Start constructing the proof to the proposition
  - `rfl` is the proof/value to the proposition
Proposition can be defined via functions
`def IsZero (n : Nat) : Prop := n = 0`
- `IsZero` is a function takes `natural` as input and return a proposition
#### Theorem Keyword
`theorem` keyword gives a **name to a proof** of a proposition.
- **Format:** `theorem name : proposition := proof`
`theorem four_eq_four : 4 = 4 := by rfl`
- Define an object called `four_eq_four`, whose type is the proposition `4 = 4`, and whose value is a proof of that proposition.
`theorem implication_chain (P Q R : Prop)(hPQ : P → Q) (hQR : Q → R) : P → R := by`
- The things in `(...)` are **parameters supplied to the theorem**. In a proof, they are available from the beginning.
- `P Q R : Prop` means we are considering arbitrary propositions `P`, `Q`, and `R`.
- (hPQ : P → Q) means we assume a proof that `P → Q`
- When the proof starts, Lean already knows `P Q R : Prop`, `hPQ : P → Q`, `hQR : Q → R`, and the goal is `⊢ P → R`. 
#### def keyword
`def`  **introduce a named definition**. That definition can be a function, a value or even proposition.  
- **Format:** `def name : type := value`
`def x : Nat := 4`
- `x` is a value with type `x : Nat`
`def double (n : Nat) : Nat := n + n`
- `double` is a function with type `double : Nat → Nat`
`def IsFour (n : Nat) : Prop := n = 4`
- `IsFour` is a function with type `IsFour : Nat → Prop.` Takes a natural number and returns a proposition.
#### intro keyword
`intro` moves the premise of an implication into the local context so it can be used in the proof.
When the goal has the form P → Q, intro automatically takes the left side of the implication and puts it into the local context as a hypothesis.
```
theorem identity_implication (P : Prop) : P → P := by
  intro hP
  exact hP
```
- The name `hP` is just the name chose for the newly introduced proof of P
Before `intro`: 
- `P : Prop`
  `⊢ P → P`
After `intro hP`:
- `P  : Prop`
- `hP : P # hypothesis, a proof/assumption that `P` is true`
- `⊢ P # This is the current goal, need to prove P`

#### Constructor
A constructor is a special function used to build a value of an inductive type.
`And` is an inductive proposition, Lean defines it as:
`inductive And (a b : Prop) : Prop where`
`  | intro (ha : a) (hb : b) : And a b`
- `And a b` has one constructor called `And.intro`
- The type is `And.intro : a → b → And a b`. `And.intro` is a function, that takes a proof of `a`, then a proof of `b`, and returns a proof of `And a b`

`constructor` tactic
The `tactic` looks at the current goal, finds the constructor for inductive type of the goal, applies it and turns the constructor's required inputs into new goals.
```
theorem pair_proofs (P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q := by
  constructor
  · exact hP
  · exact hQ
```
- The goal is `⊢ P ∧ Q`
- With tactic `constructor`, Lean recognizes that the goal `P ∧ Q` is built with `And.intro : P → Q → P ∧ Q`
- Lean starts constructing `And.intro ?proofOfP ?proofOfQ`, the `?` parts are missing, so Lean turns them into goals. `goal 1: ⊢ P`, `goal 2: ⊢ Q`. Since there are two goals, the bullet `.` starts a tactic block for one current subgoal.
- `· exact hP` solves the first goal because `hP : P` The type of `hP` exactly matches the goal. `· exact hQ` solves the second goal.
- After Lean obtained both arguments, it will construct `And.intro hP hQ` which has type `P ∧ Q`. The theorem can even be written as `theorem pair_proofs (P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q := And.intro hP hQ`
- The output value from the theorem is  proof `And.intro hP hQ`, with type `P ∧ Q`, indicating it is a proof for the proposition  `P ∧ Q`

#### Inductive type 
An **inductive type** is a type whose possible values are defined by a set of **constructors**. Consider Lean's `Or`
`inductive Or (a b : Prop) : Prop where`
`  | inl (h : a) : Or a b`
`  | inr (h : b) : Or a b`
- **`| inr (h : b) : Or a b`** defines a constructor called `inr`. It takes an argument `h` whose type is `b`, and after receiving that argument, it produces a proof whose type is proposition `Or a b`. 
- A proof of `Or a b` can be constructed in exactly two ways.
- Either `Or.inl h` where `h : a`, with function type `Or.inl : a → Or a b`
- Or `Or.inr h` where `h:b`, with function type `Or.inr : b → Or a b`
- If we already have `hP : P`, then to construct a proof of the proposition `Or P Q` (that is, `P ∨ Q`), we can use the constructor `Or.inl`, because `Or.inl` requires a proof of `P`.  From `Or.inl : P → P ∨ Q` and we have `hP : P`, we can build `Or.inl hP : P ∨ Q`

#### Cases keyword
`cases` is used to take apart an existing value of an inductive type, whose value is coming from multiple constructors. The branches of cases correspond to the constructors of the inductive type.
Consider `h : P ∨ Q`
- Lean knows `h` must have been constructed in one of exactly two ways.
- `h = Or.inl someProofOfP` or `h = Or.inr someProofOfQ`
- Thus, `cases h with` introduces 2 branches, `| inl hP => ...`  and `| inr hQ => ...`
```
theorem swap_or (P Q : Prop) : P ∨ Q → Q ∨ P := by
  intro h
  cases h with
  | inl hP =>
      exact Or.inr hP
  | inr hQ =>
      exact Or.inl hQ
```
- The goal is assuming `P ∨ Q`, prove `Q ∨ P`.
- After `intro h`, `h` is a proof value of the inductive proposition `P ∨ Q`, `h: P ∨ Q`
- Since `Or` has two constructors, `h` must be either `Or.inl hP` with `hP : P`, or `Or.inr hQ` with `hQ : Q.` `cases h with` let Lean makes one branch for each constructor.
`| inl hP => exact Or.inr hP`
- **`| inl hP =>`** handles the case where `h` was constructed using the `Or.inl` constructor. The value, or the **constructor argument** that was passed into `Or.inl` is extracted and given the local name `hP`. 
- The branch used `Or.inl` and because `Or.inl : P → P ∨ Q`,  the value passed into the constructor must be a proof of `P`, Lean automatically knows `hP : P.` 
- Now we need `⊢ Q ∨ P` and we have `hP : P`. In `Q ∨ P`, `P` is the right side. Therefore use the right constructor `Or.inr hP : Q ∨ P`, `exact Or.inr hP` solves the branch.
```
Or.inl          : P → P ∨ Q     ← constructor/function

hP              : P             ← constructor argument

Or.inl hP       : P ∨ Q         ← constructed proof
```
`constructor` versus `cases`
- When there is a goal and want to build an inductive value `⊢ P ∧ Q`, use `constructor` tactic since we are constructing proof.
- When already have an inductive value `h : P ∨ Q` and want to take it apart, use `cases h` to show how could this existing value have been built.
#### Simp Tactic
`simp` is Lean’s simplification tactic. It transforms the current goal into a simpler equivalent form using built-in simplification rules and lemmas.
```
example : 0 + 3 = 3 := by
  simp
```
- Lean knows rules such as `0 + n = n`, `true && b = b`
- so `simp` can often solve simple goals automatically.
```
def IsEven (n : Nat) : Prop :=
  ∃ k, n = 2 * k
  
theorem zero_is_even : IsEven 0 := by
  refine ⟨0, ?_⟩
  simp
```
- `refine ⟨0, ?_⟩` provides `0` as witness, leaving `⊢ 0 = 2 * 0`
- Then `simp` simplifies `2 * 0` to `0`, so the goal becomes `⊢ 0 = 0` which `simp` can finish

#### <;> Tactic
`tactic1 <;> tactic2`
- Run `tactic1`, and then run `tactic2` on every goal produced by `tactic1`.
- Very useful when the first tactic creates multiple subgoals.
```
theorem and_true_does_nothing (b : Bool) : (b && true) = b := by
  cases b <;> simp
```
- Recall that `Bool` is an inductive type with two constructors `false : Bool` and `true  : Bool`
- `case b` means consider every possible way `b : Bool` could have been constructed, and there are two cases.
- case `b = false`, the goal becomes `⊢ (false && true) = false`
- case `b = true`, the goal becomes `⊢ (true && true) = true`
- `<;>` tells Lean run `simp` on both goals, both of the goals are resolved easily.
Therefore, `cases b <;> simp` is a compact version of 
```
cases b with
| false =>
    simp
| true =>
    simp
```

#### induction Tactic
`induction` is a tactic used to prove a statement about all values of an inductive type. For a natural number `n`, mathematical induction is proving the statement for `0`, then prove that if it is true for `n`, it is also true for `n + 1`. 
```
induction n with
| zero =>
    -- prove the zero case
| succ n ih =>
    -- prove the successor case
```
`Nat` itself is an inductive type defined in Lean
```
inductive Nat where
  | zero : Nat
  | succ (n : Nat) : Nat
```
- Every natural number is constructed in one of the two ways, `Nat.zero` or `Nat.succ n`
- Therefore, to prove something arbitrary `n : Nat`, there are fundamentally two situations, `n = 0` and `n = Nat.succ k`. Hence, `induction n with` produces a `zero` branch and a `succ` branch
```
theorem zero_add_by_induction (n : Nat) : 0 + n = n := by
  induction n with
  | zero =>
      rfl
  | succ n ih =>
      exact congrArg Nat.succ ih
```
- The theorem says for every natural number `n`, prove `0 + n = n`.
- Initially Lean has `n : Nat` with goal `⊢ 0 + n = n`
- `induction n with` performs induction on `n`. Because `Nat` has the constructors `zero` and `succ`, Lean creates two branches.
- `| zero => rfl` means handle the case where `n = 0`, substitute `n` into the original proposition `0 + n = n`, Lean computes to `⊢ 0 = 0`, which is solved by `rfl`
- `| succ n ih =>`, handle the case where the original natural number was built as `Nat.succ n`, `n` is the smaller number inside the successor. `ih` is the induction hypothesis. That is the theorem you're proving, but for the smaller `n`
- The successor case goal is 
	`n : Nat `
	`ih : 0 + n = n `
	`⊢ 0 + Nat.succ n = Nat.succ n`
-  Because addition on the successor reduces `0 + Nat.succ n` to `Nat.succ (0 + n)`, the goal becomes `⊢ Nat.succ (0 + n) = Nat.succ n`
- We already know `0 + n = n` and need `Nat.succ (0 + n) = Nat.succ n`. Simply apply `Nat.succ` to both sides
`congrArg Nat.succ ih`
- `congrArg` has the general idea `if a = b` then `f a = f b`
- `congrArg : (f : α → β) → a = b → f a = f b`
- We have `ih : 0 + n = n` and the function is `Nat.succ`. Thus, `congrArg Nat.succ ih` takes `0 + n = n` and produces `Nat.succ (0 + n) = Nat.succ n`. Therefore `exact congrArg Nat.succ ih` exactly matches the successor-case goal
```
theorem zero_add_by_induction (n : Nat) : 0 + n = n := by
  induction n with
  | zero =>
      rfl
  | succ n ih =>
      have hsucc : Nat.succ (0 + n) = Nat.succ n :=
        congrArg Nat.succ ih
      exact hsucc
```
- A clearer version where the new equality is created as an intermediate proof.

#### Apply
`apply = work backwards from the goal`
`apply` uses a theorem/hypothesis whose conclusion matches current goal and turns its required premises into new goals.
Suppose we have `h : P → Q` and the current goal is `⊢ Q`.
The `apply h` changes the goal to `⊢ P` since Lean reasons if `P` can be proved, then `h : P → Q` offers `Q`.
```
theorem apply_example (P Q : Prop) (hPQ : P → Q) (hP : P) : Q := by
  apply hPQ
  exact hP
```
- Initially `hPQ : P → Q`, `hP  : P`, `⊢ Q`
- After `apply hPQ`, Lean has `hP  : P`,` ⊢ P`
- `exact hP` solves it.

#### decide
`decide` proves a proposition by computing whether its true, provided Lean has a `Decidable` instance for that proposition.
```
theorem three_less_than_five : 3 < 5 := by
  decide
```
-  Initially `⊢ 3 < 5`
- Then `decide` computes the proposition and solves the goal.
- Especially useful for computable propositions
```
	example : 3 ≠ 7 := by
	  decide
	
	example : 10 ≤ 20 := by
	  decide
```
- But `decide` is not a general theorem prover. For example, for arbitrary propositions `P Q : Prop`, then `decide` cannot magically prove `⊢ P → Q` because it does not know whether arbitrary `P` and `Q` are true.
`simp → simplify using known rewriting rules `
`decide → compute whether a decidable proposition is true`

#### have
`have` creates an intermediate proof and names it.
```
have name : proposition := by
  proof
```
Suppose final goal is difficult, but we first want to establish `P`.
Write `have hP : P := by...` Then later we can use `hP : P` just same as using other hypotheses.
```
theorem have_example
    (P Q : Prop)
    (hPQ : P → Q)
    (hP : P) : Q ∧ Q := by

  have hQ : Q := by
    apply hPQ
    exact hP

  constructor
  · exact hQ
  · exact hQ
```
- At the beginning `P Q : Prop`, `hPQ : P → Q`,  `hP : P` and the goal is `⊢ Q ∧ Q`
- We do not currently have `hQ : Q`, we only know `hPQ : P → Q` and `hP  : P`
- we can derive `Q`. First prove the intermediate proposition `Q`, and store its proof under the name `hQ`.
- After the `have` block, we return to the original goal with a new fact available 
```
	hPQ : P → Q
	hP  : P
	hQ  : Q
	⊢ Q ∧ Q
```
- Then `constructor` creates `goal 1: ⊢ Q`,` goal 2: ⊢ Q` and we reuse the intermediate proof twice `· exact hQ`, `· exact hQ`.
- `have` proves an intermediate fact once, give it a name, and then use that fact later—possibly multiple times.
`have` is **not necessary**. It is possible to write a shorter proof without it. Its main value is making longer proofs more structured and readable, especially when an intermediate result is complicated or reused.

#### rw
`rw` means **rewrite**. It replaces one expression with an equal expression using an equality proof.
- Syntax: `rw [equality]` 
- Rewrite in opposite direction: `rw [← equality]` 
```
theorem rw_example (a b : Nat) (h : a = b) : a + 1 = b + 1 := by
  rw [h]
```
- Initially
```
	a b : Nat
	h : a = b
	⊢ a + 1 = b + 1
```
- After `rw [h]`, Lean replaces `a` with `b`. `⊢ b + 1 = b + 1`. 
- The resulting reflexive equality is automatically closed by `rw` here.
```
example (a b c : Nat) : (a + b) + c = (b + a) + c := by
  rw [Nat.add_comm a b]
```
- Here `Nat.add_comm a b` proves only the small inner equality `a + b = b + a`, but our actual goal is bigger `(a + b) + c = (b + a) + c`
- `exact Nat.add_comm a b` does not match the goal
- Instead, `rw` takes the equality `a + b = b + a` and apply the equality on `(a + b) + c`, giving `(b + a) + c`, leading the goal to `⊢ (b + a) + c = (b + a) + c
For `exact h`, `h` itself is already a proof of the whole goal.
For `rw [h]` , `h` is an equality can be used to replace part of goal with an equal expression.