我们已经知道了 Source Declaration 的类别。如果类别是 Constant，就进入[processConstantCore](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean?utm_source=chatgpt.com#L587)
每个section里面用到的规则：[[Constant Translation 里用到的规则]]
### Constant Translation 的完整流程
![[Pasted image 20261020114014.png]]
三个核心环节
- 语法和表达式：`trans` 把 Rocq 的 Type 和 Body AST 转换为 Lean Expressions，包括参数、函数应用、引用、递归等具体结构。
- Universe 求解：`solveLevels` 通过类型检查与 Unification 处理 Level Metavariables，决定哪些已经求解，哪些应当公开为 Universe Parameters，哪些可以在验证后使用默认值。
- 翻译正确性：Universe / Interface Checks 负责检查 Lean 中找到的解决方案是符合 Rocq 原始 Universe Facts，并满足项目所规定的语义和接口约束。
### Step 1. 准备 Type AST 和 Body AST
对于一个普通 Definition，例如 Rocq 中：
```coq
Definition id (A : Type) (x : A) : A := x.
```
Exporter 会分别导出这个 Declaration 的 Type AST 和 Body AST。在第三步里面，翻译器通过 `trans` 递归翻译这两棵 AST，分别得到 Lean Type Expression 和 Lean Value Expression：
```text
Type AST ──trans──→ Lean Type Expr  # (A : Type u) → A → A
Body AST ──trans──→ Lean Value Expr # fun (A : Type u) (x : A) => x
```
Type AST 描述函数的参数和返回类型，Body AST 描述函数的具体实现。具体的AST构造 [[AST_ID]]
### Step 2. 为 Universe Levels 创建 Metavariables
```coq
Definition id (A : Type) (x : A) : A := x.
```
- 对于普通的 Monomorphic Definition， `Type`的 Universe Level `u`是 Rocq 在处理声明时自动创建、并注册到全局 Universe Graph 中的 Global Universe Level。[[Universe Assigned To Definition]]
- id 的类型可以理解为 `forall (A : Type@{u}), A -> A`。我们希望最终在 Lean 中生成类似 `def Rocq.id.{u} (A : Type u) (x : A) : A := x` 的声明。
##### 2.1 为什么需要 Universe Metavariables？
- 创建 Universe Metavariables 的主要目的，是推迟最终 Universe 映射的决定：先让 Lean 根据目标表达式的类型要求求解必要的关系，再判断这些解是否能合法保留 Rocq 原始声明的约束和一般性。
Universe Levels 及其 Constraints 由Rocq Kernel 确定。翻译器不能直接将每个 Rocq  Universe Level 映射成独立的 Lean Universe Parameter。
```coq
例如，在 Rocq 中：Universe u v.
				Constraint u <= v.
				Definition promote (A : Type@{u}) : Type@{v} := A.
```
- `A : Type@{u}`，表示 `A` 是位于 Universe Level `u` 的类型。
- `promote` 声明返回 `Type@{v}`。
- 由于 Rocq 支持 Universe Cumulativity，并且 `u ≤ v`，因此可以直接返回 `A`。
但如果直接翻译到 Lean：
```lean
def promote.{u, v} (A : Type u) : Type v := A
```
Lean 不支持这种隐式 Universe Cumulativity。`A` 的类型是 `Type u`，而声明要求 `Type v`。对于独立的 Universe Parameters `u` 和 `v`，Lean 无法保证二者相等，因此上述定义无法通过类型检查。
为了解决这种 Universe 表示不兼容的问题，R2S 首先将当前 Constant 的源 Global Universe Levels 映射为 Lean Universe Metavariables，而不是立即确定最终的 Universe Parameters。例如：
```text
Rocq Levels:        u, v
Lean Metavariables: u ↦ ?u₁, v ↦ ?u₂
```
经过 `trans`，得到类似：
```lean
Type Expr： (A : Type ?u₁) → Type ?u₂
Value Expr： fun (A : Type ?u₁) => A
```
随后，Lean Type Checking 和 Unification 会发现：为了让 Body 的类型与声明的 Type 一致，要满足 $?u_1=?u_2$, 于是 Lean 会尝试统一两个 Metavariables。但必须注意：
- 如果 Rocq 原始 Constraints 已经要求 `u = v`，那么统一两个 Levels 可能是合法的。
- 如果 Rocq 只要求 `u ≤ v`，虽然 `u = v` 满足这个约束，但源声明还允许 `u < v`。直接统一可能缩小原声明允许的 Universe 范围。
- 如果 Rocq 明确要求 `u < v`，那么 `u = v` 甚至不满足原始 Constraints。
- 如果想保留 Rocq 中 `u ≤ v` 的一般性，那么在 Lean 中保留两个 Universe Parameters，会比直接将 `u` 和 `v` 统一成一个 Level 更合理。但是有一个关键问题：Universe Parameters 只能让 u、v 在不同实例化中取不同的值，并不能让 Lean 自动支持 u ≤ v 所对应的 Cumulativity。
- 解决方案：Universe Parameters + `max`
Universe Metavariables 只为 Lean 提供灵活的求解空间，并不能单独解决 Rocq 与 Lean 的 Cumulativity 差异。对于无法通过直接 Unification 忠实表达的情况，翻译器还需要使用受检查的显式类型提升（如 `ULift` / `PULift`）。
##### 2.2 创建待求解的变量
```
for m in own do  # 遍历当前 Constant 所涉及的每个源 Universe Level
  let v ← mkFreshLevelMVar  # 在 Lean 中创建一个新的 Universe Metavariable 
  gl := gl.insert m v  # 建立映射：源 Universe Level `m` → Lean Metavariable `v`
  ownMVars := ownMVars.push (m, v)  # 把这对映射保存到数组中，供后续求解使用
```
- 对于当前 Constant 涉及的每一个 Own Global Rocq Universe Level，创建一个对应的 Lean Universe Metavariable（待求解变量），并记录它们之间的映射关系。
- 对于显式 Universe-Polymorphic 声明中的 Universe Variables，则按照 R6 单独处理，保留它们的显式参数身份。
- “显式”是指：这个 Universe Level 被声明为当前 Polymorphic Constant 自己的 Universe Parameter，而不是一个固定的 Global Universe Level。(显式不代表要在代码中手动写出 `@{u}`)
假设一个 Constant 涉及三个源 Universe Levels：`own = [u, v, w]`，翻译器会为每个 Level 创建一个 Lean Universe Metavariable，并记录映射关系：

| Rocq Universe | Lean Metavariable |
| ------------- | ----------------- |
| `u`           | `?u₁`             |
| `v`           | `?u₂`             |
| `w`           | `?u₃`             |
```text
gl = {u → ?u₁, v → ?u₂, w → ?u₃}
ownMVars = [(u, ?u₁), (v, ?u₂), (w, ?u₃)]
```
接下来，Type AST 和 Body AST 都使用同一个 `gl` 进行翻译，因此相同的源 Universe Level 会对应同一个 Lean Metavariable。例如：
```text
Type AST: Type@{u} ──trans(gl)──→ Type ?u₁
Body AST: Type@{u} ──trans(gl)──→ Type ?u₁
```
- 两处使用的是同一个 `?u₁`，不是分别创建两个变量。这样就保证了源声明中共享的 Universe Level，在翻译后仍然保持一致。
创建完 Metavariables 后, 翻译器会调用：`runTrans ... gl ...` 分别翻译 Type 和 Body，然后利用 Lean 的类型检查与 Universe Unification 求解这些变量。
某些变量可能被统一，某些可能被求解为 max 表达式，**而仍然自由且需要保留的 Type Levels 可以进一步转换为 Lean Universe Parameters。**
- Global Universe Level（Monomorphic）：属于全局 Universe Context，不会因为每次调用时传入不同的类型，就自动重新实例化。[[Global Universe Levels 2 Lean Universe Parameters]]
- Universe Parameter（Polymorphic）：每次引用这个 Declaration 时，都可以独立实例化。Rocq 通常会根据传入参数的类型和上下文约束，自动推断合适的 Universe Level。
##### 2.3 区分 Type Levels 和 Body-only Levels
翻译器还会区分两类源 Universe Levels。
- Type Levels 是出现在 Constant 公开类型中的 Levels。它们可能影响这个 Constant 可以接受什么类型的参数。例如：`def id.{u} (A : Type u) (x : A) : A := x`.  这里 `u` 出现在公开类型中。如果随意固定为 `0`，就会使 `id` 只能接受相应层级的类型，而不再具有原来需要的通用性。
- Body-only Levels 则只出现在实现内部，而没有直接出现在公开类型中。这些 Levels 在满足源约束和一般性要求时，可以被内部求解或设定合法默认值，不一定需要暴露给函数使用者。

Step 2 之后，我们有了从 Rocq Universe Levels 到 Lean 临时 Level 表达式的映射，接下来 `trans` 可以使用这些变量构造 Lean Expressions。
### Step 3. `trans`：将 Rocq AST 递归转换为 Lean Expressions
我们已经获得了 Constant 的 Type AST 和 Body AST，并为需要求解的 Universe Levels 创建了 Metavariables。现在开始真正的表达式翻译。
`trans` 的主要任务是：
- 遍历 Rocq AST，根据每种 Term 的语义，构建对应的 Lean Expression，最终得到能够交给 Lean 类型检查器处理的 Type Expr 和 Value Expr。
Exporter 导出的 AST 已经是 Rocq Kernel 理解并处理好的结构，因此 `trans` 只需逐个转换 AST 节点，而不需要重新解析 Rocq 源代码。
##### 3.1 `trans` 如何处理不同类型的 AST 节点？
在 [Translate.lean](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean?utm_source=chatgpt.com#L2124) 中，`trans` 本质上是一个递归的 Pattern Matching 函数：
```
partial def trans (t : IR.Term) : TransM Expr := do
  match t with
  | .rel i        => ...
  | .sort s       => ...
  | .prod n ty b  => ...
  | .lam n ty b   => ...
  | .letIn ...    => ...
  | .app f args   => ...
  | .const ...    => ...
  | .ind ...      => ...
  | .construct ... => ...
  | .case ...     => ...
  | .fix ...      => ...
```
不同的 AST 节点对应不同的转换方法。

|Rocq AST 节点|含义|Lean 中的表示或处理|
|---|---|---|
|`sort`|`Prop`、`Type@{u}` 等 Sort|`Expr.sort`|
|`rel`|局部绑定变量|查找当前局部上下文中的变量|
|`prod`|`forall`、函数类型|`Expr.forallE`|
|`lam`|函数抽象 `fun`|`Expr.lam`|
|`app`|函数应用 `f x`|`Expr.app`|
|`const`|全局 Constant 引用|`Expr.const`|
|`letIn`|局部定义|通过局部绑定构建表达式|
|`ind` / `construct`|Inductive 和 Constructor 引用|查找已翻译的目标声明|
|`case`|Pattern Matching|使用专门的 `transCase` 转换|
|`fix`|递归定义|使用专门的 `transFix` 转换|

这里可以区分两种情况。
第一类：可以直接建立对应的基础节点。
```
Rocq AST: prod ⇒ Lean Expr: forallE
Rocq AST: lam ⇒ Lean Expr: lam
Rocq AST: app ⇒ Lean Expr: app
```
这些结构在两个类型系统中具有非常接近的对应形式。

第二类：需要额外转换的节点。
- `const`：必须找到这个 Rocq Constant 在 Lean 中对应的声明。
- `case`：Rocq 的 Pattern Matching 不一定能够直接替换成 Lean 的 Match，需要构造相应的消去表达式。
- `fix`：需要处理递归定义，有时转换成基于 Lean Recursor 或良基递归的表达式。
这些地方就是 M、R 等特殊翻译规则可能参与的地方。`trans` 不仅是一个 AST 节点重命名函数，它还负责处理两个系统之间不能直接对应的计算结构。
##### 3.2 例子：翻译 `id` 的 Type AST
```
Definition id (A : Type) (x : A) : A := x.
```
假设其 Universe Level 为 `u`，并且 Step 2 已经创建： `u ↦ ?u`
首先看 Type：
```
forall (A : Type@{u}), A -> A
```
它的 AST 可以简化表示为：
```
Prod A (Sort Type@{u})
  └── Prod x (Rel 0)
        └── Rel 1
```
这里的 `Prod` 表示函数类型，`Rel` 是使用 De Bruijn Index 表示的局部变量引用。
- `Prod A`：引入类型参数 `A`。
- `Prod x`：引入值参数 `x`，其类型为 `A`。
- 最后的 `Rel 1`：引用外层绑定的 `A`，表示返回类型为 `A`。
`trans` 递归处理这些节点：
- 首先，处理 `Sort Type@{u}`。调用 `transSort`，从 Step 2 的映射中获取 `u ↦ ?u`于是得到 Lean 中相应的：`Type ?u`
- 其次，处理 `Prod A`。`trans` 在 Lean 的局部上下文中引入变量 `A`，然后递归翻译其内部表达式。
- 接着，处理 `Prod x`。这时 `A` 已经处于当前局部上下文中，所以 `trans` 能够解析 `x` 的类型 `A`。
- 最后将这些局部变量重新抽象成 Lean 的 Binder，构建 `forallE`。
最终生成的 Type Expr 可以表示为：
```
(A : Type ?u) → A → A
```
这里最重要的是：`trans` 已经把 Rocq 中表示依赖函数类型的 AST 结构，完整转换成了 Lean 中对应的表达式结构。
##### 3.3 翻译 `id` 的 Body AST
接下来处理 Body：
```
fun (A : Type) (x : A) => x
```
它的 AST 可以表示为：
```
Lambda A (Sort Type@{u})
  └── Lambda x (Rel 0)
        └── Rel 0
```
这里与 Type AST 不同，`Lambda` 表示函数本身，而不只是函数的类型。
`trans` 会：
1. 翻译 `A` 的类型 `Type@{u}`。
2. 创建局部变量 `A`。
3. 翻译 `x` 的类型，并创建局部变量 `x`。
4. 将 Body 最后的 `Rel 0` 解析为局部变量 `x`。
5. 将局部变量抽象成 Lean 的 Lambda 表达式。
最终得到：`fun (A : Type ?u) (x : A) => x`
这样，Type AST 和 Body AST 就都完成了转换。
```
Lean Type Expr: (A : Type ?u) → A → A
Lean Value Expr: fun (A : Type ?u) (x : A) => x
```
需要注意，这两个 Expr 中使用的是同一个源 Universe Level `u` 对应的临时映射，因此它们可以保持一致的 Universe 引用。
##### 3.4 如果 AST 中引用了其他 Constant，`trans` 怎么处理？
```
Definition use_id (A : Type) (x : A) :=
  id A x.
```
这个 Body 不再只是返回局部变量，而是包含对全局 Constant `id` 的引用。
Body AST 结构可以表示为：
```
Lambda A
  └── Lambda x
        └── App
             ├── Const id
             ├── Rel A
             └── Rel x
```
这里 `trans` 需要完成两件额外的工作。
第一，查找 `id` 对应的 Lean Constant。
由于 `id` 已经提前翻译并注册到了 Lean Environment，翻译器通过全局映射 `GEnv` 找到对应的 `Rocq.id`
- 如果目标声明拥有 Universe Parameters，那么 `transHead` 还需要为这次引用提供相应的 Universe Instance。这可能使用当前声明已有的 Level Metavariables，也可能创建新的 Metavariables。例如：`Rocq.id.{?k}`
- 但这一步暂时只需要理解为：`trans` 构建一个引用已翻译 Constant 的 Lean Expr，并为它填入相应的 Universe 参数位置。具体如何求解 `?k`，主要放到 Step 4 讲。
第二，构建 Function Application。
`trans` 将函数参数 `A`、`x` 分别转换成 Lean Expr，然后使用 `mkAppN` 组合：
```
Rocq.id.{?k} A x
```
再加上外层的两个 Lambda，得到：
```
fun (A : Type ?v) (x : A) =>
  Rocq.id.{?k} A x
```
到这里，`trans` 已经完成了函数结构、变量引用和全局 Constant 引用的翻译。
##### 3.5 Step 3 的最终结果
现在我们已经获得：
```
ty  : Expr # (A : Type ?u) → A → A
val : Expr # fun (A : Type ?u) (x : A) => x
```
到此为止，我们完成的是：将 Rocq Constant 的 Type 和 Body 递归转换为 Lean Expressions，包括所有参数、局部变量、函数应用、Constant 引用以及必要的特殊结构转换。
- 不过，这两个 Expression 仍然可能包含尚未解决的 Universe Metavariables。所以接下来 Step 4 会讲如何处理 Universe Metavariables。
### Step 4. `solveLevels`：求解 Universe，并决定哪些要保留为参数
在这一步里面，翻译器调用 `solveLevels ty val dflt rebindThenKeep ...` 
来求解Universe Level

| 处理方式           | 含义                                      | 例子                  |
| -------------- | --------------------------------------- | ------------------- |
| Solving        | 确定某个 Level 必须等于什么                       | `?w := max(?u, ?v)` |
| Generalization | 不需要固定某个 Level，将它变成公开 Universe Parameter | `?u → u`            |
| Defaulting     | 对仍未确定、且允许固定的 Level 选择一个合法值              | `?m := u + 1`       |

- Interpretation：必要时借助 Rocq Universe Facts 构造 `max` 等表达式。
对应代码：[Translate.lean — solveLevels](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean?utm_source=chatgpt.com#L3962)
##### 4.1 通过 Type Checking 与 Unification 求解 Universe Levels （Solving）
假设我们已经翻译了 `id`，现在需要翻译另一个引用它的 Constant：
```coq
Definition use_id (A : Type) (x : A) := id A x.
```
**Step 1. 获取已翻译 Constant 的 Type**
由于 `id` 是 `use_id` 的 Dependency，翻译器已经提前完成了 `id` 的翻译，并将其 Type 和 Universe Parameters 注册到了 Lean Environment 中。调用 `Rocq.id A x` 时：
```lean
Rocq.id.{k} (A : Type k) (x : A) : A
```
这里的 `k` 是定义时的 Universe Parameter。引用 `Rocq.id` 时，Lean 会根据本次提供的 Universe Instance 替换 `k`，从而得到当前调用所要求的参数类型。Lean 必须知道 `Rocq.id` 的 Type，才能检查 `id A x` 是否合法，并推导 Universe Constraints。
> 这里假设已经翻译好的 `Rocq.id` 在 Lean 中具有 Universe Polymorphic 接口，即 `Rocq.id.{k}`。因此，每次引用 `Rocq.id` 时，翻译器可以创建新的 Universe Metavariable `?k`，并通过 Type Checking 与 Unification 确定本次调用的 Universe Instance。需要注意，这并不意味着源 Rocq 声明一定是 Polymorphic，因为翻译器也可能将源 Global Universe Levels 转换为 Lean Universe Parameters。

**Step 2. 创建临时 Universe Metavariables**
假设当前声明中的 `A` 对应源 Universe Level `v`。翻译器首先将其映射为 Lean Metavariable `?v`。
同时，假设引用 `Rocq.id` 时，为它的 Universe Instance 创建了一个新的 Metavariable `?k`。
于是翻译后的表达式可以暂时表示为：
```lean
fun (A : Type ?v) (x : A) =>
  Rocq.id.{?k} A x
```
- `?v`：当前 Constant 的源 Universe Level `v` 对应的 Metavariable。
- `?k`：本次引用 `Rocq.id` 时，用于确定 Universe Instance 的临时 Metavariable。

**Step 3. Type Checking 与 Universe Unification**
Lean 在检查 Function Application 时，需要确保实际传入参数的类型与函数期望的参数类型在定义上相等。对于 `Rocq.id.{?k} A x`：
```text
Rocq.id 期望：A : Type ?k
实际传入：    A : Type ?v
```
由于 Lean 不支持 Rocq 那样的隐式 Universe Cumulativity，在这个例子中，需要满足：
$$
\mathrm{Type}\;?k \equiv \mathrm{Type}\;?v
$$
因此，Lean 可以通过 Universe Unification 求解：
$$
\boxed{?k := ?v}
$$
这是因为 `?k` 和 `?v` 都是尚未固定的 Metavariables，可以在类型检查过程中被统一。

**Step 4. 得到求解后的表达式**
完成 Unification 后，表达式变为：
```lean
fun (A : Type ?v) (x : A) =>
  Rocq.id.{?v} A x
```
此时，`Rocq.id` 的 Universe Instance 已经与实际参数 `A` 的 Universe Level 匹配。此时，`?k` 已经通过 Unification 得到求解，但 `?v` 仍然自由，需要在后续 Generalization 阶段决定是否将其保留为 Universe Parameter。[[在 Universe 里面的 Parameter 和 Instance]]
###### Step 5. 多个 Universe Levels
假设存在多个 Universe Levels，类型检查后可能得到：
```
?u = ?v
?w = max(?u, ?k)
?m = 尚未确定
```

| 情况                 | Lean 已经知道什么？           | 后续处理                           |
| ------------------ | ---------------------- | ------------------------------ |
| `?u = ?v`          | 两个 Levels 必须相等         | 可以将两个变量统一                      |
| `?w = max(?u, ?k)` | `?w` 必须由另外两个 Levels 决定 | 保留表达式，继续求解其依赖                  |
| `?m` 未确定           | 没有足够的类型要求确定它           | 考虑 Generalization 或 Defaulting |

假设 Universe Metavariables `?u` 和 `?k` 最终被 Generalize 成 Universe Parameters `u` 和 `k`，那么另一个 Metavariable `?w` 的求解结果可以是：
$$
?w=\max(u,k)
$$
这完全可以成为最终的 Universe Expression，表示 `w` 的 Level 由 `u` 和 `k` 中较高的那个决定，而不需要将 `w` 固定成某个具体数值。
##### 4.2 把公开的 Type Level 变成 Universe Parameters (Generalization)
对于 `id` 的 Type Expression：`(A : Type ?u) → A → A`
`?u` 没有被限制成某个具体数值。因为我们希望 `id` 适用于不同 Universe Levels，所以应该将 `?u` 泛化为一个公开的 Universe Parameter `u`. 于是得到：
```
def Rocq.id.{u} (A : Type u) (x : A) : A := x
```
这里的 `u` 不再是待求解变量，而是最终声明的参数。
[[Type Level 变成 Universe Parameter]]
##### 4.3 Body-only Levels 可以选择默认值 (Defaulting)
现在我们已经处理了公开 Type 中的 Levels。但假设 Body 中还出现了一个 Universe Level `m`：
- 源 Type 使用：u
- 源 Body 使用：u, m
- 翻译器创建：`u → ?u, m → ?m`
经过 Type Checking：
```
?u：还自由，需要公开
?m：还自由，只用于 Body
```
这里的关键问题是：`?u` 出现在公开 Type 中，需要保留为 Universe Parameter；但 `?m` 只影响内部 Body，并不一定需要成为公开 Parameter。因此，翻译器通过 `minimalModelLevel`，根据 Rocq 原始的 Universe Facts，为 `?m` 寻找最小的合法 Universe Expression。

| Rocq 对 `m` 的约束 | 最小合法解释（仅考虑这些下界） |
|---|---|
| 没有额外下界 | `0` |
| `u ≤ m` | `u` |
| `u < m` | `u + 1` |
| `u ≤ m` 且 `v ≤ m` | `max(u,v)` |

例如，如果 Rocq 要求 $u<m$，而 `?u` 已经被 Generalize 为 Universe Parameter `u`，那么选择：
$$
\boxed{?m:=u+1}
$$
这样既满足源 Universe Constraint，又不需要引入一个独立的公开 Parameter `m`。但这个选择还必须满足其他 Source Universe Facts 和 Lean Type Checking Requirements，不能只考虑下界。
- 对于仍然无法确定的 Residual Metavariables，`solveLevels` 还会通过 `justifyResiduals` 暂时将它们替换成新的 Universe Parameters，并让 Lean Kernel 检查更一般的声明版本，以验证相关默认赋值是否安全。
Generalization 保留公开 Type 的通用性；Body-only Defaulting 则尽量为内部使用的 Levels 选择合法且简单的表达式。

还有一种情况：Residual Universe Metavariables  [[Residual Universe Metavariables]]
##### 4.4 Step 4 的最终结果
假设翻译器最初有五个 Universe Metavariables，并且经过类型检查后得到以下关系：

|初始变量|求解状态|最终处理|
|---|---|---|
|`?u`|自由，出现在 Type 中|Generalize 为 `u`|
|`?v`|自由，出现在 Type 中|Generalize 为 `v`|
|`?w`|已求解：`max(?u,?v)`|`max(u,v)`|
|`?m`|自由，Body-only，源要求 `u < m`|Default 为 `u+1`，并检查源约束|
|`?r`|额外产生的 Residual|经验证后 Default，假设为 `0`|

那么最终 Universe 映射可以示意为：
```
Source / Temporary      Final Lean
---------------------------------------
?u                  →   u
?v                  →   v
?w                  →   max(u, v)
?m                  →   u + 1
?r                  →   0
```
- 最终声明只需要包含 `u` 和 `v` 这两个公开 Universe Parameters。其他 Levels 已经能够通过 `u`、`v` 或合法的默认值表示。
- 当然，如果 `u`、`v` 之间存在额外的源约束，或者目标表达式的某些 Universe 表达式无法通过 Lean Kernel 检查，那么以上候选映射也可能被拒绝。
最终我们得到了：
- 不再包含未处理 Universe Metavariables 的 Lean Type Expr。
- 相应的 Lean Value Expr。
- 一组公开的 Universe Parameters。
### Step 5. Universe 与 Interface Checking
即使 Expressions 符合 Lean 的类型要求，翻译是否符合 Rocq 原始声明的 Universe 约束及一般性？
- 一般性（Generality），指的是：翻译后的 Lean Declaration 是否仍然保留 Rocq 原始声明所允许的 Universe 使用范围，而没有被不必要地限制到某些特定的 Universe Levels。
##### 5.1 检查同一个 Declaration 里面的 Universe 约束
情况 A：`u` 出现在当前声明的 Type AST 中，而 `m` 只出现在 Body AST 中。
情况 B：`u` 和 `v` 都出现在当前声明的 Type AST 中，两者都需要保留在最终的 Universe 接口中。

|            | 情况 A                        | 情况 B                         |
| ---------- | --------------------------- | ---------------------------- |
| Level 所在位置 | `u` 在 Type，`m` 仅在 Body      | `u`、`v` 都在 Type              |
| 处理方式       | 求解或 Default Body-only Level | 构造公开 Levels 的 Interpretation |
| 对应机制       | `checkBodyLevel`            | `ownLevelInterp`             |
###### 情况 A：Body-only Level（`checkBodyLevel`）
```coq
Universe u m.
Constraint u < m.

Definition example (A : Type@{u}) (x : A) : A :=
  let T := Type@{m} in x.
```
这里 Type AST 为 `∀ A : Type@{u}, A → A`，只涉及 Universe Level `u`，而 Body AST 额外使用了 `m`。假设翻译器将 `u` Generalize 为公开参数 `a`，由于 `m` 只出现在 Body 中，可以选择：
$$
u\mapsto a,\qquad m\mapsto a+1
$$
`checkBodyLevel` 会验证 $a<a+1$，满足源约束。如果选择 `m → a`，则会得到 $a<a$，违反原始约束，必须拒绝。
###### 情况 B：两个公开 Type Levels（`ownLevelInterp`）
```coq
Universe u v.
Constraint u <= v.

Definition first
    (A : Type@{u}) (B : Type@{v})
    (x : A) (y : B) : A := x.
```
这里 Type AST 为 `∀ A : Type@{u}, ∀ B : Type@{v}, A → B → A`，因此 `u` 和 `v` 都出现在公开 Type 中。如果直接映射为 $u\mapsto a,\ v\mapsto b$，Lean 虽然可以接受，但无法保证 $a\leq b$。因此，在 R2F Interpretation 路径中，`ownLevelInterp` 可以构造：
$$
u\mapsto a,\qquad v\mapsto\max(a,b)
$$
由于 $a\leq\max(a,b)$ 恒成立，这种方式既保留了符号化的 Universe Parameters，又满足 Rocq 原始的 Universe Constraint。
##### 5.2 检查对其他 Constant 的引用（R3）
当一个 Constant 引用其他已翻译的 Constant 时，翻译器需要检查本次使用的 Universe Instance 是否符合 Rocq 原始的 Universe 关系。例如：
```coq
Universe u l.
Constraint u <= l.

Definition id (A : Type@{l}) (x : A) : A := x.

Definition use_id (A : Type@{u}) (x : A) : A :=
  id A x.
```
- 这里 `id` 使用源 Universe Level `l`，而 `use_id` 的参数 `A` 属于 `Type@{u}`。Rocq 允许这个调用，因为 $u\leq l$。
假设翻译后 `u` 对应 Lean Universe Parameter `a`，调用变成`Rocq.id.{a} A x`。
虽然这个表达式可以通过 Lean Type Checking，但 R3 还需要检查 `a` **对应的源 Level** `u` 是否可以用于原本要求 Level `l` 的引用。
- **满足约束**：如果源 Universe Facts 能证明 `u ≤ l`，那么这个较低 Level 的实例化可以通过相应的 R3 检查。
- **不满足约束**：如果无法从 Source Universe Facts 证明 `u ≤ l`，即使 Lean 接受 `Rocq.id.{a} A x`，翻译器也不能接受这个 Universe Instance。
在代码中，`checkUniverseObligations` 会遍历 Type Expr 和 Body Expr 中的 Constant References，并调用 `checkInstantiation` 检查 Universe Instance 的合法性，以及共享 Global Universe Levels 的一致性（Coherence）。
##### 5.3 检查有没有改变声明的一般性
###### 情况 A：原本自由的 Universe Level 被固定
例如，在 Rocq 中：
```
Polymorphic Definition my_id
    (A : Type) (x : A) : A := x.
```
我们期望翻译为：
```
def Rocq.my_id.{u} (A : Type u) (x : A) : A := x
```
但如果翻译器得到：
```
def Rocq.my_id (A : Type 0) (x : A) : A := x
```
虽然 Lean Kernel 接受，但原本可以用于不同 Universe Levels 的函数，现在只能直接接受 `A : Type 0`，因此缩小了原声明的适用范围。
###### 情况 B：原本独立的 Universe Levels 被错误合并
假设 Rocq 中有两个独立的 Universe Levels：
```
Polymorphic Universe u v.

Polymorphic Definition first
    (A : Type@{u}) (B : Type@{v})
    (x : A) : A := x.
```
源声明没有要求 `u = v`，因此允许两个 Levels 不同。
但如果翻译器强行将它们合并：
```
def Rocq.first.{w}
    (A : Type w) (B : Type w)
    (x : A) : A := x
```
虽然 Lean Kernel 接受，但现在 `A` 和 `B` 必须属于相同的 Universe Level，原本允许 `u ≠ v` 的情况无法直接表达，因而也缩小了一般性。
###### 如何检查？
在 `Emit.lean` 中，主要有以下机制：

|检查机制|作用|
|---|---|
|`freeLevelPin`|检查原本自由的 Universe Level 有没有被固定，从而缩小量化范围|
|`binderIndependence`|检查 Theorem Statements 中原本独立的 Binder Levels 有没有被错误合并或引入额外的大小关系|
|P0 / Protected Public Interface|防止受保护的公开声明因 Universe Specialization 而改变接口的一般性|

对于 Theorem，如果源声明中 `u` 和 `v` 原本独立，但翻译后强制 `u = v`, 那么 `binderIndependence` 可以发现目标声明引入了源 Universe Facts 没有要求的关系，从而拒绝这种缩小量化范围的翻译。
##### 5.4 如果检查失败怎么办？
如果 Lean Type Checking、Universe Constraints 或 Interface Checks 失败，翻译器不会立即放弃，而是根据失败类型，尝试其他受约束的翻译策略。
在 `Emit.lean` 中，外层实现了一套有顺序的 Retry Mechanism，主要包括：

|重试策略|解决什么问题|
|---|---|
|**R2⁺：Fact Reduction**|利用 Rocq Universe Facts 简化 Universe Expressions，使原本无法统一的 Levels 更容易求解|
|**R2F：Universe Interpretation**|根据源约束重新构造 Universe 表达式，例如利用 `max` 保留 `u ≤ v`|
|**R3↓：Universe Lowering**|在源约束允许时，为 Constant Reference 选择较低的 Universe Instance，处理 Cumulativity 差异|
|**Explicit Lifting**|在适当情况下使用 `ULift`、`PULift` 等显式转换，解决 Lean 无法直接表达的 Universe 或 Prop/Type 差异|
|**Specialized Lowering**|对部分特殊结构进行展开、计算或专门转换，再重新尝试翻译|

例如，假设 Rocq 允许 `u ≤ v`，但 Lean 直接翻译时要求 `u = v`。普通 Unification 可能无法得到同时满足类型要求和源约束的解。翻译器可以尝试 R2F Interpretation、R3↓ Lowering 或其他适用的转换规则，而不是直接放弃该声明。
每次重试都必须重新通过 Lean Kernel Checking、Universe Constraints 和 Interface Checks。
### Step 6. 生成最终 Lean Constant Declaration
前面所有步骤完成以后，翻译器已经拥有：

|字段|含义|
|---|---|
|`name`|最终 Lean Constant 的名字|
|`levelParams`|最终公开的 Universe Parameters|
|`type`|翻译并求解后的 Type Expr|
|`value`|翻译并求解后的 Body Expr|

##### 6.1 选择 Constant Declaration 类型
不同的源 Constant 在 Lean 中对应不同的声明种类。项目中的 `mkConstDecl` 会根据已经确定的 `kind` 构造声明：

|Lean Declaration|对应情况|
|---|---|
|`defnDecl`|需要保留为透明定义的 Constant|
|`thmDecl`|具有证明正文、类型是命题的相应 Constant|
|`opaqueDecl`|具有实现但需要保持不透明的 Constant|

##### 6.2 提交给 Lean Kernel
假设 `id` 最终得到：
```
def Rocq.id.{u}
    (A : Type u) (x : A) : A := x
```
翻译器会构建类似：
```
Declaration.defnDecl {
  name := `Rocq.id
  levelParams := [`u]
  type := ...
  value := ...
  ...
}
```
再通过 `addChecked` 提交给 Lean Kernel。Kernel 会检查这个声明的类型、正文、Universe Parameters 等是否构成合法的 Lean Declaration。如果 Kernel 接受，就可以将其加入 Lean 环境。
对于项目中的普通成功声明，结果状态为：
```
TRANSLATED_AND_CHECKED
```
随后还会进行独立的 Audit / Validation，以审查目标声明与源信息之间的对应关系。
##### 6.3 特别情况：Statement-only Theorem
这里还需要把 statement-only 模式单独说明。
假设 Rocq 中有：
```
Theorem identity :
  forall (A : Type) (x : A), x = x.
Proof.
  intros.
  reflexivity.
Qed.
```
在 statement-only 模式中，项目先生成一个代表 theorem statement 的 Lean Definition：
```
def Rocq.identity.statement : Prop :=
  ∀ (A : Type u) (x : A), x = x
```
- 类似地，如果一个定义依赖尚未完成的证明，项目会为它生成 `RocqPending.*` 形式的带前提验证产物。说明在给出这些证明前提时，当前表达式可以通过内核检查；不等于最终已接受的完整声明。


