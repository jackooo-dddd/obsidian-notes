# 为什么通过我们的翻译，可以保持Rocq Global Level 里面的关系
这里要分清两种“同一个 197”：**同一个声明内部**，和**不同声明之间**。同一个声明内部，“同一个”的关系由参数自然保住；不同声明之间，靠引用时的规则和检查补回来。至于每次引用可以填不同的值，这在 Lean 中起的正是 Rocq 中 Cumulativity 的作用。
### 1. 同一个声明内部：自然保住了
比如 `count (A : Type@{197}) (l : list A)` 中，`A` 的类型和 `l` 的类型都用到 197。翻译后，它们都变成 `count` 的**同一个**参数 `u_197`：

```lean
def Rocq.count.{u_197} (A : Type u_197) (l : Rocq.list.{u_197} A) : Rocq.nat := …
```

刚才说过，一次引用里一个参数只有一个值。所以不管别人用 `count` 时把 `u_197` 填成什么，比如 3，`A` 和 `l` 这两处**同时**变成 3，不可能一处是 3、一处是 5。“它们是同一个 Level”这层关系，在 `count` 内部始终成立。
### 2. 不同声明之间：引用时补回来，并且要检查
`length` 有自己的 `u_197`，`count` 也有自己的 `u_197`，在 Lean 中这是两个独立的参数。Rocq 中“`length` 和 `count` 用的是同一个 197”这层关系，是在引用时补回来的：

```lean
Rocq.count.{u_197} … := Rocq.length.{u_197} A l   -- count 把自己的 u_197 传给 length
```

这就是规则一：引用者自己也用 197，就必须把自己的参数传过去。Step 7 的 R3 检查会确认确实是这样传的，传了别的值就拒绝。所以在 `count` 内部，`length` 和 `count` 仍然是同一层。
### 3. 在不同地方填不同的值：对应 Rocq 的 Cumulativity
你担心的是：别的声明使用 `count` 时，一处填 0、另一处填 5，是不是说明“197 不再是同一个了”？

其实这正好对应 Rocq 中的 Cumulativity：
- **Rocq 中：**`count` 永远在 197 这一层，但更低层的类型也能传进来，比如 `count nat …` 就是把 `nat` 往上抬到 197。
- **Lean 中**：没法往上抬，于是改成**直接在更低的那一层使用 `count`**，即 `Rocq.count.{0} Rocq.nat …`。

所以不同的地方填不同的值，表达的是“在 Rocq 中，这里放进去的东西其实比 197 低”。为了不超出 Rocq 原来的意思，R3 检查确保填进去的值**不超过** Rocq 允许的范围：可以更低，不能更高。
# 具体的值出现在哪里
**1. 引用别的声明时，给它的参数填具体值（最常见）。**

```lean
def Rocq.len_nat (l : Rocq.list.{0} Rocq.nat) : Rocq.nat := Rocq.length.{0} Rocq.nat l
```

这里的 `0` 是 **`length` 的参数** `u_197` 在这一次引用中填的值。`len_nat` 自己并没有哪个全局 Level 变成了 0。这对应 Rocq 中“`nat` 借助 Cumulativity 被放进 197”。之前 `leq` 中 `eq_op.{0, 0, 0, 0}` 的那几个 0 也是这一类，其中三个还是默认值。

**2. 声明自己的 Level 被类型检查强制成具体值（少见，常被拒绝）。**

```coq
Definition natList : Type@{197} := list nat.
```

值 `list nat` 在 `Type 0` 中，Lean 没有 Cumulativity，于是 197 被强制解成 0。但 Rocq 要求 `Set < 197`，所以 Step 7 的 A1 检查会拒绝。之后要靠后面的 tier 换一种翻法：比如 R2B-V 把结果类型改成值所在的层，或者按出现处的 tier 把共用的 Level 拆开。所以这种情况能留到最后结果里的很少。

> 声明自己的全局 Level，绝大多数都会变成 Lean 的 Universe 参数。具体的值主要出现在引用别的声明时：给被引用声明的参数填一个具体的层，这对应 Rocq 中靠 Cumulativity 把低层的东西放进去。声明自己的 Level 被定成具体值的情况很少，要么是被类型检查强制的（通常会被 Step 7 拦下，换别的 tier 再试），要么是只在 Body 中出现、取了默认值。