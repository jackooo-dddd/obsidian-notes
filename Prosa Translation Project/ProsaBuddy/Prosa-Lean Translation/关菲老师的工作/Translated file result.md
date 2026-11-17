
  第一部分：
  把官方 Coq Prosa 基础库翻译成 Lean Prosa
                  ↓
  第二部分：
  把 RTS 论文定理形式化成 Coq Case Study statement
  但不提供 Coq proof（全部 Admitted）
                  ↓
  第三部分：
  把 Case Study statement 翻译成 Lean
                  ↓
  第四部分：
  尝试利用 Lean Prosa 完成原来缺失的 proof

现在需要
1）Prosa 主库的翻译流程和脚本
2）Case Study 的原始 Coq statement和 翻译后的 Lean statement， 
3）Case Study的运行和证明过程

Metrics used in Lean dashboard to evaluate the Translation accuracy

| Overall pipeline progress | What does "proved" means here? |
| ------------------------- | ------------------------------ |
| Total source files        | 317                            |
| Fully proved files        | 219                            |
| Partially proved          | 22                             |
| Definition-only           | 76                             |
**What does file proved means**
Suppose the original Coq file contains:
```
Definition service := ...

Lemma service_zero : ...
Proof.
  ...
Qed.
```
It is translated into a Lean file:
```
def service := ...

theorem service_zero : ... := by
  -- Lean proof
```
The Lean kernel separately checks each theorem does the proof after `:=by` proves the proposition written before `:= by.` If both theorem bodies are valid and do not rely on `sorry`, the dashboard labels the file “fully proven.”

Assume thee following translation and proving process:
```
Coq file
├── definitions
├── theorem statement 1 + Coq proof 1
├── theorem statement 2 + Coq proof 2
└── theorem statement 3 + Coq proof 3
             ↓ translation
Lean file
├── translated definitions
├── translated statement 1 + Lean proof 1
├── translated statement 2 + Lean proof 2
└── translated statement 3 + sorry
```
The file-level status would then be:
```
Proofs: 2/3
Status: partial
Sorry: 1
```

Example of Partially proved file
```
classic/analysis/global/basic/bertogna_edf_theory.v
Declarations: 19/19
Proofs: 3/14
Sorry: 11
Status: partial
```
- All 19 expected declarations were translated.
- Fourteen declarations require proofs.
- Three have completed Lean proofs.
- Eleven still use `sorry`.
#### Metrics used to verify the translated statements
dashboard label A — Declaration Inventory
- Checks whether expected definitions and theorems have Lean counterparts.
- Might detect missing theorem, definitions, or extra declaration
- The report is `2,933 Coq declarations → 3,027 Lean declarations`
dashboard label B — Structural Signature
- Compares structural features such as number of universal quantifiers, number of implications, function arguments.
- A structural match is useful, but two propositions can have similar quantifier counts and still mean different things.
- The report is 2,788 match, 24 suspect, 0 mismatch
dashboard label C — Lean type-checking
- Lean accepted the translated files or generated `#check`/type-print validation.
- It establishes syntactic correctness, but a theorem may still contain `sorry`
- Reported as 317 pass, 0 fail
dashboard label D — Semantic self-review
- An automated side-by-side semantic review.
- 317 consistent, 0 flagged

**Proof-level metrics record how many translated lean theorem are proved**
- Original Coq proofs	1,804
- Lean proofs counted as truly proved	1,502
- Remaining Lean sorry	302
What does the proofs means here,
Where does the proved theorems come from?
- Come from the theorems at the translated Lean files.
For a row of a file such as `Proofs (ok/total): 3/14`
- `14`: original proof-bearing declarations associated with that Coq source file
- `3`: corresponding Lean declarations with completed proofs
- `11`: corresponding Lean declarations still using `sorry`
Across the complete main Prosa translation:
```
Completed Lean proofs: 1,502
Remaining sorry:          302
                         ────
Original Coq proofs:     1,804
```

**Per-file metrics**
- File	Original Coq source path
- Layer	Dependency/translation layer
- Stmt	Statement-translation status
- Decls (ok/total)	Declaration coverage
- Proof	Overall proof status
- Proofs (ok/total)	Completed proof obligations
- Sorry	Remaining admitted Lean proofs
- Polluted	Proofs depending on unresolved sorry
- A	Declaration inventory result
- B	Structural-signature result
- C	Type-check result
- D	Semantic self-review result
- Duration	Recorded processing time
- Notes	Fully proved, definitions only

#### Meaning of Proof completed
A properly completed proof should satisfy:
1. The Lean theorem has a real proof body.
2. The file compiles.
3. The proof does not directly contain `sorry`.
4. The theorem does not depend on another theorem containing `sorry`.
5. It introduces no unacceptable axioms.
6. Its statement was not changed merely to make the proof easier.
The dashboard calls proofs satisfying these requirements “truly proven.”
A dependency problem would look like:
```
theorem unfinished_helper : P := by
  sorry

theorem apparently_finished : Q := by
  exact result_using unfinished_helper
```
`apparently_finished` contains no direct `sorry`, but it still depends on one. It should be classified as “polluted,” not truly proved.
The dashboard reports `Polluted proofs: 0`, meaning it claims the 1,502 completed proofs do not depend on unresolved `sorry` declarations.

#### Limitations / What is not reported 
Recall the translation process
```
Coq theorem P_coq
      ↓ translation
Lean theorem P_lean
      ↓ Lean proof
P_lean is proved
```
The Lean proof guarantees `P_lean`. It does not by itself prove `P_coq and P_lean have exactly the same meaning`. That is why the dashboard separately has statement checks A–D
The full claim requires two questions: 
1. Was the Coq statement faithfully translated?
2. Was the resulting Lean statement genuinely proved?
The `Completed/total proofs` metric addresses question 2. It does not completely settle question 1.