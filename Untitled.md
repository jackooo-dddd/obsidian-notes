**novelty**
- When is decomposition actually worth its token costs.
- Create LeanRTS Benchmark, 比较 Math vs RTS 上 decomposition/skills 的不同效果, Cross-Domain Transfer of Agentic Proving Skills for Lean 4 Theorem Proving
```
Lean4 Target Theorem
        │
        ▼
① Complexity Assessment
        │
        ├── Simple ──────────────► Direct Proof
        │
        └── Complex
              │
              ▼
② Lemma / Subgoal Decomposition
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
     G1      G2       G3
      │       │        │
      ▼       ▼        ▼
③ Lemma Retrieval / Premise Search
      │
      ▼
Goal-directed lemma application
apply / refine / exact?
      │
      ▼
new prerequisites / subgoals
      │
      ▼
④ Proving Skills
      │
      ▼
Lean feedback → repair → retry
      │
      ▼
All subgoals solved
      │
      ▼
Final Lean4 proof verification
```