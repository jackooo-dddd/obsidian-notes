最理想的 accept 结果就是
```
Declaration:
  original add ↔ imported add
[[Translation Example]]
Type bridge:
  nat ↔ Nat
  ✓

Semantic theorem:
  ∀ a b, bridge (original_add a b) =
    imported_add (bridge a) (bridge b)
  ✓  # Bridge 就是 Rocq 的 nat 和“Lean 导回 Rocq 后的 Nat之间的对应关系

semantic premises:
  []

source theorem dependency:
  false

target theorem dependency:
  false

unexpected assumptions:
  []

certificate compile:
  PASS
```

那么就可以接受为`CERTIFIED`