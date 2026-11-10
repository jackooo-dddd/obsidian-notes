Step 1: Export 除了将 Rocq Declaration 保存为 JSON，还需要完成三个任务：
1. Representation：导出 Declaration 的 Type、Body、Universe、Dependencies 等信息，转换为结构化 AST。
2. Classification：通过 `body_state` 判断 Declaration 的 Body 是否可用，以及后续应该采用哪条翻译路径。
3. Statement Preparation：在 Statement-only Mode 下，保留证明目标，将普通 Definition 中的 Proof Subterms 提取为独立的 Obligations。
### 1. Exported Record：每个 Declaration 保存哪些信息？
- Exporter 利用 MetaRocq 将 Rocq Declaration 转换为 Source IR，再通过 `decl_json` 写入 NDJSON（Newline-Delimited JSON）文件。NDJSON 中每个 Declaration 占一行 JSON Record，包含其完整的结构化信息。
例如，Rocq 中有：
```coq
Theorem plus_n_O :
  forall n : nat, n = n + 0.
Proof.
  ...
Qed.
```
在 Statement-only Mode 下，Exporter 可以生成类似以下的 Record（简化表示）：
```json
{
  "kind": "constant",
  "name": "Corelib.Init.Peano.plus_n_O",
  "type": {"...": "Type AST"},
  "body": null,
  "body_state": "statement_only",
  "universes": {
    "k": "monomorphic"
  },
  "deps": {
    "type": [
      "Corelib.Init.Datatypes.nat",
      "Corelib.Init.Logic.eq",
      "Corelib.Init.Nat.add"
    ],
    "body": []
  },
  "native": {
    "body_kind": "opaque",
    "typing_flags": {"...": "..."}
  }
}
```

各个字段的作用如下：

| Field | 作用 |
|---|---|
| `kind`, `name` | Declaration 的类别和名称 |
| `type` | Declaration 的 Type AST |
| `body` | Declaration 的 Body AST；未导出时为 `null` |
| `body_state` | Body 的分类，用于选择翻译路径 |
| `universes` | Monomorphic / Polymorphic 信息、Universe Parameters 和 Constraints |
| `deps` | Type 和 Body 分别引用的其他 Global Declarations |
| `native` | Rocq 自身的元数据，例如 Typing Flags、Primitive Metadata |

这里需要注意：`body = null` 不一定意味着原始 Rocq Declaration 没有 Body。例如上述 Theorem 原本有 Proof Body，只是 Statement-only Mode 主动去掉了它，仅保留需要证明的 Statement。
#### 1.1 Type AST 和 Body AST 保存的是什么？
Exporter 导出的不是原始 Rocq Source Code，而是经过 Elaboration 的 MetaRocq-style AST。其中变量引用、函数应用、Constant 和 Inductive 都已经有明确的 AST Node。

例如：

```json
{"k": "rel", "i": 0}
```

表示使用 De Bruijn Index `0` 引用最近的局部 Binder。

而：

```json
{"k": "const", "c": "Corelib.Init.Nat.add"}
```

表示引用一个 Global Constant（这里省略了 Universe Instance 等字段）。

因此，后续 `trans` 不需要重新解析 Rocq 源代码，而是直接将这些 AST Nodes 机械转换为 Lean Expressions。
#### 1.2 Exported Record 如何进入 `ConstantDecl`？
Exporter 将 Declaration 序列化为 JSON，而 Lean Translator 读取 JSON 后，将其解析为 `ConstantDecl`：

| JSON Field | `ConstantDecl` Field |
|---|---|
| `name` | `name : String` |
| `type` | `type : Term` |
| `body` | `body : Option Term` |
| `body_state` | `bodyState : String` |
| `universes` | `universes : UDecl` |
| `deps.type` | `typeDeps : Array String` |
| `deps.body` | `bodyDeps : Array String` |
| `native` | `native : Json` |

需要注意，并不是所有 Exported Information 都属于单个 Declaration。例如，文件的 Global Header 还保存 Export Mode 和 Native Universe Facts：
$$
u \leq v,\qquad u < v
$$
这些 Universe Relations 可能影响多个 Declarations，因此会用于建立 `GEnv.facts`，而不是只保存在某个 `ConstantDecl` 中。
因此，`ConstantDecl` 保存当前声明的源信息，而 `GEnv` 保存跨声明共享的信息。
### 2. `body_state`：决定 Declaration 的翻译路径
Exporter 需要知道 Body 是否需要翻译。
例如：
```coq
Definition add1 (n : nat) := n + 1.
```
这是普通 Transparent Definition，具有可以翻译的 Body。
但对于：
```coq
Theorem plus_n_O :
  forall n : nat, n = n + 0.
```
在 Statement-only Mode 下，我们只保留命题，不翻译 Proof Body。
此外，某些 Opaque Constant 虽然存在 Body，也不能直接作为普通 Transparent Definition 处理。因此，Exporter 使用 `body_state` 记录不同的处理情况。
#### 2.1 `body_state` 的主要分类

| `body_state` | 含义 | 后续处理 |
|---|---|---|
| `transparent` | 普通 Transparent Definition | Lean `def` |
| `opaque_present` | Opaque Body 已导出 | 根据声明类型生成 `theorem` / `opaque` |
| `sealed_implementation` | Sealed Module Implementation | 按专门路径生成 `def` |
| `statement_only` | Proof-valued Constant，原 Proof Body 被移除 | 只生成 Statement |
| `obligation` | 从其他 Definition 中提取的 Proof Obligation | 生成 Obligation Statement |
| `opaque_data` | Data-valued Opaque Constant，Body 成功准备 | 生成带 Body 的 `opaque` |
| `opaque_interface` | Data-valued Opaque Constant，没有可用 Body | 只保留 Type Interface |
| `obligation_extraction_failed` | Proof Extraction 未通过 Rocq Kernel 检查 | 拒绝该翻译 |
| `assumption` | 没有 Body 的 Axiom / Parameter | 通常阻塞，除非存在专门映射 |
| `unsupported_primitive` | Primitive Operation 或 Symbol | 使用专门模型，否则拒绝 |
| `unavailable`, `inconsistent` | Body 不可用或导出不一致 | 阻塞或验证失败 |

其中，最重要的是区分 `transparent`、`statement_only`、`obligation`、`opaque_data` 和 `opaque_interface`。
#### 2.2 `body_state` 是如何确定的？
Exporter 会根据 Declaration 的类型、Body 和 Rocq 原生的 Metadata，决定它属于哪一种 `body_state`。
整个过程分为两个阶段。
##### 第一阶段：Statement Preparation（仅在 Statement-only Mode 下）
**Preparation 是 Exporter 在正式导出 JSON 之前进行的一次预处理。**
它的主要目标是：**保留普通 Definition 的计算部分，但不导出 Proof Bodies。**
```
例如：Definition pack (n : nat) :
	    {m : nat | m = n} :=
	  exist _ n eq_refl.
```
这里 `pack` 是一个返回数据的 Definition，但其 Body 中包含证明 `eq_refl`。
如果直接删除 `eq_refl`，整个 Definition 就可能无法通过类型检查。
因此，Preparation 会：
	1. 找到需要提取的 Proof Subterm，例如 `eq_refl`。
	2. 为它创建一个新的 **Obligation Constant**，例如 `pack_obligation : forall n : nat, n = n`。
	3. 用 `pack_obligation n` 替换原来的 `eq_refl`。
	4. 让 Rocq Kernel 检查修改后的 Definition 是否仍然合法。
这样，Exporter 就能保留 `pack` 的计算结构，而将原来的证明变成一个明确的 Obligation，留待后续处理。
**Preparation 完成后，Exporter 才开始为各个 Declaration 确定** `body_state`。
首先检查：
- **是否是 Preparation 新创建的 Obligation Constant？** 如果是，标记为 `obligation`。这一步优先于普通的 Proof-valued 判断。
- **是否是 Proof-valued Constant？** 如果其 Type 属于 `Prop` 或 `SProp`，则丢弃 Proof Body，标记为 `statement_only`。
- **是否是 Opaque Data？** 如果有经过准备且可导出的 Body，标记为 `opaque_data`；否则可能标记为 `opaque_interface`。
- **Proof Extraction 是否失败？** 如果 Rocq Kernel 无法接受提取证明后的 Definition，记录为 `obligation_extraction_failed`。
这里的关键区别是：
- `statement_only`：原本就是一个 Proof-valued Declaration，只保留其 Statement。
- `obligation`：Preparation 为其他 Definition 中的 Proof Subterm **新创建的 Constant**。
##### 第二阶段：根据 Rocq 原生的 Body Kind 分类
如果 Declaration 没有在第一阶段被特殊处理，就根据 Rocq 原本的 Body Kind 分类：
```
Transparent + Body → transparent
Opaque + Body      → opaque_present
Sealed + Body      → sealed_implementation
Assumption         → assumption
Primitive          → unsupported_primitive
No usable Body     → unavailable
```
需要注意，是否属于 Proof-valued Constant，并不取决于使用Theorem 还是 Definition 关键字，而是由 Rocq Kernel 根据 Type 判断。
例如：
```
Definition my_proof : 1 = 1 := eq_refl.
```
虽然使用的是 `Definition`，但它的 Type `1 = 1` 属于 `Prop`，因此仍然是 Proof-valued Constant。
对于：
```
forall n : nat, n = n
```
Exporter 也能识别：它会沿着 `forall` 的 Binder 检查最终返回的命题，必要时进行 Weak-head Reduction。如果最终属于 `Prop` 或 `SProp`，它就是 Proof-valued。
因此，在 Statement-only Mode 下，`my_proof` 会被标记为 `statement_only`，而不是普通的 `transparent`。
**总结：Preparation 发生在 JSON Export 之前，负责提前处理证明；**`body_state` **的分类发生在 Preparation 之后，负责告诉 Translator 应该如何处理每个 Declaration。**
### 3. Statement-only Preparation：为什么需要处理 Proof？
当前项目的 Statement-only Mode 希望保留 Rocq 中的定理陈述，但暂时不翻译原始 Proof Bodies。
这里需要区分两种情况：整个 Declaration 本身是 Proof，或者普通 Definition 的 Body 内部包含 Proof Subterms。
#### 3.1 情况 A：整个 Declaration 是 Proof-valued

例如：

```coq
Theorem plus_n_O :
  forall n : nat, n = n + 0.
Proof.
  ...
Qed.
```

因为整个 Declaration 都是 Proof-valued，Exporter 可以直接移除 Proof Body，只保留 Type AST：

```text
Type       = forall n : nat, n = n + 0
Body       = null
body_state = statement_only
```

之后 Translator 可以生成 Lean 中的 Statement：

```lean
def Rocq.Corelib.Init.Peano.plus_n_O.statement : Prop :=
  ∀ n : Rocq.nat, n = Rocq.Nat.add n Rocq.nat.O
```

注意，这里的 `def ... : Prop := ...` 只是定义一个命题，不是证明它。

因此，即使该 Statement 通过 Lean Kernel 检查，也只表示命题本身是 Well-typed，并不意味着 Rocq 原来的 Theorem 已经在 Lean 中得到证明。

#### 3.2 情况 B：普通 Definition 的 Body 中包含 Proof

考虑：

```coq
Definition pack (n : nat) :
    {m : nat | m = n} :=
  exist _ n eq_refl.
```

`pack` 返回的是一个 `sig` 数据类型，而不是一个 Proposition。但它的 Body 包含两个部分：

```text
Body
 ├── Data  : n
 └── Proof : eq_refl（证明 n = n）
```

如果直接删除 `eq_refl`，那么剩下的 Body 就不完整，无法满足 `sig` 构造器要求的类型。

因此，Statement-only Mode 不能简单地删除所有 Proof Terms，而必须将它们转换成显式的 Proof Obligations。

#### 3.3 Proof Extraction：将 Proof Subterm 替换为 Obligation

Exporter 首先识别需要提取的 Proof Subterm：

```coq
eq_refl
```

然后根据它所在的 Local Context，生成新的 Obligation Constant：

```coq
Parameter pack__rocq2lean_obligation_1 :
  forall n : nat, n = n.
```

这里的 `Parameter` 只是表示准备阶段中暂时提供的证明接口，并不表示最终 Lean 翻译会把它当成已经证明的 Axiom。

接着，将原来 Body 中的 Proof Subterm 替换为 Obligation Reference：

```coq
Definition pack (n : nat) :
    {m : nat | m = n} :=
  exist _ n (pack__rocq2lean_obligation_1 n).
```

这样，原始 Definition 的数据构造逻辑仍然保留，而原本需要 Proof 的位置由显式 Obligation 填充。

整个过程可以表示为：

```text
Original Body
    exist _ n eq_refl
          │
          ▼
Proof Extraction
    提取最大 Proof Subterm
          │
          ├── Obligation Statement
          │   ∀ n : nat, n = n
          │
          ▼
Rewritten Body
    exist _ n (obligation n)
          │
          ▼
Rocq Kernel Re-check
          │
          ▼
Prepared Body → Source IR
```

更一般地，假设在某个 Local Context $\Gamma$ 中存在 Proof Term：

$$
\Gamma \vdash t : T
$$

Exporter 可以将证明 $t$ 替换为 Obligation Reference：

$$
o\ \Gamma
$$

其中新生成的 Obligation 满足：

$$
o : \forall \Gamma,\ T
$$

这里 $\Gamma$ 表示 Proof 所依赖的局部变量及其类型。例如，`eq_refl` 依赖当前的 `n : nat`，因此对应 Obligation 也需要接受参数 `n`。

需要注意，Exporter 不是提取每一个看起来像 Proof 的节点，而是主要提取符合条件的最大 Proof Subterm。已经存在的 Proof-valued Constant References 和 Local Variables 可以保留。

#### 3.4 为什么需要 Rocq Kernel Re-check？

因为 Proof Extraction 改变了原始 Declaration 的 AST，而这种修改不一定始终保持 Type Correctness。

尤其是在 Dependent Types 中，某些计算或类型检查可能依赖原始 Proof 的具体结构。

因此，Exporter 必须重新检查：
1. Rewritten Type 是否合法。
2. 新生成的 Obligation Statements 是否合法。
3. Rewritten Body 是否具有预期 Type。

如果 Rocq Kernel 接受修改后的 Declaration，说明它在引入这些 Obligations 的环境下仍然 Well-typed，可以继续导出。

如果检查失败，就记录：

```text
body_state = obligation_extraction_failed
```

而不是将未经验证的 Prepared Body 交给 Lean Translator。

#### 3.5 特殊情况：Recursion 的 Termination 被影响

某些 Recursive Definitions 的 Guardedness 可能依赖于原来的 Proof Subterms。

当这些 Proof 被替换成 Obligations 后，原来的 Termination Checking 可能不再直接成立。

在适用的情况下，Exporter 会记录：

```text
termination = deferred
```

这表示原始 Definition 的终止性需要后续处理，而不能直接假设仍然成立。

Lean Translator 需要尝试使用其他 Recursion Lowering，或者把缺少的 Termination Argument 转换为显式的 Termination Obligation。若没有支持的处理路径，则必须拒绝该翻译。

### 4. Export 与三个核心 Data Structures 的关系
将整个 Export 阶段放到 Rocq → Lean Translation Pipeline 中，可以得到具体的流程图：
```text
Rocq Kernel Environment
          │
          ▼
Statement Preparation（Statement Mode）
  ├── Identify Proof-valued Constants
  ├── Extract Proof Subterms
  ├── Generate Obligations
  └── Rocq Kernel Re-check
          │
          ▼
MetaRocq Exporter / decl_json
  ├── Type AST / Body AST
  ├── Universe Information
  ├── Dependencies
  └── body_state / Native Metadata
          │
          ▼
NDJSON Records + Global Header
          │
          ▼
ConstantDecl + GEnv.facts
          │
          ▼
Translation Pipeline
  ├── trans（Rocq AST → Lean Expr）
  ├── Universe Solving
  ├── Universe / Interface Checking
  └── Lean Declaration Emission
          │
          ▼
Lean Kernel Checking
          │
          ▼
DeclResult + Updated GEnv
```

三种 Data Structures 分别承担不同职责：

| Data Structure | 所在阶段 | 主要作用 |
|---|---|---|
| `ConstantDecl` | Export 之后 | 保存当前 Declaration 的 Type / Body AST、Universe、Dependencies 和 Body State |
| `GEnv` | 整个 Translation Pipeline | 保存全局 Universe Facts、已翻译的 Declarations、引用接口和 Pending Dependencies |
| `DeclResult` | Translation 之后 | 记录目标 Lean Declaration、使用规则、Universe 求解、Kernel 检查和 Pending Obligations 等信息 |

`ConstantDecl` 是输入，`GEnv` 是翻译时使用的全局上下文，`DeclResult` 则是每次 Declaration Translation 产生的结果报告。

## 总结：Step 1 Export 实际完成了什么？

| 职责 | 完成的工作 |
|---|---|
| Representation | 将 Rocq Declaration 转换为包含 AST、Universe、Dependencies 的 Source IR |
| Classification | 使用 `body_state` 区分 Transparent、Opaque、Proof-valued、Assumption、Primitive 等不同情况 |
| Proof Preparation | 在 Statement Mode 下移除原始 Proof Bodies，提取必要的 Obligations，并由 Rocq Kernel 重新检查 |

最重要的是区分 Export 阶段和 Translation 阶段：
- Export：确定源 Declaration 包含什么信息、哪些 Body 可以使用，以及如何安全地保留 Proof Requirements。
- Translation：使用 `trans`、Universe Solving、相关 Translation Rules 和 Kernel Checking，真正构造 Lean Declarations。

因此，当某个 Declaration 最终无法翻译时，需要先判断失败发生在哪个阶段：
1. Export / Preparation Failure：源 Body 无法导出，或 Prepared Declaration 无法通过 Rocq Kernel 检查。
2. Translation Failure：Source IR 已经准备好，但 Rocq AST → Lean Expr、Universe Interpretation 或 Lean Declaration Checking 未能成功。
这两类失败的原因不同，也需要采用不同的解决方式。

## `decl_json`、NDJSON 和 `ConstantDecl` 的区别
在 Rocq → Lean Translation Pipeline 中，实际上只有一个 NDJSON 文件。`decl_json` 是负责生成 JSON 的程序，而 `ConstantDecl` 是 Lean 中用于保存解析结果的数据结构。

| 名称               | 是什么                           | 作用                                 |
| ---------------- | ----------------------------- | ---------------------------------- |
| `decl_json`      | Rocq Exporter 中的序列化函数         | 将 Rocq Declaration 转换为 JSON Record |
| `NDJSON Records` | 实际导出的文件内容                     | 每行保存一条 JSON Record                 |
| `ConstantDecl`   | Lean `IR.lean` 中的 `structure` | 将 JSON 解析为 Lean 可以直接使用的数据结构        |

### 1. 实际的数据流
```text
Rocq Declarations
        │
        ▼
decl_json（Exporter）
        │
        │ 序列化为 JSON
        ▼
一个 NDJSON 文件
┌──────────────────────────┐
│ Header                   │
│   Mode                   │
│   Global Universe Facts  │
├──────────────────────────┤
│ Record 1: Constant A     │
│ Record 2: Constant B     │
│ Record 3: Inductive C    │
│ ...                      │
└──────────────────────────┘
        │
        │ Lean Translator 读取、解析
        ▼
Lean 内存中的数据结构
┌──────────────────────────┐
│ Global Header            │──→ GEnv.facts
│ Constant Record A        │──→ ConstantDecl A
│ Constant Record B        │──→ ConstantDecl B
│ Inductive Record C       │──→ InductiveDecl C
└──────────────────────────┘
```
这里的 Header 和 Declaration Records 都保存在同一个 NDJSON 文件中，不需要额外生成其他 JSON 文件。
### 2. 从 JSON Record 到 `ConstantDecl`
例如，NDJSON 文件中有一条简化的 Constant Record：
```json
{
  "kind": "constant",
  "name": "my_id",
  "type": {},
  "body": {},
  "body_state": "transparent"
}
```
Lean Translator 读取并解析后，会生成类似的结构体实例：
```lean
ConstantDecl {
  name := "my_id"
  type := ...
  body := some ...
  bodyState := "transparent"
  ...
}
```
此时 `ConstantDecl` 已经不是 JSON，而是 Lean 内存中的一个结构体实例（In-memory Object）。Translator 可以直接读取：
```lean
decl.name
decl.type
decl.body
decl.bodyState
```

这些字段分别提供 Declaration 的名称、Type AST、Body AST 和 Body State。
### 3. `GEnv.facts` 从哪里来？
除了每个 Declaration 自己的 Record，NDJSON 文件还包含 Global Universe Facts，例如：
$$
u \leq v,\qquad u < w
$$
这些关系可能被多个 Declarations 使用，因此不会仅保存在某一个 `ConstantDecl` 中，而是从同一个 NDJSON 文件的 Global Universe Information 中读取，并用于初始化翻译器的 `GEnv.facts`。
因此：
- `ConstantDecl`：保存单个 Constant 的 Type、Body、Universe 和 Dependencies。
- `InductiveDecl`：保存单个 Inductive Block 的源信息。
- `GEnv.facts`：保存跨 Declaration 共享的 Global Universe Relations。

### 4. 总结
整个过程可以概括为：
```text
Rocq Declaration
      ↓
decl_json（序列化）
      ↓
NDJSON 文件（磁盘上的 JSON Records）
      ↓
Lean IR Parser（读取与解析）
      ↓
ConstantDecl / InductiveDecl（内存中的数据结构）
      ↓
Translator（机械翻译）
```
最重要的区别是：`decl_json` 负责写入数据，NDJSON 负责保存数据，而 `ConstantDecl` 负责在 Lean 内存中表示数据。它们不是三个不同的文件，而是同一条数据处理流程中的不同环节。
