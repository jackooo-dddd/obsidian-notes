### Lambda → Expr.lam
**一句话：** Rocq 的 `Lambda` 和 Lean 的 `Expr.lam` 表示同一个东西：一个**函数**，即"给我一个 x : T，我就还你 b"，数学上写作 λ x : T, b。它是 Π 类型的**引入方式**：Π 说明某个函数类型存在，λ 真正把属于这个类型的函数造出来。两边的类型规则相同，结构也一样，所以翻译时逐字段对应。
#### λ x : T, b 是什么
- x：参数名；
- T：参数的类型。两边内核都**要求写明**，不能省；
- b：body，即函数返回的东西，通常会用到 x。

类型规则：

在 x : T 的前提下，b : B
───────────────────────────
λ x : T, b  :  Π x : T, B

也就是说，λ 的类型就是一个 Π。λ 的 b 是**值**，Π 的 B 是 b 的**类型**。

要分清两件事：
- λ 和 Π 长得几乎一样，都是"变量名、类型、body"三个字段，含义却不同：
    - Π（`Prod` / `forallE`）的 body 是一个**类型**，整个 Π 是"一类函数"；
    - λ（`Lambda` / `lam`）的 body 是一个**值**，整个 λ 是"一个具体的函数"。
- λ 和 App 是一对：λ 造函数，App 用函数。两者相遇时可以 β 归约：`(λ x : T, b) a` 化简为 `b[x := a]`。
#### 一种节点，几种读法

|写法|读作|x|T|b|它的类型（一个 Π）|
|---|---|---|---|---|---|
|`fun n : nat => S n`|普通函数：加一|`n`|`nat`|`S n`|`nat → nat`|
|`fun h : P => h`|蕴含的证明：由 P 推出 P|`h`|`P`|`h`|`P → P`|
|`fun n : nat => eq_refl n`|全称命题的证明：对所有 n，`n = n`|`n`|`nat`|`eq_refl n`|`∀ n : nat, n = n`|
|`fun (A : Type) (x : A) => x`|多态函数：恒等函数|先 `A`，再 `x`|`Type`，然后 `A`|`x`|`∀ A : Type, A → A`|
|`fun A : Type => list A`|类型族：输入类型，输出类型|`A`|`Type`|`list A`|`Type → Type`|

第四行和 Prod note 的第三行一一对应：类型有两层 Π，值就有两层 λ。

> [!tip] "证明"为什么也是 λ
> 依然是 Curry–Howard 对应。要证"对所有 n，P(n)"，就要给出一个函数，接收任意 n，返回 P(n) 的证明。这个函数用 λ 写出来。所以第二、三行的证明和第一行的普通函数是同一种节点。

#### 翻译：逐字段对应
Rocq:  Lambda(x, T, b)
Lean:  Expr.lam x T b binderInfo

x 照抄，T 和 b 分别递归翻译。以 `fun n : nat => S n` 为例：

|Rocq `Lambda` 的字段|Lean `Expr.lam` 的字段|例子|
|---|---|---|
|参数名 x|参数名|`n`|
|参数类型 T|参数类型|`nat` 翻译成 `Rocq.Corelib.Init.Datatypes.nat`|
|主体 b|主体（body）|`S n`，其中 n 在 IR 里是 `rel 0`，在 Lean 里是 `bvar 0`|
|relevance（R / I）|—|不进入 Lean 项，只用来做检查（见下文）|
|—|binderInfo|翻译器一律用 `.default`（显式参数）|

IR:    lam({n, R}, ind nat, app(construct nat 1, [rel 0]))
Lean:  lam n (const Rocq.Corelib.Init.Datatypes.nat)
           (app (const Rocq.Corelib.Init.Datatypes.nat.S) (bvar 0))
#### 翻译器里实际走的步骤
代码在 `Translate.lean` 中 `trans` 的 `.lam` 分支，和 `.prod` 分支几乎一字不差：

|步骤|做什么|为什么|
|---|---|---|
|1. 翻译 T|`trans ty`，再 `transportTypePosition`|T 处在类型位置，如果被 `PULift` 包着，要先拆开|
|2. `checkRelevant`|源 binder 标为 irrelevant（SProp）时，T 在 Lean 里必须是 Prop|Lean 没有 SProp，只能保证"不相关的参数确实是证明"|
|3. `withLocalDecl`|新建一个 Lean 自由变量 x : T′|打开 binder，后面可以调用 Lean 的类型推断|
|4. `withSourceLocal`|把 x 压进 `locals` 栈，同时记下这个 binder 的**源端**类型|这样 body 里的 `rel 0` 就能找到 x；源端信息供后面的源侧分析使用|
|5. 翻译 b|`trans b`|body 在扩展后的上下文里翻译|
|6. `bindFVars true #[x]`|把 x 抽象回 `bvar 0`，外面包一层 `.lam`|闭合 binder|

> [!note] 和 Prod 唯一的差别
> Prod 的 body 翻完后还要再调一次 `transportTypePosition`，因为 Prod 的 body 是类型。λ 的 body 是值，所以不调。


> [!warning] 为什么用 `bindFVars`，不用 Lean 自带的 `mkLambdaFVars`
> 两者都能把自由变量抽象回 binder。区别是 `mkLambdaFVars` 会顺手实例化元变量，并对包含 universe 元变量的 binder 类型做 β 归约，从而改变翻译结果的形状。`bindFVars`（`Translate.lean:769`）只做纯粹的 de Bruijn 抽象，不改写 binder 类型。这和 App note 里"不做 β 归约"是同一个原则：**翻译结果的形状要和源项一致。**

#### 不需要特别处理的：η
`f` 和 `fun x => f x` 在 Rocq 和 Lean 里都定义相等（两边内核都有函数的 η 规则），所以翻译器不需要为 η 做任何事。
#### λ 在其他节点里扮演的角色
λ 节点本身翻译起来很简单，但其他节点经常要**读**它或**造**它：

|场景|λ 的作用|代码|
|---|---|---|
|**fix 的参数**|`fix` 的 body 开头的一串 λ 就是递归函数的参数。翻译器用 `peelLams` 把它们剥出来，要求递减参数（`rarg`）必须在这串 λ 里|`transFix1`，报错信息 `decreasing argument … is not bound by the leading lambdas`|
|**case → rec**|递归子的 motive 和每个分支（minor premise）都是翻译器**新造**的 λ：motive 是 `λ indices x, 返回类型`，分支是 `λ 字段… ih…, 分支体`|`transCase` 里的 `bindFVars true …`|
|**原生运算**|比较、布尔运算会被包成 `fun x y => Ordering.rec …` 或 `fun x y => Bool.rec …`，把 Lean 的结果转换成源端的构造子|`trans` 的 `prim` 分支|
|**IR 层 β 归约**|内联常量时，在 IR 上把 `(λ x, b) a` 化简为 `b[x := a]`|