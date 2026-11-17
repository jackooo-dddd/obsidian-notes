参数信息必须写进 type 和 body 这两个项本身。
## 更精确的原因：声明里没有"参数"这一栏
kernel 存一个常量时，只有这几栏：

```
const_type  = 一个项
const_body  = 一个项
universes   = ...
```

**没有"参数清单"这一栏。**`Definition lt (n m:nat)` 里的 `(n m:nat)` 只是表面语法，kernel 根本没有地方存它。所以 `n` 和 `m` 唯一的去处，就是变成 type 和 body **里面**的节点。

假设不用 Lambda 包装 body，直接把 `S n <= m` 和 `Prop` 交给 kernel，会怎样？kernel 检查全局声明时，**局部上下文是空的**。它看到函数体里的 `Rel 1`、`Rel 0`，去上下文里找，什么也找不到，就会报"变量未约束"并拒绝。
所以要求是：**存进全局环境的项必须是封闭的**，里面每个变量都得由项内部的某个节点引入。
## "让 body 能访问输入"：kernel 检查时确实是这么做的
你说的"把输入的上下文传给 body"，正是 kernel 类型检查的实际动作。以 `lt` 的 body 为例，每进一层 Lambda，就往上下文里加一个变量：

| 正在检查的节点 | 当时的局部上下文 | 动作 |
|---|---|---|
| `Lambda(n, nat, ...)` | 空 | 把 `n : nat` 加进上下文，进入里层 |
| `Lambda(m, nat, ...)` | `n : nat` | 把 `m : nat` 加进上下文，进入里层 |
| `le (S (Rel 1)) (Rel 0)` | `n : nat, m : nat` | `Rel 0` 查到 m，`Rel 1` 查到 n，算出类型是 `Prop` |

检查 type 那棵树时，Prod 的做法完全一样：进入 `Prod(n, nat, ...)` 时把 `n : nat` 加进上下文，所以里面的返回类型可以提到 `n`。这就是依赖函数的来源。
## 补充 ：引入变量的不只有 Prod 和 Lambda
凡是能往局部上下文里加东西的节点，都叫 binder。kernel 里一共有这几种：

| 节点       | 引入什么        | 例子                             |
| -------- | ----------- | ------------------------------ |
| Prod     | 类型里的参数      | `forall n:nat, ...`            |
| Lambda   | 函数体里的参数     | `fun n:nat => ...`             |
| LetIn    | 一个有具体值的局部定义 | `let x := 3 in ...`            |
| Case 的分支 | 构造子的参数      | `S p => ...` 里的 `p`            |
| Fix      | 正在定义的递归函数自己 | `add` 函数体里的 `add`（上面的 `rel 3`） |




## Prod 与 Lambda 的区别：构造什么，而不是出现在哪里

**Prod 构造函数类型，Lambda 构造函数值。** 不能简单地记成“声明的 `type` 里用 Prod，`body` 里用 Lambda”。

| 节点 | 构造什么 | 描述什么 | 在 `lt` 中的例子 |
| --- | --- | --- | --- |
| **Prod** | 函数类型（可以依赖参数） | 接收什么类型的参数，结果是什么类型 | `forall (n:nat) (m:nat), Prop` |
| **Lambda** | 函数值 | 接收参数后，具体返回哪个表达式 | `fun (n:nat) (m:nat) => S n <= m` |

### 两者的类型关系

如果在局部上下文 `x : A` 下，`t` 的类型是 `B`，那么抽象出参数 `x` 后，有：

```text
Lambda(x, A, t) : Prod(x, A, B)
```

也就是：

```coq
(fun (x : A) => t) : (forall (x : A), B)
```

这里 `B` 可以依赖 `x`。而 `Prod(x, A, B)` 本身是一个类型，它的类型是某个 sort，例如 `Prop`、`Set` 或 `Type`；具体由类型规则决定。

### 为什么 `lt` 中是 type 用 Prod，body 用 Lambda

`lt` 定义的是一个接收两个自然数、返回命题的函数。因此，它的 **body 是函数值**，用 Lambda；它的 **type 是这个函数的类型**，用 Prod。这是 `lt` 的具体结构，不是由 `type`、`body` 两个字段的位置决定的。

### 反例：body 也可以是 Prod

```coq
Definition NatFun : Type := nat -> nat.
```

这个定义给函数类型 `nat -> nat` 起了一个名字，并没有定义一个接收自然数的函数。

| 声明字段 | 内容 | AST 节点 |
| --- | --- | --- |
| `type` | `Type` | `Sort` |
| `body` | `nat -> nat`，即 `forall (_ : nat), nat` | `Prod` |

所以，这里的 **body 是一个函数类型，用 Prod 表示，不含 Lambda**。

> 判断时先问“这个表达式是在构造函数，还是在描述函数的类型”，不要只看它出现在声明的哪个字段。类型本身也是项，因此可以作为定义的 body。

参考：[Rocq 官方手册：项与类型规则](https://rocq-prover.org/doc/V9.1.1/refman/language/cic.html)。

# 具体包装流程

## 1. 先看包装之前有什么

```coq
Definition lt (n m:nat) := S n <= m.
```

推断类型的时候，Rocq 先把 `n : nat`、`m : nat` 当成**已知的变量**放在一边，然后只看 `:=` 右边那一小段：

| | 内容 | 含义 |
|---|---|---|
| 函数体的核心 | `S n <= m` | 一个提到了 `n` 和 `m` 的表达式 |
| 它的类型 | `Prop` | 它是一个命题 |

问题在于，单看 `S n <= m`，你不知道 `n` 和 `m` 是什么。它只有在"假设已经有 n 和 m"的前提下才有意义，就像数学里的 `x + 1`，单独看说不清 x 是几。

要让 `lt` 变成一个独立的、可以存起来给别人用的东西，就得把"需要先给我 n 和 m"这件事**写进项本身**，这就是"包装"。
## 2. 由内向外，一层一层包
先包最里面的 `m`，再包 `n`。每一步都同时改两样东西：函数体前面加一个 `fun`，类型前面加一个 `forall`。

**第 0 步（还没包）**

```
函数体: S n <= m
类型  : Prop
```

**第 1 步：包上 m**

```
函数体: fun (m:nat) => S n <= m        ← 函数体外面加 fun m
类型  : forall (m:nat), Prop            ← 类型外面加 forall m
```

函数体现在的意思是"给我一个 m，我还你 `S n <= m`"；类型的意思是"这是一个接收 nat、返回 Prop 的东西"。

**第 2 步：再包上 n**

```
函数体: fun (n:nat) => fun (m:nat) => S n <= m
类型  : forall (n:nat), forall (m:nat), Prop
```

包完以后，左右两边都没有"不知从哪来的 n 和 m"了，它们都由自己外面的 `fun` 或 `forall` 引入。写成 kernel 节点就是：

```
body = Lambda(n, nat, Lambda(m, nat, le (S n) m))     ← fun 就是 Lambda
type = Prod  (n, nat, Prod  (m, nat, Prop))           ← forall 就是 Prod
```

**每一步都保持"函数体的类型就是这个类型"**：第 0 步 `S n <= m : Prop`，第 1 步 `fun m => ... : forall m, Prop`，第 2 步也是一样。所以两边必须**同步**地包。
## 3. 三种写法完全等价
你完全可以自己手动包好再交给 Rocq，下面三种写法得到的 kernel 项**一模一样**：

```coq
Definition lt (n m:nat) := S n <= m.                         (* 参数写在左边，让 Rocq 帮你包 *)

Definition lt : nat -> nat -> Prop := fun n m => S n <= m.   (* 自己包好，类型用箭头写 *)

Definition lt : forall (n:nat) (m:nat), Prop :=
  fun (n:nat) => fun (m:nat) => S n <= m.                    (* 自己包好，完全展开 *)
```

第一种写法只是**语法糖**，省掉了你手写 `fun` 和 `forall` 的工夫。Rocq 内部负责包装的函数叫 `it_mkLambda_or_LetIn` 和 `it_mkProd_or_LetIn`，名字直白地说的就是"按参数清单，一层层套上 Lambda 或 Prod"。
## 4. 用起来就是反过来"剥"
把 `lt` 用在具体的数上，就能看出两层壳各自的作用。每传一个参数，**函数体剥掉一层 Lambda，类型同时剥掉一层 Prod**：

| 表达式 | 函数体（剥 Lambda，代入值） | 类型（剥 Prod） |
|---|---|---|
| `lt` | `fun n => fun m => S n <= m` | `forall n, forall m, Prop` |
| `lt 2` | `fun m => S 2 <= m` | `forall m, Prop` |
| `lt 2 5` | `S 2 <= 5`，也就是 `3 <= 5` | `Prop` |

所以：
- **Lambda（包在函数体外）回答"怎么算"**：拿到参数以后，把它代进函数体。
- **Prod（包在类型外）回答"是什么样的东西"**：要几个参数、每个参数是什么类型、最后得到什么类型。
