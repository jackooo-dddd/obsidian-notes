Binder（绑定器）不是一种新的 Declaration，也不是一个具体的 Type。它是在一个表达式中引入一个局部变量，并规定这个变量可以在哪里使用的语法结构。
### 一个简单的例子
```
Definition identity (x : nat) : nat := x.
```
这里：
- `(x : nat)` 是一个 Binder，它引入变量 `x`，并规定 `x` 的类型为 `nat`。
- `:= x` 中的 `x` 是一次 Variable Reference，引用之前 Binder 引入的变量。
```
fun (x : nat) => x
```
它的 AST 可以表示为：
```
Lambda
├── Binder: x : nat
└── Body:
    └── Rel 0  (引用 x)
```
这里 `Lambda` 是 Binder 结构，而 `Rel 0` 是变量引用。

### 哪些东西属于 Binder？
在 Rocq 和 Lean 中，最常遇到的是这些：

| 形式                 | 例子                      | Binder 的作用    |
| ------------------ | ----------------------- | ------------- |
| Lambda             | `fun (x : nat) => x`    | 引入函数参数        |
| Forall / Prod      | `forall (x : nat), P x` | 引入被量化的变量      |
| Hypothesis         | `forall (H : P), Q H`   | 引入一个证明变量      |
| Let                | `let x := 3 in x + 1`   | 引入带定义值的局部变量   |
| Dependent Function | `(A : Type) → A → A`    | 引入后续类型可以引用的参数 |

其中最重要的是 Lambda 和 Prod，因为`trans` 会把它们分别翻译成 Lean 的 `Expr.lam` 和 `Expr.forallE`。

###  为什么 Lambda 和 Prod 都需要 Binder？
```
Definition identity (A : Type) (x : A) : A := x.
```
这里包含两个 Binder：
- `A : Type`：引入类型变量 `A`。
- `x : A`：引入值变量 `x`，它的类型依赖于前面的 `A`。
这个函数实际上有两部分。

Type：
```
forall (A : Type), A -> A
```
它的 AST 大致是：
```
Prod A Type
    Prod x A
        A
```

Body：
```
fun (A : Type) (x : A) => x
```
它的 AST 大致是：
```
Lambda A Type
    Lambda x A
        x
```
`Prod` 和 `Lambda` 都引入了 Binder，但用途不同。
- `Prod` 描述函数的类型：接受什么参数，返回什么类型。
- `Lambda` 描述函数的实现：接受参数之后，返回什么表达式。

### Binder 的 Scope 是什么？
Scope 就是 Binder 引入的变量在哪个范围内有效。
```
fun (x : nat) =>
  let y := S x in
  y
```
![[Pasted image 20261019212305.png|565]]
- 这个嵌套关系很重要，因为 Rocq 的 AST 不一定通过变量名字来引用它们。

### 为什么 AST 里面有 `Rel 0`、`Rel 1`？
这是 De Bruijn Index，也就是通过 Binder 的位置引用变量。
```
fun (x : nat) (y : nat) => x
```
AST 大致是：
```
Lambda x nat
    Lambda y nat
        Rel 1
```
为什么是 `Rel 1`？因为在 Body 中：

|AST|引用的变量|
|---|---|
|`Rel 0`|最近引入的 `y`|
|`Rel 1`|再往外一层的 `x`|

如果把函数改成：
```
fun (x : nat) (y : nat) => y
```
Body 就会变成 `Rel 0`。
- 这种表示方式不依赖变量名字，可以避免很多变量重名问题。
在 `rocq-core` 的 `Translate.lean` 中，`trans` 就是从当前的 Local Context 找到对应变量，最后使用 Lean 的 Binder 结构把它们组织起来。

### 为什么 Universe Rules 里面也经常出现 Binder？
因为 Binder 引入的变量本身也有 Type，而这些 Type 往往涉及 Universe Level。
```
Definition f
  (A : Type@{u})
  (B : Type@{v})
  (x : A) := x.
```
这里存在三个 Binder, ` A : Type@{u},   B : Type@{v},   x : A`
其中 `A`、`B` 这两个 Binder 的 Type 包含 Universe Levels。如果 Rocq 允许 `u`、`v` 独立，而翻译器却把它们强制变成：`u=v.` 那么虽然 Lean 可能接受这个函数，翻译后的 Universe Generality 却被限制了。
- 这就是为什么翻译器需要 Binder Independence Check。它检查的不是变量名字是否独立，而是这些 Binder 涉及的 Universe Levels 有没有被错误地合并或加入额外关系。