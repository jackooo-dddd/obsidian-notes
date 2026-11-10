## Structural Translation：逐节点递归翻译
**一句话：** 先把代码转换成 AST，再按预先定义好的规则，把 Rocq AST 的每个节点转换成 Lean AST 的对应节点。

之所以叫递归（Recursive），是因为一个 AST 节点里面往往还包含其他 AST 节点。翻译器不仅要转换外面这一层，还要不断翻译里面的所有子节点，直到整个表达式翻译完成。

最基本的三条规则： 

| Rocq AST 节点 | Lean AST 节点 | 表示什么 |
|---|---|---|
| `Lambda` | `Expr.lam` | 定义一个函数 |
| `App` | `Expr.app` | 调用一个函数 |
| `Prod` | `Expr.forallE` | 函数类型、全称量化等（见 [[Prod]]） |

> [!note] 这些是 AST 的结构名
> `Lambda`、`App`、`Prod` 不是 Rocq 源代码里的关键字，而是 Rocq 编译后，AST 内部使用的结构名称。
## 一个 Definition = 两棵 AST
一个 Rocq Definition 编译后，分成两棵分别表示的 AST，翻译器要分别递归翻译：

| | Type AST | Body AST |
|---|---|---|
| 描述什么 | 函数的类型（接口）：接收什么类型的参数、返回什么类型的结果 | 函数的实现：接收参数后怎么计算结果 |
| 主要节点 | `Prod` | `Lambda`、`App`（参数类型位置也会出现 `Prod`） |
| IR 中的字段 | `ConstantDecl.type` | `ConstantDecl.body` |
| 翻译成 Lean 后 | 类型表达式（Type） | 值表达式（Value） |

**为什么缺一不可**

- 只有 Type AST：系统只知道 `apply_twice` 应该是什么类型，不知道它具体怎么算。
- 只有 Body AST：有了实现，但还需要参数类型和整体返回类型，才能检查这个实现是否合法。

Rocq 会检查 Body 的实际类型是否符合声明的 Type。Rocq2Lean 则分别递归翻译两棵 AST，再交给 Lean 做类型检查。

**为什么 Body AST 里也会出现 `Prod`**

`Lambda` 不仅要描述怎么算，还必须说明它引入的参数是什么类型。参数本身是函数时，例如 `f : nat -> nat`，这个参数类型就要用 `Prod(_, nat, nat)` 表示。所以 Body 的最外层是 `Lambda`，`Lambda` 的参数类型位置仍然可以是 `Prod`。

> [!tip] `Prod` 和 `Lambda` 的分工
> - `Prod(变量名, 输入类型, 返回类型)`：构造类型。第三个字段是返回结果的类型，不是实际返回的值。
> - `Lambda(变量名, 参数类型, body)`：构造属于这个类型的东西，也就是具体的函数。
---
## 例子：`apply_twice`
```coq
(* 接收一个函数 f 和一个自然数 x，连续调用两次 f *)
Definition apply_twice (f : nat -> nat) (x : nat) :=
  f (f x).
```
两棵 AST 并排：

| | Type AST | Body AST |
|---|---|---|
| 读作 | `(nat -> nat) -> nat -> nat` | `fun f x => f (f x)` |
| AST | `Prod(f, Prod(_, nat, nat), Prod(x, nat, nat))` | `Lambda(f, Prod(_, nat, nat), Lambda(x, nat, App(f, [App(f, [x])])))` |
### Type AST：三个 `Prod`
`apply_twice` 的类型是 `(nat -> nat) -> nat -> nat`：先接收一个函数 `f : nat -> nat`，再接收一个自然数 `x : nat`，最后返回一个 `nat`。
```text
Prod(
  f,
  Prod(_, nat, nat),     -- ② f 自己的类型
  Prod(x, nat, nat)      -- ③ 接收 f 之后剩下的函数类型
)                        -- ① 整个 apply_twice 的类型
```

| Prod | 变量 | 输入类型 | 返回类型 | 含义 |
|---|---|---|---|---|
| ① 最外层 | `f` | `nat → nat`（即 ②） | `nat → nat`（即 ③） | 整个 `apply_twice` 的类型：接收 `f`，返回一个 `nat → nat` 的函数 |
| ② `f` 的类型 | `_`（匿名） | `nat` | `nat` | `f` 接收一个自然数、返回一个自然数，例如 `fun n : nat => n + 1` |
| ③ 第二个参数 | `x` | `nat` | `nat` | 接收 `x` 后，最终结果是自然数 |

注意：
- ② 不是 `apply_twice` 的第二个参数，而是第一个参数 `f` 的类型。
- ① 的输入类型和返回类型恰好都是 `nat → nat`，但含义不同：输入是 `f` 自己的类型；返回是接收 `f` 之后剩下的函数类型。

> [!note] 返回类型为什么仍是函数：Currying
> 函数类型是右结合的：`nat -> nat -> nat` 就是 `nat -> (nat -> nat)`。所以 `apply_twice` 的类型可以读成 `(nat -> nat) -> (nat -> nat)`：先接收 `f`，返回一个新函数，这个函数再接收 `x`，最终返回一个自然数。
>
> 这就是柯里化（Currying）：多参数函数表示为一系列每次只接收一个参数的函数。例如 `apply_twice f` 本身仍然是一个 `nat -> nat` 函数。
### Body AST：从 Rocq 到 Lean，一步一步
**第一步：Rocq 把定义展开成 `fun` 的形式**

冒号前的参数，在 Body 里以 `fun` 的形式出现：
```coq
Definition apply_twice :=
  fun (f : nat -> nat) =>
    fun (x : nat) =>
      f (f x).
```
- 两个 `fun` 对应两个 `Lambda` 节点：外层引入 `f`，内层引入 `x`；
- `f (f x)` 包含两次函数调用，对应两个 `App` 节点。
```text
Lambda(f, nat -> nat,          -- nat -> nat 在 AST 中就是 Prod(_, nat, nat)
  Lambda(x, nat,
    App(f, [
      App(f, [x])
    ])
  )
)
```
**第二步：翻译 `Lambda`（函数定义）**

翻译器看到最外层 `Lambda(f, nat -> nat, body)`，执行 `Lambda → Expr.lam`。它要处理三个部分：

- `f`：绑定的参数，保留绑定关系；
- `nat -> nat`：参数类型，翻译成 Lean 的 `Nat → Nat`；
- `body`：函数体，递归翻译。

得到 `Expr.lam(f, Nat → Nat, translated_body)`。`translated_body` 里又有一个 `Lambda(x, nat, …)`，按同样的规则得到 `Expr.lam(x, Nat, translated_body)`。两个 `Lambda` 处理完，剩下 `f (f x)`。

**第三步：翻译 `App`（函数调用）**

先看最里面的 `f x`，即 `App(f, [x])`。翻译器看到 `App`，就知道这是函数应用，递归地：

1. 翻译被调用的函数 `f`；
2. 翻译参数 `x`；
3. 组合成 `Expr.app(f, x)`。

再往外，`f (f x)` 即 `App(f, [App(f, [x])])`：先翻译里面的 `App`，再把结果作为外层调用的参数：
```text
Expr.app(f,
  Expr.app(f, x)
)
```
不管调用的是什么函数，只要 AST 表示函数应用，就递归翻译函数和所有参数，再构造 Lean 的函数应用节点。`App` 带的是参数列表，多个参数也是同一条规则。

**第四步：翻译 `nat` 和变量 `f`、`x`**

这两类不走 `Lambda` / `App` 规则，而是和它们配合使用：

- `nat`：是一个 Inductive Type，通过 Bootstrap Mapping 对应到 Lean 的 `Nat`。
- `f`、`x`：真正的 AST 里，局部变量不是保存字母，而是 de Bruijn 编号。进入两个 `Lambda` 后，`Rel 0` 是最近绑定的 `x`，`Rel 1` 是往外一层的 `f`：
```text
App(Rel 1, [
  App(Rel 1, [Rel 0])
])
```
我们用的是 MetaRocq 导出的 0-based 编号，所以 `Rel 0`、`Rel 1` 和 Lean 的 `bvar 0`、`bvar 1` 对应。

> [!warning] 两点注意
> - 原始 Rocq kernel 的编号约定和 MetaRocq 导出的约定不一样。
> - 实际实现不是直接生成 `bvar`：先通过作用域环境找到对应的 Lean 局部变量，再在构造 `lam` 时把它们抽象成绑定变量。

**第五步：得到最终的 Lean AST**
```text
lam(f, Nat → Nat,
  lam(x, Nat,
    app(bvar 1,
      app(bvar 1, bvar 0)
    )
  )
)
```
再经过声明生成和 Lean 的 pretty-printer（把 AST 显示成人类可读代码），得到：
```lean4
def Rocq.apply_twice (f : Nat → Nat) (x : Nat) := f (f x)
```
