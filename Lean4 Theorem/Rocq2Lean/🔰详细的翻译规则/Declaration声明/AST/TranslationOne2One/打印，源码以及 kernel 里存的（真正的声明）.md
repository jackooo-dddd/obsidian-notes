打印不只是打印类型。**任何项都可以打印，类型和 body 都行**，看你用哪个命令。

## 同一个声明的三种样子

### ① 源码（你写的）

```coq
Definition lt (n m:nat) := S n <= m.
```

它是表面语法，参数、返回类型（这里省略了）、body 分成三块写。这时还没有节点树。

### ② kernel 里存的（真正的声明）

elaborator 把源码转成两棵节点树，存进全局环境：

```text
const_type = Prod(n, Ind nat, Prod(m, Ind nat, Sort Prop))
const_body = Lambda(n, Ind nat, Lambda(m, Ind nat,
               App(Ind le, [App(Construct S, [Rel 1]); Rel 0])))
```

这才是声明的真身：**一个名字加上两个项，每个项都是一棵节点树。**

### ③ 打印出来的（给人看的）

打印器把 ② 里的节点树翻译回可读文本。打印哪一棵树，取决于你用的命令：

| 命令 | 打印的是 | 输出 |
| --- | --- | --- |
| `Check lt` / `About lt` | type 那棵树 | `lt : nat -> nat -> Prop` |
| `Print lt` | body 和 type 两棵树 | `lt = fun n m : nat => S n <= m : nat -> nat -> Prop` |

翻译时做了这些事：

- `Rel` 换回名字。
- 不依赖参数的 `Prod` 印成 `->`。
- `App(Ind le, …)` 印成 `<=`。
- 等等。

## 三者的关系

```text
① 源码  ──elaborator──▶  ② 节点树（type + body）  ──打印器──▶  ③ 可读文本
   人写的                     kernel 里真正存的                     人看的
```

- **只有 ② 是声明本身**。① 是它的来源，③ 是它的显示形式。
- **① 和 ③ 看起来像，但不一样**。① 的参数写在 `:=` 左边；③ 已经折进去了，变成 `fun n m => …` 和 `nat -> nat -> Prop`。
- **翻译器只处理 ②**。它通过 MetaRocq 拿到这两棵节点树，再生成 Lean 的节点树（`forallE`、`lam`、`app`……）。
