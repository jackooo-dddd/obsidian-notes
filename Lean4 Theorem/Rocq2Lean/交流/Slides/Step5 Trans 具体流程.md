## 2. 怎么走：把 AST 从外到内走一遍
核心函数是 `Translate.lean` 中的 `trans`。它做的事情很直接：

1. 从 AST 的最外层开始，看当前节点是哪一种（∀、λ、函数应用、引用、`match`…）；
2. 按这种节点的规则，翻译成 Lean 中对应的东西；
3. 对它的子节点做同样的事，直到整棵树都翻译完。
### 什么是 binder
Binder 就是「引入一个新变量」的地方。常见的有三种：

- `∀ (x : T), …`：依赖函数类型；
- `fun (x : T) => …`：λ 表达式；
- `let x := v in …`：局部定义。

每个 binder 引入的变量，只能在它后面的 `…` 里使用。binder 可以一层套一层，比如 `count` 的 Body：
```coq
fun (A : Type@{197}) =>        (* 外层 binder，引入 A *)
  fun (l : list A) =>          (* 内层 binder，引入 l *)
    length A l
```
### 变量要一一对上
Rocq 的 AST 不用名字表示变量，而是用编号，表示「从当前位置往外数，第几个 binder 引入的变量」：

- `rel 0`：离得最近的那个，也就是包住当前位置的最内层 binder；
- `rel 1`：再往外一层；
- 依此类推。

在上面的 `length A l` 处，最近的 binder 是 `fun l`，所以 `l` 是 `rel 0`；再往外是 `fun A`，所以 `A` 是 `rel 1`。AST 里这一句写成：
```text
app (const length []) [rel 1, rel 0]
```
Lean 最终也用同样的编号方式（`bvar`），所以理论上可以照搬。但翻译过程中，我们需要随时让 Lean 帮忙算类型，而 Lean 只能为「已经放进上下文里的变量」算类型。所以：

- `trans` 每进入一个 binder，就把这个变量当作一个真正的局部变量放进上下文，并记下它的类型；
- 之后遇到 `rel i`，就去上下文里找从内往外数的第 i 个。
### Lean 怎么帮忙算类型
翻译时，`trans` 会调用 Lean 自己的几个工具：

| 工具 | 作用 |
|---|---|
| `inferType e` | 算出 `e` 的类型 |
| `isDefEq a b` | 判断 `a` 和 `b` 是否相等。如果其中有元变量，Lean 会顺便把元变量解出来、使两边相等，这就是统一 |
| `Meta.check e` | 把整个表达式检查一遍，检查过程中同样会解出元变量 |

**例子：`len_nat` 中的 `length nat l`**
```text
翻译得到：Rocq.length.{?k} Rocq.nat l          -- ?k 是新建的元变量

Lean 检查这个函数调用：
  第一个参数
    length 要求：   A : Type ?k
    实际传入 nat：  inferType nat = Type 0
    isDefEq (Type ?k) (Type 0)  →  相等的条件是 ?k := 0，于是解出 ?k
  第二个参数
    length 要求：   list.{0} nat
    实际传入 l：    inferType l  →  去上下文里查 l  →  list nat
```
最后一步说明了为什么变量必须放进上下文：Lean 要知道 `l` 的类型，只能去上下文里查。如果 `l` 只是一个编号 `bvar`，Lean 找不到它的类型，就没法检查。

翻译中用到这种「让 Lean 帮忙算」的地方很多，例如：

- 函数调用后，立刻用参数的类型解出函数头上的 Level 元变量（如上例）；
- 参数的类型和函数要求的不一致时，插入 Prop / Type 的提升（coercion）；
- 翻译 cast 时，判断两边的类型在 Lean 中是否相等；
- 引用 template inductive（如 `list A`）时，用 `A` 的类型决定它的 Level；
- 把 `match` 改写成 recursor 时，要知道被匹配的项的类型，才能构造 motive。
### 最后再检查一遍
整个项翻译完，`transClosed` 把这些局部变量重新换回编号（`bvar`），得到一个完整的 Lean 项。换回的同时检查两件事：

- 没有变量「逃逸」：每个变量都还在引入它的 binder 里面。如果某条翻译规则（比如改写 `match` 或递归时）把一个子项挪到了它的 binder 外面，这个变量就会「悬空」，结果不是合法的 Lean 项。
- 没有留下空位：项中不能有没填上的空位，只有代表还没证明的前提、等着变成假设的那些除外。

有任何一个问题，这次尝试就以 `TRANSLATION_FAILED` 结束。
