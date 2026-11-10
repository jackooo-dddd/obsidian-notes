Parser 的主要工作就是把 Step 1 得到的 NDJSON Records 解析为 Lean 中的 IR 数据结构，例如 `ConstantDecl`。
- `IR.lean`：Lean 源代码文件，定义了 `ConstantDecl`、`Term`、`UDecl` 等数据结构，以及 JSON Parser。
- `ConstantDecl`：定义在 `IR.lean` 中的 `structure`，用于保存解析后的一个 Rocq Constant。
### 具体流程
```
NDJSON File
    │
    │ 读取每条 JSON Record
    ▼
Parser (IR.lean)
    │
    ├── type JSON  → IR.Term
    ├── body JSON  → Option IR.Term
    ├── universes  → UDecl
    └── 其他字段    → String / Array / Json
    │
    ▼
ConstantDecl Instance
    │
    ▼
translateSource (Emit.lean)
    │
    ▼
后续 Translation Pipeline
```
例如，NDJSON 中：
```
{
  "kind": "constant",
  "name": "my_id",
  "type": {"k": "sort", "...": "..."},
  "body_state": "transparent"
}
```

经过 Parser 后，会成为类似这样的 Lean 数据：
```
ConstantDecl {
  name := "my_id"
  type := Term.sort ...
  bodyState := "transparent"
  ...
}
```

另外，NDJSON 中的 Global Header 也会被解析，其中的 Global Universe Facts 会用于构建 `GEnv.facts`。
关键是：这个 Parser 还没有将 Rocq AST 翻译成 Lean Expression。
- Step 2：JSON → `IR.Term` / `ConstantDecl`
- Step 5 `trans`：`IR.Term` → Lean `Expr`