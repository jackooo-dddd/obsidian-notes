## Step 1 Export
**目标：** 为后续 Lean Translator 准备完整、结构化的输入数据。
### Exporter 做了什么
Exporter 是一个运行在 Rocq 内部的 OCaml 插件，工作分三步：
1. 导出 AST：调用 MetaRocq 的 Quoter，把 Rocq 中的 Declarations 导出为结构化的 AST。
   - 每个 Declaration 包含声明类型（Type）、Body、变量，以及对其他 Constants 和 Inductives 的引用。
   - MetaRocq 同时提供 Declaration 自身的 Universe Information：Monomorphic 还是 Polymorphic、Universe Parameters、相关 Constraints。
2. 补充信息：
   - 计算每个 Declaration 的 Dependencies。
   - 从 Rocq 原始的 Kernel Environment 读取 Native Metadata：Body Kind、Typing Flags、Template Information、Primitive Information。
   - 确定每个 Declaration 的 `body_state`，用于指导后续翻译（见下文）。
3. 序列化为 NDJSON：每个 Declaration 对应一行 JSON Record。

除了 Declaration Records，NDJSON 文件还包含：
- Header、Roots、Libraries
- `universes`：本次导出涉及的 Universe Levels 和原始 Constraints。
- `universe_facts`：Rocq 原生 Universe Graph 能推导出的 Levels 之间的 `≤` 和 `<` 关系，是后续 Universe Translation 和 Checking 的重要依据。
### `body_state`：决定翻译路径
不同类型的 Declarations 需要不同的翻译方式。普通 Definition 的 Body 可以直接翻译，而 Theorem 的 Proof Body、Opaque Constant 则需要特殊处理。

`body_state` 的作用是：在正式进行 Rocq AST → Lean Expression 的机械翻译之前，告诉 Translator：
- 当前 Declaration 应该走哪条处理路径；
- 哪些内容可以翻译，哪些需要保留为证明义务，哪些暂时无法处理。

Lean Translator 根据 `body_state` 把 Declarations 分到不同的翻译路径：

| `body_state` | 翻译为 |
|---|---|
| `transparent`、`sealed_implementation` | 普通 Lean `def` |
| `statement_only`、`obligation` | 只保留对应的 Proposition，生成 Lean Statement，不翻译原始 Proof Body |
| `opaque_present` | 根据声明类型（Type）是否属于 `Prop`，翻译为 Lean `theorem` 或 `opaque` |
| `opaque_data` | 翻译可用的 Body，并在 Lean 中保持 Opaque |
| `opaque_interface` | 没有可用的 Body，只翻译并检查声明类型（Type），生成 Type Interface；实际构造对应的值仍是未完成的任务 |

### Statement-only：怎么处理 Proof
Proof/Obligation Extraction 的目的：避免直接翻译 Rocq 中的 Proof Bodies，同时保留普通 Definition 的计算逻辑和类型正确性。 分两种情况：
- **情况 A：整个 Declaration 是 Proof-valued**（例如 Theorem）
  Exporter 直接移除 Proof Body，只保留 Statement。
- **情况 B：普通 Definition 的 Body 中包含 Proof**
  这些 Proof Subterms 不能直接删除，否则 Definition 可能无法通过类型检查。Exporter 会：
  1. 把 Proof Subterms 提取为独立的 Obligation Constants，也就是后续需要证明的命题；
  2. 用对应的 Obligation References 替换原来的 Proof；
  3. 用 Rocq Kernel 重新检查修改后的 Definition，确保引入 Obligations 后仍然合法。

这样，Lean Translator 可以继续翻译 Definition，并把尚未完成的证明作为显式的 Proof Obligations 保留下来，而不是假设它们已经被证明。
#### 例子：`pack`
```coq
Definition pack (n : nat) :
    {m : nat | m = n} :=
  exist _ n eq_refl.
```
`pack` 返回的是一个 `sig` 数据类型，而不是 Proposition。但它的 Body 包含两部分：
```text
Body
 ├── Data  : n
 └── Proof : eq_refl（证明 n = n）
```
如果直接删除 `eq_refl`，剩下的 Body 就不完整，无法满足 `sig` 构造器要求的类型。所以 Statement-only Mode 不能简单地删除所有 Proof Terms，必须把它们转换成显式的 Proof Obligations：

**① 识别**需要提取的 Proof Subterm：
```coq
eq_refl
```
**② 生成** Obligation Constant（根据它所在的 Local Context）：
```coq
Parameter pack__rocq2lean_obligation_1 :
  forall n : nat, n = n.
```
**③ 替换**原 Body 中的 Proof Subterm：
```coq
Definition pack (n : nat) :
    {m : nat | m = n} :=
  exist _ n (pack__rocq2lean_obligation_1 n).
```
结果：原始 Definition 的数据构造逻辑仍然保留，原本需要 Proof 的位置由显式 Obligation 填充。

---
## Step 2 Parse and Classify
**目标：** 把 NDJSON 转换成 Lean Translator 可以操作的内部数据结构。

Translator 读取 Step 1 生成的 NDJSON 文件，通过 `IR.lean` 中的 Parser，把 JSON Records 解析成 Lean 内部的数据结构。（参见 [[IR 是什么意思]]）
### `IR.lean`：数据结构与 Parser
`Rocq2Lean/IR.lean` 负责两件事：
1. 定义 Translator 内部表示 Rocq Declaration 的 IR 数据结构；
2. 提供 Parser，把 Step 1 导出的 `source.ndjson` 解析为这些结构。

Parser 逐行读取 NDJSON，根据每条 Record 的 `kind` 字段解析：
- Global Information：Header、Universes、Universe Facts 等。
- Declarations：Constant 解析为 `ConstantDecl`，Inductive 解析为对应的 Inductive 声明结构。下面先讲 Constant。

**这些数据存在哪里？**
- 内存中：Translator 启动时，`parseSource`（也在 `IR.lean` 里）读入整个 `source.ndjson`，把每一行解析成 `ConstantDecl` 或 `InductiveDecl`，放进内存中的 `Source` 结构。翻译结束、进程退出后，这些值就没了。
- 磁盘上：翻译的结果会写到磁盘，但存的是 `DeclResult`，不是 `ConstantDecl`。
  - `DeclResult` 写进 `translation_report.json`；
  - 生成的 Lean 声明写进 `lean/` 下的 `.lean` 文件。
### `ConstantDecl`：Translator 中的 Constant
每个 Constant 都表示为一个 `ConstantDecl`，字段分两类：
- Control / Metadata：`name`、`bodyState`、`universes`、`typeDeps`、`bodyDeps`、`native`。
  不会被翻译成 Lean 代码，用来决定翻译路径、建立 Universe 映射、做合法性检查。
- AST：`type` 和 `body`，都用 `IR.Term` 表示。
  这是真正被递归翻译成 Lean `Expr` 的内容。

各字段在后续步骤中的用途：

| 字段                      | 内容                                         | 使用阶段及作用                                                                                        |
| ----------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `name`                  | 源声明的全名，如 `Corelib.Init.Nat.add`            | 生成 Lean 目标名称 `Rocq.<name>`，Statement 加 `.statement` 后缀；Step 8 用它登记结果                           |
| `bodyState`             | Body 状态，如 `transparent`、`statement_only`   | Step 2 分流；Step 3 检查 Body 是否可用；Step 8 决定生成 `def`、`theorem` 或 `opaque`                           |
| `type : IR.Term`        | Declaration 的声明类型（Type）AST                 | Step 4 扫描其中的 Universe Levels；Step 5 翻译为 Lean 类型表达式（Type）                                       |
| `body : Option IR.Term` | Declaration 的 Body AST（Statement 为空）       | Step 5 翻译为 Lean 值表达式（Value）；透明 Body 还会存入 `irBodies`，供 δ-inlining 使用                            |
| `universes : UDecl`     | Monomorphic / Polymorphic Universe Context | Step 4 建立 Universe 映射：Polymorphic 变量变成 R6 参数 `v_i`，Monomorphic 全局 Level 变成 Level Metavariables |
| `typeDeps` / `bodyDeps` | 声明类型 / Body 引用的其他 Declarations             | Step 3 检查每个依赖是 Accepted、Failed 还是 Pending                                                      |
| `native`                | Typing Flags、Quality、Primitive 等信息         | Step 2 处理 Quality Family 和 Primitive；Step 3 拒绝 Typing Flags 被放宽的声明                             |

### `IR.Term`：Rocq AST 及其 Lean 翻译
`IR.Term` 是一个 Inductive Data Type，每个 Constructor 对应 Rocq（MetaRocq）AST 中的一种节点。

在 Step 5 中：
- `runTrans` 分别对声明类型（Type）和 Body 调用 `transClosed`。对 Statement 来说，翻译的是 Step 2 改写后的版本。
- `transClosed` 内部用 `trans` 递归遍历 AST，按节点种类应用相应的机械翻译规则：

| Constructor | 含义 | Step 5 中翻译为 |
|---|---|---|
| `rel i` | 被绑定的局部变量，用 de Bruijn Index 表示（`0` = 最内层 Binder），编号方式与 Lean `Expr.bvar` 相同 | 翻译时指向外层第 i 个局部变量，收尾时抽象回 Lean `bvar` |
| `sort` | Universe / Sort，如 `Prop`、`SProp`、`Type@{l}` | Lean `Sort`。Level 按 Step 4 的映射翻译，`Type@{l}` 通常对应 `Sort (u_l + 1)` |
| `prod` | Dependent Function Type（`forall`） | `forallE` |
| `lam` | Lambda Expression | `lam` |
| `letIn` | Let Expression | `letE` |
| `app f args` | Function Application | Lean Application。需要时插入 coercion，并立即求解函数头上的 Level |
| `const c u` | 引用其他 Constant，携带 Universe Instance | 已接受的常量：Lean 常量引用，附带 Universe 实参。只有 Statement 的前提：对应的 Hypothesis。Pending 定义：其 `RocqPending` artifact |
| `ind` / `construct` | 引用 Inductive Type / Constructor | 已翻译的 Lean Inductive / Constructor，附带 Universe 实参 |
| `case` | Pattern Matching（`match`） | Lean Recursor 应用 `I.rec` |
| `fix` | Recursion | 递归降级：structural、course-of-values，或 `Acc.rec` 加终止性 Obligation |
| `cofix` | Corecursion | 目前不支持（`UNSUPPORTED_FEATURE`） |
| `proj` | Projection | `Expr.proj`，只用于已翻译的 primitive record |
| `cast` | Type Cast | 先检查标注在 Lean 中可转换，然后擦除 |
| `prim` | Primitive 值和运算（int63、float、array、string） | Lean 中对应的 Primitive Model |

### 完整的数据流
```text
Step 1. Export
  Rocq Declaration
         ↓
  NDJSON Records
         ↓
Step 2. Parse and Classify
  ConstantDecl
    ├── name / bodyState / native
    ├── type : IR.Term
    ├── body : Option IR.Term
    ├── universes : UDecl
    └── typeDeps / bodyDeps
         ↓
Step 3. Gates
  ← Dependencies、bodyState、native.typing_flags
         ↓
Step 4. Universe Set-up
  ← universes + 声明类型 / Body 中的 Levels
         ↓
Step 5. Recursive Translation
  ← type / body 的 IR.Term
         │
         ├── transClosed
         └── trans（逐个 AST Node 翻译）
         ↓
  Lean Expr
    ├── 类型表达式（Type）
    └── 值表达式（Value）
         ↓
Step 6. Universe Level Solving
         ↓
Step 7. Universe / Interface Checks
         ↓
Step 8. Declaration Emission
  → Lean Kernel Checking
  → DeclResult / Updated GEnv
```

---
## Step 3 Gates
**目标：** 在真正翻译之前做前置检查，尽早拦下不可能翻译成功的 Declaration。
### Gates 在哪里、做什么
Step 2 结束后，Translator 已经得到所有要翻译的 Rocq Declaration 的内部表示（`ConstantDecl` / `InductiveDecl`）。接下来，主循环按依赖顺序，一个一个地把它们翻译成 Lean Declaration。
- 对每个 Declaration，tier ladder 会用不同的 flags 发起若干次 Attempt，每次 Attempt 都从 Gates 开始。
- Gates 本身不翻译任何东西，只做前置检查。
- 如果这个 Declaration 在当前情况下根本不可能被翻译，就在这里停下，并记录一个明确的失败原因，不必等到 Step 5 翻译了一半，或 Kernel 报出一个难以理解的错误。
### 依次检查什么
详见 [[Step 3 Pending 依赖 和 artifacts（替身）]]。假设 Rocq 中有：
```coq
Definition id (A : Type) (x : A) := x.

Definition use_id (A : Type) (x : A) :=
  id A x.
```
现在 Translator 正在翻译 `use_id`，Gates 依次检查以下 6 项。

**前三项：检查依赖（`use_id` 引用的 `id` 是否可用）**
1. **依赖是否有结果记录** → 否则 `EXPORT_VALIDATION_FAILED`
   检查 `id` 是否已经有一条翻译结果。如果没有，说明 `id` 可能没有被正确导出，或者没有按照「Dependencies 在前」的顺序处理。
2. **依赖是否失败** → 否则 `BLOCKED_DEPENDENCY`，并在 `blocked_by` 中记录 `id`
   - 如果 `id` 已经成功翻译（`Rocq.id` 存在，或是一个可用的 Pending 形式），`use_id` 可以引用它。
   - 如果 `id` 自己翻译失败了（例如 Universe 检查不通过，得到 `UNIVERSE_REJECTED`），`use_id` 就没有东西可引用。
3. **依赖的命题是否已经翻译** → 否则 `OBLIGATIONS_PENDING`
   - 如果 `use_id` 用到了一个还没有证明的定理 `id`，Translator 会把「`id` 成立」写成 `use_id` 的一个假设 `h`。
   - 这个假设的类型，是 `id` 的命题翻译成 Lean 之后的样子，即 `Rocq.id.statement`。
   - 所以 Gates 要检查 `Rocq.id.statement` 是否已经翻译成功并被 Lean Kernel 接受。接受了，`use_id` 就带着假设 `h` 继续翻译；没接受，假设的类型就写不出来，`use_id` 只能停下。

**后三项：检查 `use_id` 自身**

4. **Typing Flags 是否正常** → 否则 `AUDIT_REJECTED`
   检查 `use_id` 在 Rocq 中是否经过了必要的 Kernel Checks。如果导出的 Metadata 表明 Universe Checking 或 Guard Checking 被关闭，就不能保证原声明满足翻译要求。
5. **Body 是否可用** → 否则 `BLOCKED_SOURCE_BODY` / `UNSUPPORTED_FEATURE`
   检查 `use_id` 自身的 `bodyState`。如果 Body 没有成功导出，就无法直接翻译。
6. **目标名称是否冲突** → 否则 `TRANSLATION_FAILED`
   准备把 `use_id` 翻译成 `Rocq.use_id` 时，检查 Lean 中是否已经存在这个名称。已有同名 Declaration，就不能再次添加。

只有 6 项全部通过，`use_id` 才会进入 Step 4 Universe Set-up 和 Step 5 Term Translation。
### 为什么 Gates 很重要
- 失败会沿依赖传播：一个声明失败，所有直接或间接依赖它的声明都会在 Gates 处得到 `BLOCKED_DEPENDENCY`。所以少数几个底层失败就能挡住大量 Roots。例如 MathComp 数值层次中少数几个声明失败，就挡住了约 105 个 protected roots。
- 代价最小：挡下一个声明只需要查表，不需要翻译、求解 Universe 或调用 Kernel。

---
## Step 4 Universe Level Setup
**目标：** 为当前 Declaration 中出现的每个 Universe Level 建立 Lean 中的对应物。分两种情况：Polymorphic（R6）和 Monomorphic（R2S）。
### Polymorphic 的情况（R6）
#### 什么是 Universe Polymorphism
有些 Rocq 声明是「Universe 多态」的：这个声明自己带着几个 Universe 变量，用的时候再决定它们具体取什么 Level。

打个比方，就像一个函数带着参数，调用时再传值，只不过这里传的不是普通的值，而是 Universe 的高度。
```coq
Polymorphic Definition polyId@{u} (A : Type@{u}) (x : A) : A := x.

polyId@{Set} nat 0     (* 这次用的时候，u 取 Set *)
polyId@{w}   B   b     (* 这次用的时候，u 取 w *)
```
- Universe Instance：每次使用时给出的那组 Level（这里的 `Set`、`w`）。
- 实例化：给变量填上具体 Level 的这个动作。

所以同一个 `polyId`，可以在不同高度的 Universe 上重复使用。

变量之间还可以带条件（Constraints），写在声明的 `@{…}` 里：
```coq
Polymorphic Definition promote@{u v | u <= v} (A : Type@{u}) : Type@{v} := A.
```
- `promote` 有两个 Universe 变量 `u`、`v`，并且要求 `u ≤ v`。Translator 从 `ConstantDecl.universes` 读到的就是这些：两个变量，加一条条件。
- 在 AST 里，`u`、`v` 不用名字，而是写成 `var 0`、`var 1`，意思是「这个声明自己的第 0 个、第 1 个变量」。

> [!warning] 注意
> 如果写成单独的 `Universe u v. Constraint u <= v.`，那是两个全局的 Universe，不属于任何一个声明，用到它们的声明也就不是多态的了。
#### 翻译到 Lean：一个变量对应一个参数
规则很直接：Rocq 声明的第 i 个 Universe 变量，在 Lean 里就变成第 i 个 Universe 参数 `v_i`。

| Rocq 中 | AST 中 | Lean 中 |
|---|---|---|
| `u` | `var 0` | `v_0` |
| `v` | `var 1` | `v_1` |

- 每个声明都从 `v_0` 开始数，所以不同声明里的 `v_0` 互不相干。
- 翻译 `Type` 时还是要 +1：Rocq 的 `Type@{u}` 相当于 Lean 的 `Type u`，而 Lean 的 `Type u` 就是 `Sort (u+1)`。所以 `Type@{u}` 变成 `Type v_0`：
```lean4
def Rocq.polyId.{v_0} (A : Type v_0) (x : A) : A := x
```
#### Constraints 带不过去
Lean 的声明没法写「`v_0 ≤ v_1`」这种条件，所以这一步只建参数，不带条件。这带来一个差别：
- Rocq 只要求声明在「满足条件的取值」下成立；
- Lean 要求它在所有取值下都成立。

结果：
- 像 `polyId` 这样本来就没用到任何条件的，翻过去直接通过。
- 像 `promote` 这样靠条件才成立的，直接翻过去会失败：
```lean4
def Rocq.promote.{v_0, v_1} (A : Type v_0) : Type v_1 := A    -- Lean 不接受
```
`promote` 在 Rocq 里成立靠两样东西，Lean 都没有：
1. `u ≤ v`：Lean 不能写 `v_0 ≤ v_1`。
2. Cumulativity（小 Universe 里的东西自动算作大 Universe 里的东西）：Lean 不会自动把 `Type v_0` 里的东西当成 `Type v_1` 里的东西。

这类问题留给后面的 tier 处理，Universe Set-up 这一步不管。
#### 引用多态声明时
别的声明用到 `polyId` 时，Rocq 已经把这次用的 Instance 定好并写在 AST 里了。Translator 不用自己选，只要把 Instance 里的每个 Level 换成 Lean 里对应的东西（`transInstLevel`）：

| Instance 里写的是 | Lean 里换成 |
|---|---|
| `Set` | `0` |
| `var i`，即引用者自己的第 i 个变量 | 引用者自己的 `v_i` |
| 一个全局 Level `l` | 先是为 `l` 建的「待定空位」（Level 元变量），之后通常变成引用者的参数 `u_l` |

**例子：** 另一个多态声明 `bar@{a b}` 里写了 `polyId@{b} B y`。`b` 是 `bar` 的第 1 个变量，所以：
```lean4
-- AST
const polyId [var 1]

-- Lean
Rocq.polyId.{v_1} B y
```

> [!tip] 容易看混
> 这个 `v_1` 是 `bar` 自己的参数，它被传给 `polyId` 的参数 `v_0`。两个名字属于两个不同的声明，不是同一个东西。

另外两点：
- 引用者不是多态的，比如写的是 `polyId@{Datatypes.197} …`，那就只能用全局 Level。翻译时 197 先对应引用者为它建的待定空位，算完之后通常变成引用者的参数 `u_197`。
- Level 个数必须一致：Instance 里给的 Level 个数必须和被引用声明的变量个数一样多，否则直接报 `UNSUPPORTED_FEATURE`。

**一句话总结 R6：** 多态声明的 Universe 变量和每次使用时的 Instance，Rocq 都已经定好了。Translator 只需照着一一搬到 Lean，不重新猜，也不让 Lean 自己去选。
### Monomorphic 的情况（R2S）
#### 1. Rocq 中的 Monomorphic：用的是全局 Level
Rocq 里大多数声明（Corelib、MathComp 里绝大部分）不是多态的，而是 Monomorphic。它们的 `Type` 用的不是自己的 Universe 变量，而是一个全局的、有名字的 Level：
```coq
Definition length (A : Type@{Corelib.Init.Datatypes.197}) (l : list A) : nat := …
```
这里的 `Datatypes.197` 是整个 Rocq 全局 Universe 环境中的一个 Level：
- 共享：`Corelib.Init.Datatypes.197` 不专属于 `length`，其他 Declarations 的声明类型或 Body 也可以引用这个 Level。所有这些引用指向同一个 Global Universe Level，并受同一个全局 Universe Constraint Graph 约束。
- 不变：每次引用 `length` 时，其 Global Universe Level `Datatypes.197` 保持不变，不会根据输入类型重新实例化；但输入类型仍须满足与该 Level 相关的 Universe Constraints。
- Level 之间的关系记在全局：它和其他 Level 的关系（比如 `Set < 197`、`51 < 58`）不写在声明里，而是记在 Rocq 的全局 Universe Graph 里。Step 1 已经把这些关系导出在 `universe_facts` 中。
#### 2. Lean 没有全局 Level
Lean 的 Universe Level 只能是某个声明自己的参数，或者 `0`、`1`、`max` 这样的具体表达式，没有「整个环境共享的、有名字的 Level」。

所以 Rocq 的全局 Level 197，在 Lean 中只能变成每个用到它的声明各自的一个参数，名字叫 `u_Corelib_Init_Datatypes_197`（简写 `u_197`）：
```lean4
def Rocq.length.{u_197} (A : Sort u_197) (l : Rocq.list.{u_197} A) : Rocq.nat := …
```
于是 Rocq 中「大家共享同一个 197」，在 Lean 中变成了「很多声明各有一个叫 `u_197` 的参数」。这些参数在 Lean 中彼此独立，所以 Translator 要在引用时把这层关系补回来：如果引用者在Rocq里自己也用 197，就必须把自己的 `u_197` 传过去，保证两边仍是同一个 Level；如果引用者不用 197，就可以按需要实例化成别的 Level，但不能超过 Rocq 允许的范围（见第 4 点）。
-  [[Lean 里面的 Universe Parameter]]
#### 3. 翻译Declaration 时，先放「待定空位」：Level 元变量
##### 什么是 Level 元变量
Level 元变量（Level Metavariable，写作 `?m`）是 Lean 提供的一种「待定的 Universe Level」：先在表达式里占一个位置，具体是什么 Level 以后再填。

- Lean 做类型检查时，可以通过统一（Unification）自动把它解出来；
- 我们也可以手动给它赋值。
##### 在哪里放
每次尝试翻译一个声明时，Step 4 先找出这个声明自己的 Level（own levels）。做法是扫描它的声明类型（Type）和 Body，收集其中直接写出来的全局 Level。来源有两处。

**来源一：sort 节点，即 `Type@{…}` 本身**

`sort` 是 AST 中表示一个 Universe 的节点，比如 `Prop`、`Set`、`Type@{197}`。全局 Level 就写在它里面：
```coq
Definition count (A : Type@{197}) (l : list A) : nat := …
```
```text
prod A
 ├── ty:  sort (Type@{197})     ← 197 写在这里
 └── body: …
```
参数 `A` 的类型（`Type@{197}`）是一个 sort 节点，里面写着 197，所以 197 是 `count` 的 own level。

**来源二：引用节点，即引用别的声明时带的 Universe Instance** (这种情况很少)

引用节点就是 term 中指向另一个声明的节点：

- `const c u`：常量
- `ind I u`：Inductive 类型
- `construct I k u`：构造器

它们都带一个 Universe Instance `u`，表示「这次用的是被引用声明的哪个 Level 版本」。如果 Instance 里写的是全局 Level，它也算 own：
```coq
Definition foo (B : Type@{197}) (y : B) := polyId@{Datatypes.197} B y.
```
```text
app
 ├── f: const polyId [global Datatypes.197]   ← 197 写在这里（Instance 中）
 └── args: B, y
```
这个 197 也是写在 `foo` 自己的 Body 里的，只是位置在引用节点的 Instance 中，而不在 sort 中。

**反例：两者都不算**
```coq
Definition len_nat (l : list nat) : nat := length l.
```
```text
app
 ├── f: const length []     ← Instance 是空的，没有写出任何 Level
 └── args: l
```
`length` 是 Monomorphic 的，引用它时 Instance 为空。197 写在 `length` 自己的声明类型里，不在 `len_nat` 的 term 中，所以 197 不是 `len_nat` 的 own level。

**建表**

找出 own levels 后，新建一张空表 `gl`，为每个 own level 新建一个元变量，记进表里（源 Level → 元变量）：
```lean4
-- Step 4（Emit.lean，简化）
let own := (globalsOf body (globalsOf c.type) ++ extraOwn).eraseDups.qsort
let mut gl := {}                                   -- 每次尝试都是一张新表
for l in own do gl := gl.insert l (← mkFreshLevelMVar)
```
以 `count` 为例：
```text
扫描声明类型和 Body：直接写出来的全局 Level 只有 197（在参数 A 的类型里）
own = [197]
gl  = { 197 ↦ ?m }
```
有三点要注意：
- 一个 Level 只放一个元变量：在这次尝试中，197 在这个声明里不管出现多少次，用的都是同一个 `?m`。
- 每次尝试都重新放：`gl` 是每次尝试新建的空表，元变量也是新建的。不管是翻译下一个声明，还是同一个声明换一个 tier 重试，都会重新扫描、重新建表，不会沿用上一次的 `?m`。
- 调用 Monomorphic 声明时：在 `count` 中，`length` 是 Monomorphic 的，引用节点只有 `const length []`，Instance 是空的，所以扫描这个引用节点得不到任何 Level。所以这里的情况要等 Step 5 翻译到 `length` 这个引用、Translator 查到 `length` 的参数 再进行处理。

另外，own 中出现在声明类型（Type）里的那部分会被单独记下（`typeLevels`；Statement 看整个命题）。只有这些 Level 之后才可能成为 Lean 声明的参数，只在 Body 中出现的不会。
##### 怎么用
Step 5 翻译时，`gl` 表作为上下文（`globalLevels`）传进去。凡是遇到 own level 197，都查表换成 `?m`：
```text
Type@{197}                →  Sort (?m + 1)            -- sort 中的 197
引用 length（197 是 own）  →  Rocq.length.{?m} A l     -- 引用处的实参（规则一）
```
所以 Step 5 翻译出来的类型表达式（Type）和值表达式（Value）中，197 所在的位置都是同一个空位 `?m`，Step 6 再决定它填什么。
##### 为什么不直接定下来
为了推迟决定。在翻译完、交给 Lean 做类型检查之前，我们还不知道 Rocq 里的 Level 197 在 Lean 里应该是什么，有三种可能：

- 可能被强制等于别的 Level：Lean 没有 Cumulativity，Level 必须精确相等。类型检查时，可能会强制 `?m` 等于另一个 Level。
  - 例如 Lean 检查某个函数调用时，会比较实际参数的 Type 和被调用函数要求的参数 Type。
  - 如果实际参数的类型是 `Type ?m`，而函数要求的是 `Type v`，Lean 就需要让这两个 Type 在定义上相等，因此可能通过 Universe Unification 求解出 `?m := v`。
- 可能只出现在 Body 里：这个 Level 只用于 Declaration 内部的计算或证明，不影响外部调用者需要提供的参数类型或返回类型。所以不需要把它暴露为 Lean 的 Universe Parameter，而是在翻译时根据 Type Checking 和 Rocq Universe Constraints 确定一个合法值（例如满足约束的最小值）。
- 可能一直没有被约束：这时它应该成为参数 `u_197`，保持声明的一般性。

这三种情况要等 Step 5 把整个项翻译完、Step 6 让 Lean 做完类型检查之后才分得清。所以 Step 4 先放空位，Step 6 再统一决定：

| Step 6 中 `?m` 的结局 | 什么时候 |
|---|---|
| 成为参数 `u_197` | 类型检查后它仍然自由，并且出现在声明类型中 |
| 被解成某个具体 Level | 类型检查通过统一把它固定了 |
| 取默认值（最小模型） | 只出现在 Body 中，没有被固定 |

#### 4. 实例化：Rocq 不用做，Lean 必须做
- Rocq 中：引用 Monomorphic 声明没有实例化。`length` 使用到的 universe level 始终是全局 Level 197。
- Lean 中：`Rocq.length` 有了参数 `u_197`，每次引用它都必须给这个参数填一个实参。AST 里没有现成的答案 （因为 Rocq 中这一块是固定的全局 Level），所以由 Translator 自己决定（Step 5 的 `sharedOrFreshLevels`）。

基本规则有两条。
**规则一：197 也是引用者自己的 Level** →  复用同一个元变量
Rocq 中，`length` 用的是全局 Level 197，`count` 自己用的也是这同一个 197。既然在 Rocq 中它们本来就是同一个 Level，翻译时也应该保持一致：引用 `length` 时，直接把 `count` 为 197 建立的元变量 `?m` 传给它，而不是新建一个。求解之后，两者用的就是同一个 Lean 参数 `u_197`。
```coq
Definition count (A : Type@{197}) (l : list A) : nat := length l.
```
```lean4
-- Step 5：count 自己的 197 → ?m，引用时传同一个 ?m
Rocq.length.{?m} A l

-- Step 6 后
def Rocq.count.{u_197} … := Rocq.length.{u_197} A l
```
**规则二：197 不是引用者自己的 Level** → 
`length` 期待的是 `Type@{197}` 中的类型，但这里传入的是 `nat`，而 `nat` 在 `Set` 中。在 Rocq 中这个调用能成功，靠的是 Cumulativity：`Set ≤ 197`，所以 `Set` 中的类型也自动算作 `Type@{197}` 中的类型。

但是 Lean 没有这种 Cumulativity，要求 Universe Levels 能够匹配。不过好消息是，我们翻译后的 `length` 使用的是一个可以实例化的 Lean Universe Parameter，所以每次调用时可以选择合适的 Universe Level。具体来说，翻译器会为 `length` 的 Universe Instance 创建一个新的 Metavariable `?k`，然后交给 Lean Type Checker 去解。类型检查器会发现，`length` 期待的是 `A : Type ?k`，而我们实际传入的 `nat` 属于 `Type 0`，所以它就会把 `?k` 解成 `0`，这样两边的 Universe Level 就匹配了。

```coq
Definition len_nat (l : list nat) : nat := length l.
```
```lean4
-- Step 5：len_nat 中没有 197 → 新元变量 ?k
Rocq.length.{?k} nat l

-- Step 6 后：类型检查把 ?k 解成 0
def Rocq.len_nat (l : Rocq.list.{0} Rocq.nat) : Rocq.nat :=
  Rocq.length.{0} Rocq.nat l
```
#### 5. 和 Polymorphic 对比

|               | Polymorphic（R6）                                                | Monomorphic（R2S）                                     |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| Rocq 中的 Level | 声明自己的变量 `var i`                                                | 全局的、有名字的 Level，如 `Datatypes.197`                     |
| 每次使用时         | 可以提供不同的 Universe Instance（即为 Universe Parameters 选择具体的 Levels） | 使用固定的 Global Universe Levels，不需要提供 Universe Instance |
| Lean 中        | 直接变成参数 `v_i`                                                   | 先建元变量 `?m`，Step 6 再决定是参数 `u_l`、具体 Level 还是默认值        |
| 引用时的实参        | Rocq 已经定好，照搬（`transInstLevel`）                                 | Translator 自己选：同一个 Level 传同一个元变量，否则建新的元变量再求解         |
| Constraints   | 声明自己的，Lean 带不过去                                                | 在全局 Universe Graph 中（`universe_facts`），用来检查结果        |

- 多态声明：Level 和实例化 Rocq 都已经定好，照搬即可。
- 单态声明：用的是全局 Level，Lean 里没有这个东西，只好在每个声明里各设一个参数。这个参数到底该是什么、引用时该填什么，要等翻译完、类型检查之后才知道，所以先用元变量占位，推迟到 Step 6 再决定。

---
## Step 5 Term Translation（`trans`）
**目标：** 把 `IR.Term` 一个节点一个节点地翻译成 Lean 的 `Expr`，得到 Lean 类型表达式（Type）和 Lean 值表达式（Value）。

到这一步，手上有两样东西：

- IR：Step 2 解析好的声明类型（Type）和 Body，都是 `IR.Term`；
- Level 表：Step 4 为这个声明的 own level 建立的元变量（`gl`）。
### 1. 翻译在一个「上下文」中进行
`runTrans` 先翻译 Type，再翻译 Body。每次翻译都带着一个上下文（`TCtx`），翻译过程中随时可以查。里面主要有：

| 上下文中的东西 | 用来做什么 |
|---|---|
| `globalLevels`（即 Step 4 的 `gl` 表） | 遇到 own level 时，换成对应的元变量 |
| `polyLevels` | Polymorphic 声明的 `var i` 换成 `v_i` |
| 本次尝试的 flags / 规则（`admit`、`lower`、`unify`…） | 决定 sort 要不要 +1、引用处要不要复用元变量、是否使用 `PULift` 等 |
| `genv`：全局翻译状态（Global Environment） | 所有已接受声明的登记（见下） |

`genv` 记录了每个已接受的源声明：

- 它对应哪个 Lean 名字；
- 它的 Universe 参数各自代表哪个源 Level。例如 `Rocq.length` 只有一个参数 `u_197`，代表 Rocq 的全局 Level 197。

引用别的声明时，Translator 据此知道每个参数代表哪个源 Level，再去当前声明的 `gl` 表里找：找到就复用，找不到就新建元变量，作为实参填进去。
### 2. 怎么走：从外到内，递归地翻译
核心函数是 `Translate.lean` 中的 `trans`。它做的事情很直接：

1. 从 AST 的最外层开始，看当前节点是哪一种（∀、λ、函数应用、引用、`match`…）；
2. 按这种节点的规则，翻译成 Lean 中对应的东西；
3. 对它的子节点做同样的事，直到整棵树都翻译完。

**变量要一一对上**
Rocq 的 AST 不用名字表示变量，而用编号：`rel 0` 表示「离我最近的那个 binder 引入的变量」，`rel 1` 表示「往外数第二个」，依此类推。Lean 最终也用同样的编号方式（`bvar`），所以可以照搬。

但翻译过程中，我们需要随时让 Lean 帮忙算类型，比如检查一个函数调用的参数类型对不对；而 Lean 只能为「已经放进上下文里的变量」算类型。所以：

- `trans` 每进入一个 binder（∀、λ、let），就把这个变量当作一个真正的局部变量放进上下文；
- 之后遇到 `rel i`，就去上下文里找从内往外数的第 i 个。

**最后再检查一遍**

整个项翻译完，`transClosed` 把这些局部变量重新换回编号（`bvar`），得到一个完整的 Lean 项。换回的同时检查两件事：

- 没有变量「逃逸」：每个变量都还在引入它的 binder 里面。如果某条翻译规则（比如改写 `match` 或递归时）把一个子项挪到了它的 binder 外面，这个变量就会「悬空」，结果不是合法的 Lean 项。
- 没有留下空位：除了代表还没证明的前提、等着变成假设的那些，项中不能有没填上的空位。

有任何一个问题，这次尝试就以 `TRANSLATION_FAILED` 结束。
### 3. 每种节点翻译成什么

| IR 节点 | 翻译成 Lean |
|---|---|
| `rel i` | 外层第 i 个局部变量 |
| `sort` | `Sort`：`Prop` → `Sort 0`，`Set` → `Type 0`，`Type@{197}` → `Type ?m`（查 `gl` 表） |
| `prod` / `lam` / `letIn` | `∀` / `fun` / `let`：先翻译类型，再在新局部变量下翻译 Body；不做 β 规约 |
| `app` | 函数应用：先翻译参数，再翻译函数头；必要时插入 coercion |
| `const` | 引用别的声明（见下文第 4 点） |
| `ind` / `construct` | 引用已翻译的 Inductive / Constructor，附带 Universe 实参 |
| `case` | `match` → 该 Inductive 的 recursor 应用 `I.rec …` |
| `fix` | 递归 → 降级成 recursor（structural、course-of-values，或 `Acc.rec` + 终止性 Obligation） |
| `cast` | 检查标注在 Lean 中可转换，然后擦除 |
| `proj` | `Expr.proj`（只用于已翻译的 primitive record） |
| `prim` | Lean 中的 Primitive 模型（`BitVec 63`、`PrimFloat.Rep` 等） |
| `var` / `evar` / `cofix` | 不支持：`UNSUPPORTED_FEATURE` |

### 4. 三种最需要注意的节点
#### 引用 `const`
这是 Universe 问题集中出现的地方。翻译一个引用要回答两个问题。

**问题一：引用的声明对应哪个 Lean 名字？** 查 `genv`：

- 被引用者已被接受 → `Rocq.<name>`；
- 它是一个还没证明的定理 → 换成一个假设（类型是它的命题），登记进 `hypsRef`；
- 它是一个 Pending 定义 → `RocqPending.<name>`，并传入它需要的假设；
- 都不是 → `TRANSLATION_FAILED`。

**问题二：Universe 实参填什么？**

- Polymorphic 声明：照搬 AST 里的 Instance；
- Monomorphic 声明：先查 `gl` 表，查不到就新建元变量（Step 4 讲的规则）。
#### `match` → recursor
Lean 的 Kernel 中没有 Rocq 那样的 `match`，只有每个 Inductive 自带的 recursor。所以 `case` 要改写成：
```lean4
I.rec params motive minors indices scrutinee
```
- `motive`：由源中 `match` 的返回类型构造；
- `minors`：每个分支变成一个 minor。
#### `fix` → 递归降级
Lean 的 Kernel 不接受一般的 `fix`，递归也必须改写成 recursor。按情况依次尝试：

1. 对递减参数直接 `match` → 结构递归；
2. 调用的不是直接子项 → course-of-values 递归；
3. 还不行，且在 Statement 模式下 → `Acc.rec`，并把「这个递归会终止」变成一个显式的终止性 Obligation。

> [!note] 形状变了，含义不变
> `match` 和 `fix` 的翻译会改变项的形状（Lean 中的样子和 Rocq 中不同），但含义不变。之后的独立 Audit 会核对这种对应关系。

### 5. 例子：`count`
```coq
Definition count (A : Type@{197}) (l : list A) : nat := length l.
```
Step 4 已经建好 `gl = { 197 ↦ ?m }`。Step 5 分别翻译声明类型（Type）和 Body。

**Type**
```text
IR：   prod A (sort Type@{197})
         (prod l (app (ind list) [rel 0])
           (ind nat))

Lean： ∀ (A : Type ?m) (l : Rocq.list.{?m} A), Rocq.nat
```
- **`Type@{197}` 查表换成 `?m`**：`count` 的声明类型中直接写出了全局 Level 197，所以 Step 4 已经把它收进 `gl` 表（`197 ↦ ?m`）。翻译这个 sort 时，查表得到 `?m`，`Type@{197}` 就变成 `Type ?m`。至于 197 最终在 Lean 中是什么，要留到 Step 6 再决定。
- **`rel 0` 指的是 `A`**：`rel 0` 出现在 `l` 的类型 `list A` 中。在这个位置，包住它的最近的 binder 是 `∀ A`，而不是 `∀ l`：`l` 自己的类型里还不能用 `l`，`l` 只在它后面的部分中有效。所以 `rel 0` 表示“参数 `A`”，翻译时去上下文里取出 `A` 对应的局部变量，`app (ind list) [rel 0]` 就变成 `Rocq.list A`。
- **`list` 的 Level 从 `A` 的 sort 得到**：`list` 是 template inductive。它在 Rocq 中没有固定的 Level，而是每次使用时，由参数（也就是 list 中的元素类型）所在的 Universe 决定。翻译时，Translator 让 Lean 算出 `A` 的类型（`Type ?m`），再用这个 `?m` 作为 `Rocq.list` 的 Universe 实参（规则 R5），得到 `Rocq.list.{?m} A`。这样，“列表所在的 Universe”和“元素所在的 Universe”就保持一致了。

**Body**
```text
IR：   lam A … (lam l …
         (app (const length []) [rel 1, rel 0]))

Lean： fun A l => Rocq.length.{?m} A l
```
- **同一个变量，位置不同，编号也不同**：在声明类型中，参数 `l` 的类型 `list A` 里只有 `A` 已经在作用域内，所以 `A` 是 `rel 0`。到了 Body 的 `length A l` 处，两个 binder 都已经进入，离得最近的是 `l`，所以 `l` 是 `rel 0`，`A` 变成了 `rel 1`。编号只表示“往外数第几个”，所以会随位置变化。翻译时，`trans` 每次都去当前的上下文里数，取出对应的局部变量。
- **引用 `length`**：翻译这个引用要决定两件事。一是写哪个 Lean 名字：查登记，`length` 已被接受，所以写 `Rocq.length`。二是 Universe 实参填什么：`length` 的参数代表 197，而 197 在 `count` 的 `gl` 表里，所以复用 `?m`（规则一，见“调用 Monomorphic 声明”一节）。`A`、`l` 则是普通参数，直接由翻译后的 `rel 1`、`rel 0` 填入。

翻译出来的类型表达式（Type）和值表达式（Value）中还带着元变量 `?m`。也就是说，Step 5 只负责「翻译形状」，Level 具体填什么，留给 Step 6。
#### 翻译之后的几个调整
Step 5 结束前，还要按顺序做几件事：

1. 把 `hypsRef` 中收集到的假设变成声明最前面的参数。这一步在 Level 求解之前做，所以这些假设中的 Level 也会被求解和检查。
2. 按本次尝试的 flags 做 coercion 和 lift：Prop / Type 提升、`PULift` 包装等。
3. 如果 Body 因为需要终止性 Obligation 而失败，就开启 `wfTerm` 重新做整个尝试。

**Step 5 的产出：** Lean 类型表达式（Type）和 Lean 值表达式（Value），两者都还带着 Level 元变量；以及登记好的假设。它们交给 Step 6 去求解 Level。

---
## Step 6 Level Solving
我们在step 5 获得了 Lean 类型表达式（Type）和 Lean 值表达式（Value）， step6的目标是给 Step 5 留下的每个 Level 元变量定一个值，让 Lean 的类型检查能通过。
### 1. 顺序：先让 Lean 解，再决定参数，最后填默认值
到了这一步，翻译出来的 Lean 类型表达式（Type）和 Lean 值表达式（Value）里还留着不少 Level 空位（元变量）。Step 6 的思路是「先让 Lean 能解多少解多少，剩下的再由我们来定」，一共六步。
#### ①–③：让 Lean 自己解
**① 检查类型表达式（Type）**

让 Lean 把声明的类型表达式完整地检查一遍。检查时，凡是要求两个类型必须相等的地方，Lean 都会想办法让它们相等。

最典型的是函数调用：传入参数的类型，必须等于函数要求的参数类型；而且可能有两处调用要求同一个参数类型。

- 一边是 `Type ?m`（Level 还空着），另一边是 `Type 0`（比如 `nat` 所在的 Universe）→ Lean 把 `?m` 解成 0；
- 两边都空着，比如 `Type ?m` 和 `Type ?k` → Lean 把它们连在一起（`?k := ?m`），以后这两个空位填的一定是同一个值。

这就是统一（Unification）。

**② 检查值表达式（Value）**

对值表达式做同样的检查。Value 中通常有更多的函数调用：如果两处调用放入了同一个类型的实例，这两处的 Universe Level 就必须一样。检查完，又会解出一些元变量，或者把两个元变量统一成一个。

**③ 对齐值表达式（Value）和类型表达式（Type）**

算出值表达式整体的类型（对整个 Value 做 `inferType`），它必须和声明类型（Type）完全一样：每个参数的类型、最后的返回类型都要对上。所以可以把这两处的 Universe Level 对齐。

例子见 [[Step 6 Examples]]。

到这里，①–③ 都是 Lean 自己在解：它利用表达式之间「这里的类型必须等于那里的类型」的要求，求出元变量的值。
#### ④–⑥：剩下的由 Translator 来定
**④ 补漏（这部分可以之后把 tier ladder 搞定后再来看）**
- 为什么 Lean 不解。Lean 的统一只在答案**唯一**时才赋值。像 `?a := 0`、`?k := ?m` 这种，答案只有一个，它就直接解。而 `max(?a, u) = u` 的意思是“`?a` 不超过 `u`”，`?a` 取 0、1、……、`u` 都对。Lean 不知道该挑哪个，就先把这个方程记在一个“推迟列表”里，不去猜。
- **“之后再来尝试”是什么时候**。不用等新规则，就在同一次尝试的 ④：求解器把推迟列表拿出来，逐个处理。它不做一般性的搜索，只试**很少几个固定的候选值**，所以叫“有界”求解器。试的方法是：先把候选值填进去，再问 Lean“现在这个方程成立吗、还有没有推迟的”。都满足就留下这个值，否则撤销，换下一个。

**⑤ 决定参数（`keepParams`）**

Lean 能解的都解完了，还空着的元变量里，有一部分应该成为这个 Lean 声明的 Universe 参数，让它保持和 Rocq 中一样一般。成为参数的主规则是：
- 这个元变量代表的是本声明**自己的** Level，而不是引用别人时现场新建的元变量。
- Lean 在之前的类型检查没有把这个元变量解出，所以统一之后它**仍然空着**
- 并且它出现在**声明类型**里（即类型表达式：每个参数的类型，加上最后的返回类型；含义见 [[类型是什么意思 （整个声明的类型）]]）。声明类型是调用者看得到的接口，所以接口里的 Level 要做成参数，让调用者可以自由选择；不在声明类型里、只在 Body 里出现的 Level，调用者看不到，不需要做成参数。
[[Step 6 Examples]]

**⑥ 填默认值**

最后还剩下的元变量，主要是**引用别人时现场新建、统一后仍然空着**的那些（自己写的、只在 Body 中的 Level 另有处理，这里先不讨论）。它们都填 0。

**为什么不做成参数**？这些元变量仍然是自由的，理论上也可以做成参数。但它们没有出现在声明的类型里：调用者看不到它们，Rocq 中的原声明也没有这样的 Level。做成参数，反而会让翻译结果和 Rocq 不一致。所以只给它们填一个默认值。

**为什么填 0**？Step 7 对这类实参有一个要求（R3）：**不能超过它所代表的那个源 Level**。拿 `test` 中的 `ignoreType.{?a} unitT` 来说，`ignoreType` 的参数代表 Rocq 的 Level 197。在 Rocq 中，这里用的正是 197，`unitT` 是借助 Cumulativity 被放进 `Type@{197}` 的，就像 `nat` 在 `Set` 中，也可以放进任何 `Type@{l}`。翻译到 Lean 时，我们可以在一个更低的 Level 上使用 `ignoreType`，但不能更高，因为 Rocq 从来没有在比 197 更高的地方用过它。

0 对应 Rocq 的 `Set`，而 Rocq 中每个全局 Level 都严格大于 `Set`。所以对任何被引用的 Level 来说，0 都不会超过它，R3 检查一定能通过。

**再验证一次：填什么都行**。每个填了默认值的元变量都记为“残余”。Translator 另外构造一个一般版本，把每个残余从 0 换成一个新参数，再交给 Lean Kernel 检查。Kernel 接受，就说明这些位置填什么值，Lean 都认为正确。

这样，两项要求都满足了：
- **对 Lean**，填哪个值都一样（由这次验证保证）；
- **对 Rocq**，0 是最不可能违反关系的值（由 Step 7 的 R3 检查确认）。

所以我们填 0。[[Step 6 Examples]]
### 2. 元变量最后会变成什么
每个元变量最后都会有一个确定的 Level，结局只有三种。
**结局一：被解出来**

在 Step 5 的函数调用检查，或者 Step 6 的 ①–④ 中，Lean 的统一已经给它赋了值。这个值可能是：

- 一个具体的 Level，比如 0；
- 用本声明的参数表示的表达式。常见的情况是，它先被连到另一个元变量上，等那个元变量在 ⑤ 中成为参数，它也就跟着变成了这个参数。

**结局二：成为参数**

统一走完以后它仍然空着，说明 Lean 的类型检查对它没有任何要求。如果它还是本声明自己的 Level，并且出现在声明类型（类型表达式 Type）中，⑤ 就把它变成本声明的一个新参数（比如 `u_197`）。这样，翻译后的声明和 Rocq 原来的一样一般。

**结局三：取默认值**

前两种都不是的，在 ⑥ 中填一个默认值 0，并记为「残余」。之后还要再验证。

> [!note] Step 6 不检查 Rocq 的 Universe 关系
> Step 6 只负责给每个元变量定一个值，保证 Lean 的类型检查能通过。这些值是否违反了 Rocq 原来的 Universe 关系，要到 Step 7 才检查。




---
## Step 7 忠实性检查：约束有没有丢，一般性有没有丢
**目标：** 检查 Step 6 选出来的每个 Level 值，确认翻译结果对 Rocq 原声明是忠实的。分两类：

- 约束没有丢：结果没有违反 Rocq 中的任何 Universe 关系，最重要的是没有把东西放进比 Rocq 允许的更小的 Universe 里；
- 一般性没有丢：结果没有比 Rocq 的原声明更窄，比如原本自由的 Level 被固定了。
### 「约束」从哪里来
约束可以来自多个地方：

- 结构性的：每个全局 Level 都严格大于 `Set`；
- elaboration 时产生的：比如 `count` 中把 `A` 传给 `length`，Rocq 会记下 `count 的 Level ≤ 197`。Cumulativity 方向上的要求，就是以这种形式出现的；
- 用户显式写的：比如 `Constraint u <= v.`。

Rocq 把这些约束都放进了同一个全局 Universe Graph，所以对 Translator 来说，它们没有区别。

- Step 1 把这个图导出成了 `universe_facts`：它记录的是 Rocq 从所有约束中推出来的、Level 之间两两的 `≤` / `<` 关系。
- Lean 自己看不到这些约束，所以 Step 7 要拿 Translator 选出来的每个值，对照 `universe_facts` 检查它们有没有违反 Rocq 的关系。

> [!note] 例外：Polymorphic 声明自己的约束
> 像 `@{u v | u <= v}` 这样的约束是声明局部的，不在全局图里，而是记在 `ConstantDecl.universes` 中。检查时用的是这份局部约束。
### 第一类：约束没有丢
#### A1. 自己的 Level 之间的关系
对应 R2S / R2B 的 fact 检查，代码中是 `checkBodyLevel`。

Rocq 中，一个声明自己的 Level（own level）之间，以及它们和 `Set` 之间，有各种关系（比如 `197 < 198`）。翻译之后这些关系不能被破坏。

- 成为参数的 own level 不用担心：参数是自由的，Lean 已经对它的所有取值做过检查。
- 需要检查的是 Step 6 中被解出的那些 own level：被统一固定成某个值，或者被连到了另一个 Level 上。它们的值必须和本声明其他 Level 的值放在一起，仍然满足 Rocq 中的关系。

**例子：`natList`**
```coq
Definition natList : Type@{197} := list nat.
```
意思是：定义一个类型 `natList`，它就是「`nat` 的列表」。声明中说它属于 `Type@{197}`。197 是 `natList` 自己写出来的 Level，Rocq 中有关系 `Set < 197`。

在 Rocq 中为什么成立：`list nat` 实际在 `Set` 中。借助 Cumulativity，`Set` 中的东西也算 `Type@{197}` 中的东西，所以声明成 `Type@{197}` 没有问题。

Step 5–6：
```text
gl = { 197 ↦ ?m }
声明类型：  Type ?m
Value：     Rocq.list nat，它在 Type 0 中
③ 对齐值表达式和声明类型：Lean 没有 Cumulativity，要求 Type ?m = Type 0  →  ?m := 0
```
于是 197 被解出为 0。

Step 7，A1 检查：
```text
197 的值是 0，0 对应 Rocq 的 Set   →   197 = Set
Rocq 要求 Set < 197               →   违反   →   UNIVERSE_REJECTED
```
**一句话：** Rocq 说 `natList` 在一个比 `Set` 严格大的 Universe 里，靠 Cumulativity 把 `list nat` 放了进去；Lean 没有 Cumulativity，只能让这个 Universe 等于 `list nat` 所在的那个，也就是 `Set`。这就和 Rocq 的 `Set < 197` 矛盾了，所以 A1 拒绝。

> [!tip] 之后怎么办 （感觉有问题）
> 对于值本身是一个类型的定义，声明的返回类型只是在说“这个类型住在哪一层”。Rocq 中这一层只是一个上界，靠 Cumulativity 才成立。R2B-V 把它换成值实际所在的那一层：这是对类型更精确的描述，并且 Step 7 检查它没有被抬高。
> **但它并不是“完全没问题**”。它改变了 `natList` 对外的**接口**：原来是 `natList : Type@{197}`，现在是 `natList : Type 0`。之后的声明如果依赖“`natList` 正好在 197 层”，就可能出问题。问题没有消失，只是**转移到了后面引用它的声明上**，这正是 early success with a bad choice。
#### A2. 引用别人时的每一个 Universe 实参
对应 R3，代码中是 `checkUniverseObligations`。

这里的「实参」指的是 Universe 实参，也就是引用时填进被引用声明的 Universe 参数里的那个 Level，例如 `Rocq.length.{u_197}` 中的 `u_197`，而不是普通参数 `A`、`l`。

被引用声明的每个 Universe 参数，都代表 Rocq 中的一个源 Level `l`，这是它被接受时登记下来的。比如 `Rocq.length` 的参数代表 197。检查分两种情况。

**情况一：`l` 也是本声明自己的 Level（两边共享同一个源 Level）**

实参必须正好是本声明为 `l` 建立的那个参数（Step 4 建元变量时提到过）。

例：`count` 自己写了 `Type@{197}`，又引用了 `length`，而 `length` 的参数也代表 197。在 Rocq 中，两边是同一个 197，所以翻译后，`count` 传给 `length` 的实参必须正好是 `count` 自己的 `u_197`：
```lean4
def Rocq.count.{u_197} (A : Type u_197) … := Rocq.length.{u_197} A l   -- 必须是 u_197
```
如果传的是别的值（比如 0），`count` 中的 197 和 `length` 中的 197 就不再是同一个 Level 了，「同一个」的关系也就丢了。例外：如果这个值在任何取值下都等于 `u_197`，也算通过，即 rule R。

**情况二：`l` 不是本声明自己的 Level（单态）**

实参不能超过 `l`，也就是 Rocq 必须能推出 `实参 ≤ l`。

例：`len_nat` 中没有 197，它引用 `length` 时，Universe 实参被解成了 0：
```lean4
def Rocq.len_nat … := Rocq.length.{0} Rocq.nat l
```
检查：0 对应 Rocq 的 `Set`，Rocq 能推出 `Set ≤ 197` → 通过。

这就是 Cumulativity 的方向。在 Rocq 中，这里用的正是 197，`nat` 是借助 Cumulativity 被放进 `Type@{197}` 的。所以翻译后：

- 可以在更低的 Level 上使用 `length`：Rocq 中本来就允许把更小的东西放进来；
- 不能在更高的 Level 上使用：Rocq 从来没有在比 197 更高的地方用过它。

Polymorphic 声明的参数也类似，只是用的是声明自己的局部约束，而不是全局的 `universe_facts`。
#### A3. 几条附加检查
只在用到特定规则时才检查：

| 规则 | 检查什么 |
|---|---|
| R2F 读法 | 用了约束编码的 Level，读法必须真的是 `ι l` |
| R2B-V | 结果 sort 的 Level 不能被抬高 |
| R-OCC | 每个副本都要满足 Rocq 的上界 |
| R2B-P | 不能用在 Pending 声明上 |

### 第二类：一般性没有丢
#### B1. 接口保护（P0）
Statement 和受保护的公开声明，不能用任何会让接口变窄的放宽，例如：

- R2B-P：固定声明类型中的 Level；
- R2B-S：降低结果 sort。

用了就是 `INTERFACE_REJECTED`。
#### B2. 量化范围不能被绑在一起
代码中是 `binderIndependence`，只对 Statement。

例如定理 `∀ (A : Type@{a}) (B : Type@{b}), …` 中，如果 Rocq 允许 `a`、`b` 各自独立，翻译后就不能变成「`A` 和 `B` 必须在同一个 Universe」。
#### B3. 自由的 Level 不能被固定
代码中是 `freeLevelPin`。

Rocq 中自由的 Level，不能在 Statement 中，或受保护定义的参数类型中，被固定成一个具体的值。

> [!example] 实验中的例子
> EDF 的 `sched_valid` 被拒绝：`JobArrival` 的 Level 58 在源中是自由的，翻译后却被解成了 0。错误信息是：
> ```text
> statement specialization refused: … is free in the source … but its argument is 0
> ```
#### B4. 默认值的正当性
代码中是 `justifyResiduals`。

⑥ 中填了默认值的残余，要验证「换成任意值 Lean 也接受」。不接受就是 `UNIVERSE_REJECTED`：
```text
defaulted universe level(s) … not justified
```

> [!note] 一般性检查主要针对 Statement 和受保护的声明
> 普通的、未受保护的定义，是内部使用的辅助声明，允许以比 Rocq 更窄的形式被接受。比如 `count2` 在第一次尝试中就是这样，之后由 tier ladder 的 ⑫ 尝试换成更一般的版本。这是有意的取舍：不然很多内部定义根本翻译不过去。
### 还有一个基本检查
翻译出的声明类型确实是一个类型：`whnf (inferType ty)` 必须是一个 sort，否则 `TRANSLATION_FAILED`。
### 代码中的实际顺序
```text
1.  R2F 读法检查（Statement 模式）                        A3
2.  自己的 Level 之间的 fact 检查（checkBodyLevel）        A1   ← 最后几个 tier 可用 R-SET 放宽
3.  R2B-V：结果 sort 不被抬高                             A3
4.  R2B-P 不能用在 Pending 声明上                         A3
5.  P0 接口保护                                          B1   → INTERFACE_REJECTED
6.  每个引用的 Universe 实参（R3）                         A2
7.  量化范围独立（Statement）                             B2
8.  自由的 Level 不被固定（freeLevelPin）                  B3
9.  声明类型确实是一个类型                                      → TRANSLATION_FAILED
10. （终止性 Obligation 的相关检查）
11. 默认值的正当性（justifyResiduals）                    B4
```
失败时的结果：

- 第 5 步失败：`INTERFACE_REJECTED`；
- 第 9 步失败：`TRANSLATION_FAILED`；
- 其余失败：`UNIVERSE_REJECTED`。

任何一项失败，这次尝试就结束，tier ladder 换下一组 flag 再试。全部通过，才进入 Step 8，交给 Lean Kernel。