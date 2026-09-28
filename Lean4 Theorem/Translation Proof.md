```
                    Translated Lean-Prosa
                            │
                            │ lean4export
                            ▼
                    rocq-lean-import
                            │
                            ▼
Original Prosa ─────── Imported Lean-Prosa
      │                       │
      └──────────┬────────────┘
                 ▼
        correspondence proofs
                 │
                 ▼
             Rocq kernel
                 │
                 ▼
              VERIFIED
```
1. Imported Lean-Prosa
   Lean → export → imported Rocq representation

2. Mapping database
   original declaration ↔ translated declaration
   + dependencies + status

3. Semantic certificates
   original Rocq declaration
           ↔
   actual imported Lean declaration