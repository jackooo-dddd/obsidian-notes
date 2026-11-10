IR 是 Intermediate Representation（中间表示） 的缩写。
在编译器或 Translator 中，IR 是一种内部数据表示方式，用来保存源程序的信息，让后续的翻译和分析更容易进行。
### 1. 在我们项目中，IR 是什么意思？
对于 Rocq → Lean Translator，IR 指的是用 Lean 定义的数据结构来表示 Rocq 的声明和 AST。例如，Rocq 中：
```
Definition id (A : Type) (x : A) : A := x.
```
经过 Step 1 Export 和 Step 2 Parse：
```
Rocq Declaration
       ↓
MetaRocq Quotation
       ↓
NDJSON Record
       ↓
Parser (IR.lean)
       ↓
IR.ConstantDecl
  ├── name       : String
  ├── type       : IR.Term
  ├── body       : Option IR.Term
  ├── universes  : UDecl
  ├── typeDeps   : Array String
  └── bodyDeps   : Array String
       ↓
Step 5: trans
       ↓
Lean Expr
```
这里：
- `ConstantDecl` 是 Declaration-level IR，保存整个 Constant 的信息。
- `IR.Term` 是 Term-level IR，保存 Type 和 Body 的 AST。
- `Lean Expr` 是真正翻译完成后，Lean 使用的表达式。
### 2. 为什么叫 Intermediate Representation？

因为它位于源语言和目标语言之间：

|阶段|数据形式|含义|
|---|---|---|
|Step 1|NDJSON|序列化后的 Rocq AST 和 Metadata|
|Step 2|`IR.ConstantDecl` / `IR.Term`|Lean 内存中的 Rocq AST 表示|
|Step 5|`Lean Expr`|翻译得到的 Lean 表达式|

需要强调的是，`IR.Term` 虽然是在 Lean 中定义的，但表示的仍然是 Rocq AST，而不是 Lean AST。