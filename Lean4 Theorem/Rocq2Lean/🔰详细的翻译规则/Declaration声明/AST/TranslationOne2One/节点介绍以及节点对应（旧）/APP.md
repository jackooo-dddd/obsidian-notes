## App → Expr.app
**一句话：** Rocq 的 `App` 和 Lean 的 `Expr.app` 表示同一件事：把函数 f 用到参数 a 上，也就是「调用」。两边只差一点：Rocq 的 App 是多元的（一个头加一串参数），Lean 的是二元的（一次只接一个参数）。

App 是 Π 的使用方式：Π 说明「对每个 x : T 都有 B」，App 就是拿出一个具体的 a，得到 B 在 a 处的那一份。
### f a 是什么
- f：头，即被调用的东西。可以是常量、局部变量、构造子、归纳类型，也可以是 λ。
- a：参数，即填进去的具体值。

类型规则：
```text
f : Π x : T, B      a : T
─────────────────────────
     f a : B[x := a]
```
f 的类型必须是一个 Π，a 必须属于它的 T；结果的类型是把 B 里的 x 换成 a。所以 App 本身不是新类型，它只是把已有的东西拿来用，它的类型由 f 的 Π 决定。

> [!tip] Π、λ、App 是一组
> - Π（`Prod` / `forallE`）：构造函数类型；
> - λ（`Lambda` / `lam`）：构造函数本身（引入）；
> - App（`App` / `app`）：使用函数（消去）。
>
> λ 和 App 相遇时可以化简，这叫 β 归约：`(fun x => b) a` 化简为 `b[x := a]`。
### 一种节点，几种读法
同一个 `f a`，f 是什么东西，读法就不同：

| 写法 | 读作 | f | a | 结果 |
|---|---|---|---|---|
| `add n m` | 函数调用 | 常量 `add` | `n`、`m` | 一个 nat |
| `S n` | 构造数据 | 构造子 `S` | `n` | 一个新的 nat 值 |
| `list nat` | 类型构造器套用 | 归纳类型 `list` | `nat` | 一个类型 |
| `eq nat n n` | 构造命题 | 归纳类型 `eq` | `nat`、`n`、`n` | 一个命题（也是类型） |
| `plus_n_O 3` | 定理实例化 | 定理 `plus_n_O : ∀ n, n = n + 0` | `3` | `3 = 3 + 0` 的证明 |
| `id nat 3` | 多态实例化 | 多态函数 `id : ∀ A, A → A` | 先 `nat`，再 `3` | 一个 nat |

最后一行先把 A 填成 `nat`，得到 `nat → nat`，再填 `3`。这正对应 [[Prod]] 里的「两层 Π 嵌套」：一层 Π 用一次 App 消掉。

> [!tip] 为什么「调用函数」和「使用定理」是同一种节点
> 还是 Curry–Howard 对应。定理 `∀ n, P n` 的证明就是一个函数，所以「把定理用在 3 上」就是「把这个函数作用到 3 上」。Π 只有一种，消去它的 App 自然也只有一种。
### 翻译：多元拆成二元
```text
Rocq:  App(f, [a₁, a₂, …, aₙ])
Lean:  Expr.app (… (Expr.app (Expr.app f a₁) a₂) …) aₙ
```
f 和每个 aᵢ 分别递归翻译，再用 `mkAppN` 从左到右一层层套起来。以 `fun n m => add n m` 的函数体为例：

| Rocq `App` 的字段 | Lean `Expr.app` 的字段 | 例子 |
|---|---|---|
| 头 f | 最内层的 `fn` | `add` 翻译成 `Rocq.Corelib.Init.Nat.add` |
| 参数列表 [a₁, …, aₙ] | 每层一个 `arg`，共 n 层 | `[rel 1, rel 0]`（指 n 和 m）翻译成 `bvar 1`，再 `bvar 0` |
| — | 没有「参数个数」字段 | 由嵌套层数体现 |
```text
IR:    app(const add, [rel 1, rel 0])
Lean:  app(app(const Rocq.Corelib.Init.Nat.add, bvar 1), bvar 0)
```

> [!note] 翻译顺序：先参数，后头
> 翻译器先翻译所有参数，再翻译头（`Translate.lean` 中的 `.app` 分支）。原因是头需要看参数：有些归纳类型（template 多态）的 Universe Level 要从参数的类型里算出来，所以头的 Universe 参数得等参数翻译完才能确定。
### 和 Prod 不同：App 要额外处理的东西比较多
Prod 只是「描述一个类型」，App 才真正把两个东西接在一起，所以两边类型系统的差异都在这里暴露出来：

| 问题 | 原因 | 翻译器怎么做 |
|---|---|---|
| Universe Level 没定 | 头的 Universe 参数一开始是元变量 | 拼好 `f a₁ … aₙ` 后做一次类型检查，让 Lean 从参数类型解出 Level |
| 参数类型差一层 Prop 提升 | Rocq 允许 `Prop ≤ Type`（Cumulativity），Lean 没有：Rocq 里命题可以直接传给要 Type 的位置，Lean 里不行 | 规则 P：在需要的参数外面包 `PULift`，在需要的地方用 `PULift.down` 拆开（`coerceArgs` / `applyTypeCoercions`） |
| 递归调用 | 在 fix 体里，头是指向函数自己的 `rel` | 不当普通调用翻译，而是换成递归子里的归纳假设 `ih`；良基递归时用 `accCallSite` |
| phantom sort 参数 | 某些「检查用」定义的 sort 参数要按实际值的类型重新填 | 规则 Q-a 替换这些参数 |

