#### 为什么它的流程可以简单很多：方向不同，难点不同
我们之前讲的三个主要困难，在它的方向上大多不存在，或者变成了别的问题：

| |我们（Rocq → Lean）|它（Lean → Rocq）|
|---|---|---|
|**Cumulativity**|难：Lean 没有，Rocq 中靠 Cumulativity 成立的项，在 Lean 中要重新求解 Level，甚至要用 `PULift` 显式抬升|基本不是问题：Lean 中层完全相等的项，到了 Rocq 照样成立，因为 Rocq 接受的更多|
|**Universe Level 从哪里来**|难：Rocq 的单态声明用**全局** Level（如 197），Lean 没有，只能先放元变量，再求解（Step 4、6）|简单：Lean 中每个引用都**写明了** Universe 实参，Level 都是声明自己的参数，直接对应即可，不需要求解|
|**约束**|Lean 不能写 `u ≤ v`，只能用 `max` 表达|Rocq 可以写约束，它反而**加**约束：要求所有 Universe 参数严格大于 `Set`，以复现 Lean 中 `imax` 的推理|
|**递归**|难：Lean Kernel 只有 recursor，Rocq 的 `match` / `fix` 要改写或降级|简单：Lean 的项本来就用 recursor，只要对上 Rocq 自动生成的 recursor（参数顺序不同，它生成了专门的 `_recl` / `_indl`）|


**引用声明时传入的类型：**

> 在 Lean 里调用一个声明，传进去的东西所在的那一层，必须和这个声明要求的那一层一模一样，差一点都不行。所以把 Lean 翻译到 Rocq 的时候，不用担心 Cumulativity 的问题，层照着原样翻过去就行，只要处理一下 `Prop`、`imax` 这些写法上的差别。但 Rocq 不一样：在 Rocq 里调用一个声明，传进去的东西可以住在比要求更低的一层，比如把 `Set` 里的东西直接放进一个更高的 `Type` 里。Lean 不允许这样做，所以这种调用没法原样搬到 Lean，得重新算出每个地方到底该用哪一层。

**全局 Level：**
>Rocq 的单态声明用的是全局 Level，比如 `length` 用的是全局 Level 197。这个 197 在整个 Rocq 环境里是一个固定的 Level：不管谁、在哪里调用 `length`，它要求的都是 `Type@{197}`，不会变。但因为 Rocq 有 Cumulativity，住在比 197 更低的层里的类型，也能直接传进去，比如 `nat` 在 `Set` 里，照样可以交给 `length`。所以这个 197 真正表达的意思是：“这里是一个固定的层，但比它低的东西都能放进来。”
>
这个意思翻译到 Lean 就很麻烦，因为 Lean 既没有全局 Level，也没有 Cumulativity，两种直接的翻法都会出问题。如果把 197 翻译成一个固定的 Level，比如某个具体的数，首先我们根本不知道它该是几，Rocq 只知道它和别的 Level 谁大谁小，不知道它具体是多少；而且 Lean 中层必须一模一样，`length` 就只能用在恰好那一层的类型上，`nat` 这种低层的类型就传不进去了。如果把 197 翻译成一个 Universe 参数 `u_197`，`length` 确实可以用在任何一层上了，但新的问题又来了：Lean 里每个声明的 `u_197` 都是各自独立的，原来大家共用同一个 197 的关系没了；调用者还可能把它填到比 197 更高的层，这是 Rocq 里从来没允许过的；Rocq 里 197 和其他 Level 之间的大小关系，Lean 里也写不出来。

>所以我们不能一开始就定死，只能先放一个元变量占位，等类型检查之后，再结合 Rocq 的关系，看它在每个声明里该变成什么。我们先在这个位置放一个元变量占着，等类型检查做完了再决定它到底是什么：可能是这个声明的一个新参数 `u_197`，可能被解成这个声明自己的另一个 Level，可能被解成一个具体的值，也可能最后只能填一个默认值。反过来就简单多了：Lean 里用到的 Level 都是每个声明自己的 Universe 参数，调用的时候也都写明了填什么，所以翻译到 Rocq 时，直接把它们对应成 Rocq 多态声明的 Universe 变量就行，不需要元变量，也不需要求解。


 lean2rocq 也有自己的难点，而且正好和我们的问题“镜像”：
- **`Prop` 的对应**：它把 Lean 的 `Prop` 翻译成 Rocq 的 `SProp`。原因是 Lean 的 `Prop` 有定义上的证明无关性，Rocq 的 `Prop` 没有，而 `SProp` 有。我们是 Rocq `Prop` → Lean `Prop`，这个方向 Lean 更强，所以不用换。
- **Universe 实例化成 `Prop`**：Lean 允许把 `Sort u` 中的 `u` 实例化成 0（即 `Prop`），Rocq 不行。它的做法是为每种实例化方式复制一份声明（加后缀 `_instX`）。这和我们的 R8 正好相反：R8 把 Rocq 的 `Type@{l}` 翻译成也能接受 `Prop` 的 `Sort u`，让结果更一般。
- **`imax`：**`imax a b` 在 `b` 是 `Prop` 时取 `Prop`，它需要专门处理。
- **代数 Universe**：Rocq 的 Universe Instance 中不能写 `max u v` 这样的表达式，它就引入替身 Level（如 `Lean.max__u_v.0`），再加约束把它们联系起来。

