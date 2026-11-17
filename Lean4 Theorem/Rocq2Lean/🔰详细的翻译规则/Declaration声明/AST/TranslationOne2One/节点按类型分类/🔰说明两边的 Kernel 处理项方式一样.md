## 说明两边的 Kernel 处理项的方式一样
**一句话：** kernel 对一个项只做一件事：判断它合不合法、类型是什么。如果把 Prod 换成 forallE、Lambda 换成 lam 之后，Lean kernel 对每个项给出的判断，都恰好是 Rocq 判断的翻译，那么在 kernel 看来，新节点就完全替代了旧节点。

思路是：把 kernel 看成一台「出判断」的机器。只要证明替换节点之后，Lean 这台机器的每一个判断都恰好是 Rocq 那个判断的翻译，就说明替换没有改变任何东西。

- 对应：如果 Rocq 判断 `Γ ⊢ t : A`，那么 Lean 判断 `⟦Γ⟧ ⊢ ⟦t⟧ : ⟦A⟧`（类型相差一个定义等价）；如果 Rocq 判断 `A ≡ B`，那么 Lean 判断 `⟦A⟧ ≡ ⟦B⟧`。
- 局部引理：设 Γ 与 ⟦Γ⟧ 对应。对 Π、λ、应用节点，如果每个子项在它所在的上下文（λ / Π 的 body 在扩展后的上下文）里都对应，那么把节点换成 Lean 的同名构造器后，整个节点在 ⟦Γ⟧ 里也对应。所以在 kernel 的判断这个层面，新节点可以替代旧节点。例外是累积性（`PULift`）和 Sort 改名。

---
## 1. kernel 会给出哪几种「判断」
kernel 的判断都是对「上下文 Γ 里的项」做的，只有三种：

| 判断 | 形式 | 含义 | Rocq kernel | Lean kernel |
|---|---|---|---|---|
| 推断 | `Γ ⊢ t : T` | 在上下文 Γ 里，任意项 t 的类型是 T | `execute env t` | `infer_type_core(t)` |
| 是类型 | `Γ ⊢ A : Sort s` | 任意项 A 的类型是某个 Sort s | `execute_is_type` | `ensure_sort_core` |
| 相等 | `Γ ⊢ T₁ ≡ T₂` | 任意两个项 T₁ 和 T₂ 可以互相转换 | `conv` / `conv_leq` | `is_def_eq` |
### 1.1 接受一个声明：三种判断各用一次
检查声明 `c : T := body` 时，局部上下文是空的（Γ = ·）：

1. 是类型：`· ⊢ T : Sort s`，T 是一个类型；
2. 推断：`· ⊢ body : T'`，body 的类型是 T'；
3. 相等：`· ⊢ T' ≡ T`，T' 和 T 相等。
### 1.2 在子项上递归用同样三种判断
「推断 body」不是一步就完成的。kernel 会沿着树往下，对每个子项再用这三种判断，只是 Γ 会随着进入 binder 变长。以 `lt` 的 body 为例：
```text
推断    · ⊢ fun n m => le (S n) m
├ 是类型  · ⊢ nat                              （binder 的类型）
└ 推断    n:nat ⊢ fun m => le (S n) m           （Γ 变长）
   ├ 是类型  n:nat ⊢ nat
   └ 推断    n:nat, m:nat ⊢ le (S n) m
      ├ 推断  le : nat → nat → Prop             （化成 Π 形式）
      ├ 推断  S n : nat
      ├ 相等  nat ≡ nat                         （实参类型 vs 形参类型）
      ├ 推断  m : nat
      └ 相等  nat ≡ nat
```

> [!summary] 所以只要证明每种判断保持不变
> kernel 是唯一决定「合不合法、类型是什么」的地方。只要每种节点在翻译后调用的判断不变，对任意 Γ 和任意项都成立，整棵树、整个声明就都成立，Lean 看到的就和 Rocq 看到的是同一件事。

---
## 2. 翻译是什么
记翻译为 ⟦·⟧。它逐个节点替换，子项递归翻译：

| Rocq | ⟦·⟧ 之后的 Lean |
|---|---|
| `Prod(x, A, B)` | `forallE x ⟦A⟧ ⟦B⟧` |
| `Lambda(x, A, t)` | `lam x ⟦A⟧ ⟦t⟧` |
| `Rel i` | `bvar i`（原生 Rocq 从 1 开始数，IR 和 Lean 从 0 开始数，只是计数起点不同） |
| `Prop` / `Set` / `Type@{Set+n}` | `Sort 0` / `Sort 1` / `Sort (n+1)`，记作 I(s) |

上下文也逐条翻译：`⟦x₁:A₁, …, xₖ:Aₖ⟧ = x₁:⟦A₁⟧, …, xₖ:⟦Aₖ⟧`。
## 3. 要证明的目标
> 如果 Rocq kernel 判断 `Γ ⊢ t : T`，那么 Lean kernel 判断 `⟦Γ⟧ ⊢ ⟦t⟧ : ⟦T⟧`。

画成图，就是这个方块能「转得通」：
```text
Rocq:   (Γ, t)  ──── Rocq kernel ────▶  T
          │                             │
          ⟦·⟧                           ⟦·⟧
          ▼                             ▼
Lean:  (⟦Γ⟧, ⟦t⟧) ── Lean kernel ────▶  ⟦T⟧   ← Lean 自己算出的结果，正好落在这里
```
## 4. 为什么可以「跟着 kernel 的代码走」来证明
两边的 kernel 都是按节点递归的：看到一个 `Prod`，先对 A 和 B 递归求类型，再用这两个结果算出 `Prod` 的类型。所以可以对项的结构做归纳：

- 归纳假设：对子项（A、B、t）的递归调用，两边的结果已经满足「Lean = ⟦Rocq⟧」。
- 要证的：在 `Prod` / `Lambda` 这一层，两边各自走一遍自己的分支后，结果仍然满足「Lean = ⟦Rocq⟧」。

也就是说，只要检查每个分支里的每一步都和翻译「交换」就够了。下面逐步检查。

---
## 5. Prod 分支：逐步对照
输入：Rocq 的 `Prod(x, A, B)`，Lean 的 `forallE x ⟦A⟧ ⟦B⟧`。

| 步骤 | Rocq（`typeops.ml` 的 `Prod` 分支） | Lean（`infer_pi`） | 为什么 Lean = ⟦Rocq⟧ |
|---|---|---|---|
| ① A 是类型 | `execute_is_type env A` 得到 s₁ | `ensure_sort_core(infer(⟦A⟧))` 得到 I(s₁) | 归纳假设 |
| ② 加入参数 | `push_rel (x:A)`，上下文变成 Γ, x:A | `mk_local_decl x:⟦A⟧`，上下文变成 ⟦Γ⟧, x:⟦A⟧ | 正好是 ⟦Γ, x:A⟧ |
| ③ B 是类型 | `execute_is_type env1 B` 得到 s₂ | `ensure_sort_core(infer(⟦B⟧))` 得到 I(s₂) | 归纳假设（上下文已在 ② 对上） |
| ④ 算 Prod 的 Sort | `sort_of_product s₁ s₂` | `imax(I s₁, I s₂)` | 见下表 |

第 ④ 步需要单独验证：`I(sort_of_product(s₁, s₂)) = imax(I s₁, I s₂)`。共有四种情形，逐一核对：

| s₁ | s₂ | Rocq 结果 | 翻译后 | Lean `imax` | 相同？ |
|---|---|---|---|---|---|
| 任意 | Prop | Prop（impredicative） | Sort 0 | imax(u, 0) = 0 | 相同 |
| Prop | Type@{Set+n} | 取 s₂ | Sort (n+1) | imax(0, n+1) = n+1 | 相同 |
| Type@{Set+m} | Type@{Set+n} | Type@{Set+max(m,n)} | Sort (max(m,n)+1) | max(m+1, n+1) | 相同 |
| Set | Set | Set | Sort 1 | max(1, 1) = 1 | 相同 |

**结论：** `Prod` 分支每一步都和翻译交换，所以 Lean 算出 `forallE` 的 Sort 正好是 Rocq 算出的 `Prod` 的 Sort 的翻译。
## 6. Lambda 分支：逐步对照
输入：Rocq 的 `Lambda(x, A, t)`，Lean 的 `lam x ⟦A⟧ ⟦t⟧`。

| 步骤 | Rocq（`Lambda` 分支） | Lean（`infer_lambda`） | 为什么 Lean = ⟦Rocq⟧ |
|---|---|---|---|
| ① A 是类型 | `execute_is_type env A` | `ensure_sort_core(infer(⟦A⟧))` | 归纳假设 |
| ② 加入参数 | `push_rel (x:A)` | `mk_local_decl x:⟦A⟧` | 正好是 ⟦Γ, x:A⟧ |
| ③ 推断 body 的类型 | `execute env1 t` 得到 B | `infer(⟦t⟧)` 得到 ⟦B⟧ | 归纳假设 |
| ④ 造出 λ 的类型 | `mkProd(x, A, B)` | `mk_pi(x, ⟦B⟧)`，即 `forallE x ⟦A⟧ ⟦B⟧` | `⟦Prod(x,A,B)⟧` 按定义就是 `forallE x ⟦A⟧ ⟦B⟧` |

第 ④ 步最关键。Rocq 规定「λ 的类型是 Prod」，Lean 规定「lam 的类型是 forallE」。而翻译恰好把 `Prod` 送到 `forallE`，所以这一步能对上。

> [!tip] 这种对应只能这样选
> 假如把 `Lambda` 译成别的节点，或者把 `Prod` 译成 `lam`，第 ④ 步就会失败：Lean 算出的是 `forallE`，而 Rocq 结果的翻译却不是 `forallE`，方块就转不通了。
### 6.1 第三种判断「相等」也保持住
β 归约在两边都是 `(λx.t) a ⟶ t[x:=a]`。翻译只替换节点外壳，不碰变量编号，所以有：
```text
⟦t[x:=a]⟧ = ⟦t⟧[x:=⟦a⟧]
```
因此，Rocq 里一步 β 归约，翻译后在 Lean 里也正好是一步 β 归约。Rocq 判断「相等」的，Lean 同样判断「相等」。

---
## 7. 用 `lt` 把整台机器跑一遍
```coq
Definition lt (n m : nat) : Prop := S n <= m.
```
```text
type = Prod(n, nat, Prod(m, nat, Prop))
body = Lambda(n, nat, Lambda(m, nat, le (S n) m))
```
### 7.1 检查 body：每一行都完全一致

| kernel 调用 | Rocq 判断 | Lean 判断 | Lean = ⟦Rocq⟧？ |
|---|---|---|---|
| Lambda n：① `nat` 是类型 | `nat : Set` | `nat : Sort 1` | 一致，I(Set) = Sort 1 |
| ② 加入参数 | `n : nat` | `n : nat` | 一致 |
| Lambda m：①② | `m : nat` | `m : nat` | 一致 |
| ③ 推断 `le (S n) m` | `Prop` | `Sort 0` | 一致（这一步用到 App 和前面已翻译好的 `le`、`S`） |
| Lambda m：④ | `Prod(m, nat, Prop)` | `forallE m nat (Sort 0)` | 一致 |
| Lambda n：④ | `Prod(n, nat, Prod(m, nat, Prop))` | `forallE n nat (forallE m nat (Sort 0))` | 一致 |
| 和声明的类型比较 | `conv`：相等 | `is_def_eq`：相等 | 一致 |
### 7.2 检查 type：有一处差一层

| kernel 调用 | Rocq | Lean | 对应？ |
|---|---|---|---|
| `nat` 是类型 | `Set` | `Sort 1` | 一致 |
| `Prop` 是类型 | `Prop : Type@{Set+1}` | `Sort 0 : Sort 1` | 不一致：翻译应为 Sort 2，Lean 给的是 Sort 1 |
| 内层 Prod 的 Sort | `sup(Set, Set+1) = Set+1` | `imax(1, 1) = 1` | 上一行的差别传了下来 |
| 声明要求「type 是类型」 | 是 | 是 | 一致 |

这不是 `Prod` 规则的问题。第 ④ 步的公式依然交换：如果 Lean 收到的输入是 Sort 2，算出来也是 Sort 2。差别出在 `Sort` 节点自己的公理：Rocq 规定 `Prop : Type@{Set+1}`，Lean 规定 `Prop : Sort 1`，所以 Lean 给出的 Universe 低了一级。

这个差别不影响声明被接受，因为声明只要求「type 是一个类型」，并不记录它属于哪一层。项目里的 R2⁺ 规则处理的正是这一点。

> [!todo] 另一篇笔记里的错误
> 笔记 ` _看到形成…md` 的例 2 写的「两边都是 Type」不准确，原因就是上面这处差别，需要修正。

---
## 8. 这个论证的边界

| 范围 | 状态 |
|---|---|
| `Prod` / `Lambda` 两个分支的每一步 | 完全交换 |
| Rocq 的相关性标注、Lean 的 `BinderInfo` | 不参与这三种判断，可以忽略 |
| `Prop` 自己的类型 | Sort 节点公理不同，Lean 给的层级低一级（R2⁺） |
| Rocq 的累积性（`conv_leq` 允许 Type@{i} ≤ Type@{j}） | 出现在「相等」判断里，Lean 没有累积性，需要靠 `PULift`（规则 P）来补 |
| 方向 | 只证明「Rocq 接受，则 Lean 接受翻译结果」，这正是翻译需要的方向 |
