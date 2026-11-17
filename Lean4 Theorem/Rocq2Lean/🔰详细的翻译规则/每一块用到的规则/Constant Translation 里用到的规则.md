## Step 2. 为 Universe Levels 创建 Metavariables
##### R0：保留 Rocq 原始 Universe Facts
R0 负责提供翻译时不能丢失的源 Universe 信息。R0 的职责是保留源事实，而不是直接求解 Universe。
- 例如对于 `Universe u v`，在 Rocq 中存在constraint `u <= v ` Exporter 会把相关 Universe Facts 导出，使翻译器知道 `u`、`v` 不是完全独立的两个 Levels。
##### R2S：创建 Universe Metavariables，允许后续求解
R2S 的思想是：对于当前 Constant 自己的 Global Universe Levels，暂时不直接固定为 Lean Universe Parameters，而是先建立 Metavariables，让 Lean 类型检查决定哪些关系必须成立。
- 需要强调，R2S 不仅仅是“创建 Metavariables”这一行代码。完整的 R2S 还包括后续 Solving、Generality 和 Source Facts 检查。
这里只执行它的准备部分。
假设当前 Constant 涉及三个源 Universe Levels，`own = [u, v, w]`，那么翻译器会分别创建 Lean Universe Metavariables，并存入 `gl`：
```text
gl = {u ↦ ?u₁, v ↦ ?u₂, w ↦ ?u₃}
```
这些 Metavariables 在创建时都尚未确定，之后 Lean 会通过 Type Checking 和 Unification 逐步求解。例如，可能得到：
$$
?u_2=?u_1
\qquad\text{或}\qquad
?u_3=\max(?u_1,?u_2)
$$
对于经过 Unification 后仍然自由、且需要保留在公开 Type 中的 Levels，后续的 `keepParams` 会将其 Generalize 为 Lean Universe Parameters，例如 `?u₁ → Level.param "u"`。
##### R2B：特殊处理 Body-only Universe Levels
**R2B 的核心思想是：公开 Type 中的 Levels 需要尽可能保持声明的一般性，而 Body-only Levels 可以在满足源 Universe Constraints 的前提下，求解成依赖公开参数的 Universe Expressions。**
R2B 主要处理只出现在 Constant Body 中、但没有出现在公开 Type 中的 Universe Levels。例如：
```text
Type AST 使用：u
Body AST 使用：u, m
```
翻译器首先为两个源 Levels 创建对应的 Lean Universe Metavariables：
```text
u ↦ ?u, m ↦ ?m
```
但两者的后续处理不同：`u` 出现在公开 Type 中，需要考虑 Declaration 的 Generality，因此通常要在满足源约束的前提下 Generalize 为 Universe Parameter；而 `m` 只出现在 Body 中，不一定需要成为公开 Parameter，可以尝试根据 Rocq Universe Facts 求解为某个合法的 Universe Expression。
例如，假设 R0 导出的 Source Universe Constraint 是：
$$
u<m
$$
那么 `m` 的一个候选最小解释就是：
$$
\boxed{m=u+1}
$$
因此，经过 Universe Solving 后，可能得到：
```text
?u → Universe Parameter u
?m → u + 1
```
最终 Lean Declaration 只需要公开 Universe Parameter `u`，而 `m` 由 `u + 1` 决定，不必再创建独立的 Universe Parameter。
##### R6：处理显式 Polymorphic Universe Parameters
```
Polymorphic Definition poly_id@{u}
  (A : Type@{u}) (x : A) : A := x.
```
这种情况下，`u` 是声明显式给出的 Universe Parameter，而不是普通 Monomorphic Global Level。R6 要求保留这类显式参数及其引用时的 Universe Instances。
所以它与 R2S 的处理不同。
```
R2S — Monomorphic Global Level:
  u → ?u
  后续 Solving / Generalization

R6 — Explicit Polymorphic Variable:
  u → Lean Universe Parameter
  保留显式参数及其实例化信息
```
## Step 3. `trans`：将 Rocq AST 转换为 Lean Expressions
核心规则

|规则|作用|对应的 AST 节点|
|---|---|---|
|T01 — Variables & Binders|将 Rocq 的局部变量引用转换为 Lean 变量，保持 De Bruijn Index 和作用域正确|`rel`|
|T02 — Core Term Constructors|将依赖函数类型、Lambda、Let 和函数应用构建为 Lean Expressions|`prod`、`lam`、`letIn`、`app`|
|T03 — Global References|查找已翻译的全局 Constant、Inductive 或 Constructor，并构建对应的 Lean 引用|`const`、`ind`、`construct`|
|R1 (U02) — Sort Translation|将 Rocq 的 `Prop`、`Type@{u}` 转换成 Lean 的 `Sort` 表达式|

##### T01：局部变量翻译
对应 3.2 和 3.3 中的：`Rel 0, Rel 1`
`trans` 根据 De Bruijn Index，在当前局部上下文中找到对应的 Lean 变量。
例如：`fun (A : Type) (x : A) => x`
- 最后的 `Rel 0` 引用 `x`，而不是外层的 `A`。
T01 负责保证这种变量引用关系在翻译之后不变。
##### T02：函数类型、Lambda 和函数应用
这是整个 `id` 例子里使用最多的基础规则。
```
Rocq AST             Lean Expression
Prod              →  forallE
Lambda            →  lam
LetIn             →  let/binding
App               →  app
```
例如 `forall (A : Type), A -> A`
通过 T02 转成 `(A : Type u) → A → A`
而 `fun (A : Type) (x : A) => x` 通过 T02 转成对应的 Lean Lambda。
需要与 T01 配合：T02 建立 Binder，T01 保证 Binder 内的变量引用正确。
##### R1：Sort Translation
R1 负责把 Rocq Sort 映射成 Lean Sort。
例如：
```
Rocq Prop      → Lean Sort 0
Rocq Type@{u}  → Lean Sort (?u + 1)
```
通常写作：`Type ?u`
其中 `?u` 来自 Step 2 建立的 Universe Mapping。
因此：R1 负责把源 Universe Level 放进正确的 Lean Sort 结构，但不负责最终求解这个 Metavariable。
##### T03：全局声明引用（Global Reference）
T03 负责翻译对已有 Global Declaration 的引用。
例如，在 `Definition use_id (A : Type) (x : A) := id A x.` 中，当翻译器遇到 `Const id` 时，会通过 `GEnv` 查找已经翻译完成的目标 Declaration `Rocq.id`，并根据源 Universe 信息构造本次引用所需的 Universe Instance，例如 `Rocq.id.{?k}`。
- 随后，T02 的 Application Rule 会将该函数引用与参数 `A`、`x` 组合，得到 `Rocq.id.{?k} A x`。
因此，T03 负责解决“引用哪个全局声明，以及使用什么 Universe Instance”，T02 则负责解决“如何将函数与参数组合成 Application Expression”。
###### `case` 和 `fix` 涉及的 M 类规则
这里才是 Step 3 中真正需要额外转换的复杂 AST。
根据 44 条已验证规则中的 10 条 M 类规则：

|AST / 处理位置|规则|主要作用|
|---|---|---|
|`case` → `transCase`|M01：M3b|使用 Lean Recursor 表达依赖 Pattern Matching|
|`case` → `transCase`|M02|处理受支持的非均匀参数 Match|
|`fix` → `transFix`|M03|将普通结构递归转换为 Lean Recursor|
|`fix` → `transFix`|M04|将变化的前置参数移入 Motive|
|`fix` → `transFix`|M05|处理 Indices 和函数形式的递归字段|
|`fix` → `transFix`|M06|处理需要 ι 归约的复杂递归结构|
|`fix` → `transFix`|M07|将受支持的相互递归转换成联合递归|
|`fix` → `transFix`|M09|通过 Course-of-values 方式处理特定递归|
|`fix` → `transFix`|M11|必要时使用 `Acc.rec`，产生显式良基性证明义务|
|`case` / `fix` 相关索引处理|M12|支持特定构造器形式的 Indices|

|规则|什么情况触发|主要转换|已确认例子|
|---|---|---|---|
|**M01：M3b，依赖 match**|进入普通 `case` 翻译，包括返回类型依赖被匹配对象的情况|使用真实 Lean recursor；从源 predicate 建立 motive，并安排构造器字段及归纳假设。|`ArrayAxioms.length_make`|
|**M02：非均匀 match**|被匹配归纳类型具有受支持的非均匀参数|用 convoy 与 `Eq.rec` 等处理源固定参数和目标 indices 之间的关系。|`Wf.Fix_F`|
|**M03：单函数结构递归**|单个 `fix`，递归调用能够对应到可识别的递归字段|把递减参数上的递归改写为 recursor，把递归调用替换成相应归纳假设。|`Z.pos_div_eucl`|
|**M04：变化前置参数泛化**|递归调用改变了递减参数之前的某些参数，而且依赖关系允许这种处理|把这些变化参数移入 motive，使归纳假设可以接受新参数。|`Z.pos_sub`|
|**M05：索引与函数递归字段**|递减对象有 indices，或者递归字段自身是函数|泛化 indices，建立可以接收相应实参的归纳假设。|`Wf.Acc_rec`|
|**M06：ι 泛化递归**|函数体最外层没有直接匹配递减参数|针对递减参数的每个构造器，把它代入整个 Body，再对相关 match 做 ι 归约。|`Z.pos_sub`|
|**M07：结构互递归**|多个互递归函数具有相同递减位置、兼容的前置类型，以及相同的可支持归纳对象|用 `PProd` 组合多个函数的结果，通过一次递归构造所有分量，再投影所需分量。|`Pos.add`|
|**M09：Course-of-values**|普通结构路径因递归调用不在直接递归字段上而失败，且数据形状满足限制|使用 `below`／`PProd` 保存更深子项的递归结果。|`Pos.sqrtrem`|
|**M11：显式良基回退**|结构方案不足，且当前 statement-mode 配置允许生成显式证明任务|构造调用关系，用 `Acc.rec` 表达计算，把未解决的终止性等条件列为任务。|`Nat.gcd`|
|**M12：构造器形索引**|index 是受支持的非递归、单构造器记录形状，并由不同前置变量组成|通过字段投影恢复前置参数，支持相应的结构递归转换。|`Wf.Fix_F_2`|

对应源码： [transCase](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean?utm_source=chatgpt.com) [transFix](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean?utm_source=chatgpt.com)
- 这 10 条都是条件性规则。比如遇到 `fix`，翻译器会进入递归转换过程，但不代表 M03–M11 会全部使用；最终只会采用满足其适用条件并成功通过验证的转换路径。
###### 与 Step 3 直接相关的 Universe Rules
这些规则不是所有 AST 都会使用，而是在对应条件出现时参与翻译。

|规则|什么情况下使用|具体做什么|
|---|---|---|
|R3 (U06)|引用其他带 Universe Parameters 的声明|对共享源 Levels 复用映射，必要时创建新 Metavariables；完整的引用合法性检查在 Step 5|
|R5 (U09)|引用 Template Inductive|根据实际类型参数决定 Template Universe Instance，并检查参数适用性|
|R6 (U10)|引用显式 Universe-Polymorphic Constant|保留源声明给出的显式 Universe Instance，并转换为 Lean Level Arguments|
|R8 (U17)|特定 Motive / Sort 位置|使用特殊 Sort Level 表示，以处理某些 Prop / Type 兼容问题|
- 例如，你 3.4 的 `use_id` 涉及 T03，也涉及 R3 对 Universe 引用关系的处理；但若源 `id` 是普通 Monomorphic Definition，就不应把它的引用归为 R6。
还有几项值得归入特殊 Expression Translation：

|规则|作用|
|---|---|
|L02 — Prop up/down|在函数参数、Cast、Let 等位置需要时插入 `PULift` 相关转换|
|L03 — Type up/down|在受支持的 Type Universe 不匹配场景使用显式表示提升或恢复|
|E12 — Explicit Hypotheses|引用未完成证明的依赖时，创建相应的前提；随后把这些前提抽象为 Binder|

L02、L03 的部分逻辑发生在 `trans` 内，部分发生在 `Emit.lean` 的 Expression 后处理阶段。E12 的前提引用构造也可以在 `transHead` 中发生。
##### Rules involved in AST Translation
在 Constant Translation 中，`trans` 首先使用 T01、T02、T03 和 R1，将 Rocq AST 中的局部变量、Binder、函数应用、全局引用和 Sort 转换为对应的 Lean Expressions。
- 对于带 Universe Parameters 的全局引用，翻译器还需要按照 R3、R5 或 R6 等规则构造相应的 Universe Instances，并保留必要的源 Level 关系。
- 如果 AST 中出现 Pattern Matching 或 Recursive Functions，`trans` 则会调用 `transCase`、`transFix` 等专门处理过程，按条件使用 M 类翻译规则，将 Rocq 中不能直接对应的计算结构转换为 Lean 可表达的形式。
- 此外，在某些 Prop / Type 或 Universe 表示不兼容的情况下，翻译器可能使用 R8、L02、L03 等特殊转换规则。
最终，`trans` 生成 Lean Type Expr 和 Value Expr，但这些表达式仍可能包含尚未求解的 Universe Metavariables，交由 Step 4 进一步处理。
## Step 4. `solveLevels`：求解 Universe，并决定哪些要保留为参数
规则总览

| 规则                 | 对应阶段                  | 作用                                                         |
| ------------------ | --------------------- | ---------------------------------------------------------- |
| R2S (U04)          | 4.1 Solving           | 让 Lean 对当前声明的 Universe Metavariables 求解，保留必要的 Level 关系     |
| R2 (U03)           | 4.2 Generalization    | 将需要公开的 Global Universe Levels 转换为 Lean Universe Parameters |
| R3G (U15)          | 4.2 Generalization    | 从其他 Constant References 中发现需要额外公开的 Universe Levels         |
| R2F-c (U13)        | 4.2 特殊 Generalization | 用 `max` 表达式解释具有源约束关系的 Levels                               |
| R-CARRIER P2 (U19) | 4.2 特殊 Generalization | 为确实独立的 Universe Classes 创建不同的公开参数                          |
| R2B (U05)          | 4.3 Defaulting        | 求解 Body-only Levels，必要时使用最小合法解释                            |
| R3′ (U07)          | 4.3 Residual Handling | 为剩余自由的 Metavariables 选择默认值，并要求 Kernel Justification        |

### 4.2 Generalization：R2、R3G、R2F-c
##### R2：把自由 Type Levels 变为公开参数
对于：`(A : Type ?u) → A → A`, 经过 Lean Unification，如果 `?u` 仍然自由，而且需要保留在公开 Type 中，就可以将其泛化为 `u`：
```
def Rocq.id.{u} (A : Type u) (x : A) : A := x
```
项目中执行这个操作的核心代码是 `Emit.lean` 里的 `keepParams`，通过 `rebindThenKeep` 传入 `solveLevels`。
##### R3G：补全通过引用间接出现的 Universe Level
当一个 Constant 引用其他已经翻译的声明时，**可能会引入当前声明没有显式写出的 Universe Level**。例如，Rocq 中：
```
Definition T := Type.
Definition idT (x : T) : T := x.
```
假设 `T` 使用的源 Universe Level 是 `u`，那么翻译后的 Lean 表达式可以示意为：
```
def T.{u} : Type (u+1) := Type u
def idT (x : T.{?m}) : T.{?m} := x
```
这里的 `?m` 来自对 `T` 的引用，而不是 `idT` 自己显式声明的 Level。
如果直接将 `?m` 默认成 `0`，就可能限制 `idT` 的 Universe 一般性。
**R3G 会检查被引用声明** `T` **的源 Universe Level，以及 Rocq 原始 Universe Facts。** 如果满足约束，就将 `?m` 对应到 `u`，并保留为公开 Universe Parameter：
```
def idT.{u} (x : T.{u}) : T.{u} := x
```
这样就不会因为默认赋值而丢失原声明的 Universe 一般性。
对应源码：[Emit.lean — R3G](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean#L872)
#### R2F-c：使用 `max` 表达 Universe Constraints
R2F-c 用于处理带有 Source Universe Constraints 的 Levels。例如 Rocq 要求 $u<v$，如果直接将 `u` 和 `v` 转换成两个独立的 Lean Universe Parameters，Lean 并不会保证它们满足这个关系。因此，R2F-c 可以通过 `max` 构造满足约束的 Universe Interpretation：
$$
\boxed{\iota(v)=\max(v,u+1)}
$$
这样，无论 Lean Universe Parameters 如何实例化，都能保证 $u<\iota(v)$。因此，**R2F-c 的核心思想是通过符号化的 Universe Expressions 编码 Rocq 原始的 Universe Constraints，而不是将 Levels 固定为具体数值**，从而在满足源约束的同时尽可能保留 Universe Parameters 的一般性。
#### R-CARRIER P2：避免错误合并独立 Levels
当同一个源 Universe Level `l` 通过多个引用出现在公开类型中时，**Lean 可能为不同引用生成相互独立的 Universe Metavariables**。例如，翻译过程中得到：
```
F.{?m₁} A → F.{?m₂} B → ...
```
- 虽然 `?m₁` 和 `?m₂` 都来自源 Level `l`，但它们之间不一定存在必须相等的约束。如果直接把两者都替换成 `u_l`，就会强制它们相等，可能导致不必要的类型冲突。
**R-CARRIER P2 会在满足条件时，为不同的 Metavariable Classes 创建独立参数：**
```
F.{u_l__c0} A → F.{u_l__c1} B → ...
```
这样既保留了各引用的 Universe 独立性，又避免了错误的合并。这在 Higher-Order Interfaces 等复杂声明中尤其重要。

### 4.3 Defaulting：R2B 和 R3′
#### R2B：处理 Body-only Universe Levels
假设一个 Constant 的 Type 只使用 Universe Level `u`，但 Body 额外使用了 Level `m`：
```text
Type Levels: u
Body Levels: u, m
```
同时，Rocq 原始 Universe Facts 包含约束：
$$
u<m
$$
如果 `?m` 在 Lean Type Checking 和 Unification 后仍然自由，R2B 可以通过 `minimalModelLevel`，根据源 Universe Facts 计算一个最小的合法 Universe Expression。例如：
$$
\boxed{?m:=u+1}
$$
这样，`m` 就由公开的 Universe Parameter `u` 决定，不需要再作为独立的 Universe Parameter 公开。需要注意，**这个解释不仅要满足 $u<m$，还必须满足其他相关 Source Universe Constraints 和 Lean Type Checking Requirements**，不能只根据单条约束随意确定 `m`。
#### R3′：处理 Residual Universe Metavariables
Residual Metavariables 指经过 Solving 和 Generalization 后，仍然没有确定的 Level Metavariables。它们不一定全部来自源 Body-only Levels；也可能是在引用其他 Constant 等过程中额外创建的。
`solveLevels` 会收集残留变量：
```
let ((), ms) :=
  ((levelMVarsOf ty *> levelMVarsOf val).run #[])
```
然后利用 `dflt` 给出候选默认值。
例如：

|Residual 来源|默认值|
|---|---|
|对应源 Body-only Level `m`|根据 `minimalModelLevel`，例如 `u + 1`|
|无对应 Own Source Level|通常尝试 `0`|

但是不能直接认为这些默认值合法。
R3′ 的重要机制是：将 Residual 暂时替换成独立 Universe Parameters，构造更一般的声明，并要求 Lean Kernel 能够检查这个通用版本。
对应代码：
```
let ps := ...
let gty := ty.replaceLevel sub
let gval := val.replaceLevel sub
```
随后在 `Emit.lean` 中调用：`justifyResiduals ...` 检查这个更一般的声明。这保证默认值不是简单地掩盖类型问题。
### Rules involved in Universe Solving
Constant Translation 中的 Universe Solving 主要由 R2S、R2 和 R3′ 负责，并配合 R2B 处理 Body-only Levels。
- 首先，R2S 利用 Lean Type Checking 和 Unification 求解 Universe Metavariables，确定哪些 Levels 必须相等或由其他 Levels 表示。随后，R2 将仍然自由、需要保留在公开接口中的 Type Levels 泛化为 Universe Parameters。
- 对于只出现在 Body 中的 Levels，R2B 允许在满足源约束的前提下求解或使用最小默认解释。对于其他尚未解决的 Residual Metavariables，R3′ 要求通过更一般声明的 Kernel Justification，证明默认处理是合法的。
- 在更复杂的声明中，翻译器还可能利用 R3G 发现隐含的公开 Universe Levels，通过 R2F-c 使用 `max` 表达式保留源约束，或者通过 R-CARRIER P2 保留相互独立的 Universe Classes。
-  些 最终，这一步产生完整的 Type Expr、Value Expr 和 Universe Parameters，但仍须在 Step 5 检查这些解决方案是否符合 Rocq Universe Facts、引用一致性和接口一般性要求。

## Step 5. Universe & Interface Checking — 涉及的规则

| 规则                      | 对应阶段                     | 作用                                                 |
| ----------------------- | ------------------------ | -------------------------------------------------- |
| R0 (U01)                | 5.1 Universe Constraints | 提供 Rocq 原始 Universe Facts，作为检查依据                   |
| R2S (U04)               | 5.1 Own Levels           | 检查当前 Constant 已求解的 Universe Levels 是否满足源约束         |
| R2B (U05)               | 5.1 Body-only Levels     | 通过 `checkBodyLevel` 验证 Body-only Levels 的解是否合法     |
| R2F-c (U13)             | 5.1 / 5.4                | 使用 `max` 等 Universe Expressions 构造满足源约束的解释         |
| R3 (U06)                | 5.2 References           | 检查引用其他 Constant 时的 Universe Instance 与共享 Level 一致性 |
| P0 / V04                | 5.3 Generality           | 保护公开接口，防止错误固定或合并 Universe Levels，缩小声明适用范围          |
| R2B-P / R2B-S (U29/U30) | 5.3 特殊检查                 | 限制 Prop 相关特殊化和结果 Sort 降低，防止不合法的接口变化                |
| R2⁺ (U12)               | 5.4 Retry                | 利用源 Universe Facts 化简 `max` 等表达式                   |
| R3↑ / R3↓ (U28)         | 5.4 Retry                | 尝试受约束的 Universe 提升或较低引用实例                          |
| Rule P / L01–L03        | 5.4 Retry                | 使用 `PULift` 等显式表示转换处理 Prop / Type / Universe 不兼容   |
