在 Rocq → Lean 的机械翻译项目中，三个重要的 Data Structures 分别是：

| Data Structure | 角色 | 主要作用 |
|---|---|---|
| `ConstantDecl` | Source Input | 保存一个 Rocq Constant Declaration 的源信息 |
| `DeclResult` | Translation Report | 记录当前 Declaration 的翻译结果和检查状态 |
| `GEnv` | Global Translation State | 保存此前翻译的信息，供后续 Declaration 使用 |

### 1. 整体关系
```text
ConstantDecl（Source IR）
    │
    │ Type / Body AST、Universe、Dependencies
    ▼
Translation Pipeline ◄────────── GEnv
    │                      已有声明、Universe Facts、
    │                      引用映射、Pending Prerequisites
    │
    ├── trans（AST → Lean Expr）
    ├── Universe Solving
    ├── Universe / Interface Checking
    └── Emission + Lean Kernel Checking
    │
    ├── DeclResult
    │   翻译状态、规则、目标名称、检查信息
    │
    └── Updated GEnv
        注册新声明，供后续 Declaration 使用
```
翻译成功时，还会生成真正的 Lean Declaration，并提交给 Lean Kernel 检查。`DeclResult` 负责记录结果，而 `GEnv` 负责将已接受声明的相关信息传递给后续翻译。
### 2. `ConstantDecl`：保存 Rocq Declaration
定义在 `IR.lean` 中：
```lean
structure ConstantDecl where
  name       : String
  type       : Term
  body       : Option Term
  universes  : UDecl
  typeDeps   : Array String
  bodyDeps   : Array String
  bodyState  : String
  native     : Json
```
可以把它理解为一个保存源 Declaration 信息的对象，类似 Python 的 `dataclass`。
例如，Rocq 中：
```coq
Definition id (A : Type) (x : A) : A := x.
```
Exporter 会把它转换成结构化信息：

| Field | 保存的内容 |
|---|---|
| `name` | 原始 Declaration 名称，例如 `id` |
| `type : Term` | Type AST，例如 `forall (A : Type), A -> A` |
| `body : Option Term` | Body AST，例如 `fun A x => x` |
| `universes : UDecl` | Monomorphic / Polymorphic、Universe Levels 和 Constraints |
| `typeDeps` | Type 引用的其他 Global Declarations |
| `bodyDeps` | Body 引用的其他 Global Declarations |
| `bodyState` | Body 的导出和可用状态 |
| `native : Json` | Typing Flags、Primitive 等额外元信息 |

这里需要注意：
- `Term` 表示 Rocq 的 AST 节点，而不是 Lean Expression。
- `UDecl` 保存源 Declaration 的 Universe 信息。
- `Option Term` 表示 Body 可以存在（`some`），也可以不存在（`none`）。
- `Array String` 表示一组 Dependency Names。
因此，`ConstantDecl` 本身不执行翻译，而是组织翻译一个 Constant 所需的源信息。
### 3. `DeclResult`：记录 Declaration 的翻译结果
定义在 `Emit.lean` 中。与 `ConstantDecl` 不同，`DeclResult` 保存的是翻译器处理 Declaration 后的结果，而不是原始 Rocq AST。

| 字段 | 作用 |
|---|---|
| `source`, `kind`, `status`, `rule`, `message` | 源名称、Declaration 类别、翻译状态、使用的规则和诊断信息 |
| `target`, `targetType`, `targetValue` | 目标 Lean 名称、Type Expression 和 Body Expression |
| `levelParams`, `bodyLevels`, `implicitLevels`, `levelCopies`, `levelInterp` | Universe Parameters、求解结果及源目标 Level Mapping |
| `pendingHyps`, `universeChecks`, `propLift`, `typeLift`, `deltaInlined` | 待证明前提、Universe 检查及特殊转换记录 |

例如，翻译：
```coq
Definition id (A : Type) (x : A) : A := x.
```
假设翻译成功，`DeclResult` 可能包含类似信息：
```text
source       = "id"
status       = "accepted"
target       = Rocq.id

levelParams  = [u]
targetType   = (A : Type u) → A → A

pendingHyps  = []
```
这里有两个重要区别：
1. `DeclResult` 不等于 Lean Declaration。Lean Declaration 是真正注册到 Lean Environment 的定义或定理，而 `DeclResult` 是记录其生成过程和检查结果的 Report。
2. `DeclResult` 不只是记录成功或失败。即使通过 Lean Kernel，也可能使用了 `typeLift`、`deltaInlined`，或引入 `pendingHyps`。这些信息需要保留，才能在后续 Audit 中区分无条件翻译与条件翻译。
### 4. `GEnv`：保存整个翻译过程的 Global State
`GEnv` 是 Global Translation Environment，在 Main Loop 中随着每个 Declaration 的翻译持续更新。
与前两个结构不同，`GEnv` 不只属于某一个 Declaration，而是保存整个翻译过程中累积的信息。

| 字段 | 作用 |
|---|---|
| `facts` | Rocq Universe Graph 导出的 Universe Facts |
| `consts`, `constGlobals`, `constPoly` | 已翻译 Constant 的名称映射、Universe Interface 和 Polymorphic 信息 |
| `copyPositions` | 追踪 Universe Level Copies 的位置 |
| `admitting` | 与特殊接纳层级及声明引用有关的信息 |
| `leafStmt`, `pendingDefs` | 尚有 Pending Prerequisites 的 Statement / Definition |
| `irBodies` | 已导出的 Body IR，供后续翻译使用 |
| `erasingPoly`, `computingTypes`, `phantomDefs`, `stmtMode`, `protectedNames` | 控制特殊翻译模式、类型计算和名称管理 |

#### 为什么需要 `GEnv`？
因为不同 Declaration 之间存在依赖关系。例如：
```coq
Polymorphic Definition id
    (A : Type) (x : A) := x.

Definition use_id
    (A : Type) (x : A) := id A x.
```
当翻译 `use_id` 时，翻译器遇到了对 `id` 的引用。此时必须知道 `id` 是否已经被接受、对应的 Lean Name、它的 Universe Interface，以及如何实例化这次引用的 Universe Parameters。
这些信息并不全部包含在 `use_id` 自己的 `ConstantDecl` 中，因此需要从 `GEnv` 中查询。

例如，翻译器可能生成临时引用：
```lean
Rocq.id.{?u} A x
```
其中 `?u` 是本次引用的 Universe Metavariable。翻译器利用 `GEnv` 中保存的 `id` 接口构造引用，再通过当前 Type Checking 和 Unification 求解 `?u`。
当 `use_id` 翻译成功后，它的目标名称及相关接口信息也会注册到 `GEnv`，供后面的 Declaration 使用。

### 5. 三者的核心区别

| | `ConstantDecl` | `DeclResult` | `GEnv` |
|---|---|---|---|
| 角色 | Source Input | Translation Report | Global State |
| 保存内容 | Rocq 原始声明信息 | 当前声明的翻译与检查结果 | 整个翻译过程积累的信息 |
| 作用范围 | 一个 Constant | 一次 Declaration 翻译 | 整个 Translation Pipeline |
| 主要用途 | 提供 AST、Universe、Dependencies | 记录结果、规则和 Audit 信息 | 解析引用、处理跨声明依赖 |
| 生命周期 | 作为输入供翻译读取 | 当前声明处理后生成 | 在 Main Loop 中持续传递和更新 |

还需要区分 `GEnv` 和 Lean Kernel 的 `Environment`：
- `GEnv`：翻译器自己管理的 Global State，保存源目标引用映射、Universe 信息和翻译状态。
- Lean `Environment`：Lean 保存实际 Declarations 的环境，由 Kernel 检查这些声明是否合法。
总结来说，`ConstantDecl` 提供源声明，`GEnv` 提供翻译所需的全局上下文，`DeclResult` 则记录本次翻译的结果。这三个结构共同支持逐个 Declaration 的机械翻译流程。