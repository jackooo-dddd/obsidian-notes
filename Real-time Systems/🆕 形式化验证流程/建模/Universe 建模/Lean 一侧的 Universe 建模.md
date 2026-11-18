# 要建模 Lean 的哪些部分
**`LTyping`** 模拟 Lean 内核的类型判断 `Σ; ps; Γ ⊢ t : T`。
**`LEquiv`** 模拟 Lean 内核判断两个 level 相等：**对所有赋值 σ 都算出同一个数**。
# 1. Lean 一侧的 level
### `LLevel` 用来表达 Lean 里 universe 的层级（`Sort u` 中的 `u`）

```lean
inductive LLevel where
  | zero                      -- 0
  | succ  (l : LLevel)        -- l + 1
  | max   (a b : LLevel)
  | imax  (a b : LLevel)      -- b = 0 时为 0，否则 max a b
  | param (name : String)     -- 声明的 universe 参数，如 u_l
```

- 一个 `LLevel` 只能用这五种方式之一造出来：

| 构造器                     | 括号里是什么                  | 造出来啥        | 意思                                                  |
| ----------------------- | ----------------------- | ----------- | --------------------------------------------------- |
| `zero`                  | 不需要参数                   | `zero`      | 层级 0                                                |
| `succ (l : LLevel)`     | 需要**一个**已有的 level `l`   | `succ l`    | 比 `l` 高一层，也就是 `l + 1`                               |
| `max (a b : LLevel)`    | 需要两个已有的 level `a` 和 `b` | `max a b`   | `a`、`b` 里大的那个                                       |
| `imax (a b : LLevel)`   | 同上，两个 level             | `imax a b`  | **`imax`** 专门用在函数类型 `∀ x : A, B : Sort (imax u v)`上 |
| `param (name : String)` | 需要一个名字                  | `param "u"` | 一个 universe 变量，比如 `u_l`                             |

- 设 `A : Sort u`、`B : Sort v`，则 `∀ x : A, B : Sort (imax u v)`：v = 0 时为 0，否则为 `max u v`。因为 `Prop` 是非直谓的，只要 `B` 是命题，整个 `∀` 就是命题，不管 `A` 在哪一层。


#### 用构造器 LLevel 实现 Lean 里面的 Level 
| Lean 里的写法          | 用 `LLevel` 写                  |
| ------------------ | ----------------------------- |
| `Sort 0`（即 `Prop`） | `zero`                        |
| `Sort 1`（即 `Type`） | `succ zero`                   |
| `Sort 2`           | `succ (succ zero)`            |
| `Sort (u + 1)`     | `succ (param "u")`            |
| `Sort (max u v)`   | `max (param "u") (param "v")` |

### 1.2 求值

```lean
abbrev LVal := String → Nat          -- 给每个参数名一个自然数

def LLevel.eval (σ : LVal) : LLevel → Nat
  | .zero     => 0
  | .succ l   => l.eval σ + 1
  | .max a b  => Nat.max (a.eval σ) (b.eval σ)
  | .imax a b => if b.eval σ = 0 then 0 else Nat.max (a.eval σ) (b.eval σ)
  | .param n  => σ n
```
- σ 是一个函数 String → Nat，它一次性给所有参数名都指定了值。比如 `u_l ↦ 3`
- `eval` 不负责赋值，只负责在某个给定的赋值 σ 下求值：遇到 `param n`，就去查 σ 里 `n` 对应几
##### 参数对求值的影响

| level                  | 有参数吗 | `eval` 的结果                                |
| ---------------------- | ---- | ----------------------------------------- |
| `succ zero`（即 1）       | 没有   | 永远是 1，不管 σ 是什么                            |
| `max (succ zero) zero` | 没有   | 永远是 1                                     |
| `succ (param "u_l")`   | 有    | 取决于 σ：`σ(u_l) = 3` 时是 4，`σ(u_l) = 0` 时是 1 |


- **没有参数**的 level 就是一个确定的数，σ 用不上。
- **有参数**的 level 值随 σ 变化。比较两个带参数的 level 时，会要求"对所有σ 都相等"（`LEquiv`）。
### 1.3 LEquiv：Lean 意义下的"相等"

```lean
def LEquiv (a b : LLevel) : Prop := ∀ σ, a.eval σ = b.eval σ
```
- 含义：level a 和 b 相等，意思是对所有参数赋值 σ（σ 一次性给每个参数指定一个自然数），a 和 b 用 eval 算出来的值都一样。
- **LEquiv 什么时候用到**：比较 level 只发生在**类型比较**的过程中。类型比较主要由两处触发：检查参数类型是否等于函数要求的类型，以及检查定义体的类型是否等于声明的类型。此外还有 `let` 等其他地方。在模型里，这些都对应 `LTyping` 的 `conv` 规则。
- 怎么用：逐节点对照两个类型时，碰到 `Sort a` 对 `Sort b`，要求 `LEquiv a b`；两边同一位置是同一个常量的引用 `c.{a₁,…,aₙ}` 和 `c.{b₁,…,bₙ}` 时，要求每一对实例都满足 `LEquiv aᵢ bᵢ`。
- 模型的要求来自 Lean 的类型论，Lean kernel 在类型检查时执行它们。我们在模型里把它们写成 `LEquiv`，放进 `LTyping` 的转换规则中。
- **和 Rocq 的 `REntails` 对比**：`REntails C a k b` 要求在所有**满足约束表 C** 的赋值 ρ 下，都有 `a + k ≤ b`。Lean 和它有两处不同：

| | Rocq `REntails C a k b` | Lean `LEquiv a b` |
| --- | --- | --- |
| 对哪些赋值 | 满足约束表 C 的 ρ | 所有 σ（Lean 没有约束表） |
| 关系 | `a + k ≤ b` | `a = b`（Lean 没有 cumulativity） |

这两处都让 Lean 更严格：Lean 认为相等的，Rocq 一定也认可。

---
## 2. 建模 universe 的翻译
翻译分三层：基本 level、level 表达式、Sort。[[Sort 和 Level]]

```lean
-- 基本 level 的像
def ILevel : RLevel → LLevel
  | .set      => .zero                          -- Set ↦ 0
  | .global n => .param ("u_" ++ n)             -- 全局 level l ↦ Lean 参数 u_l
  | .var i    => .param ("v_" ++ toString i)    -- 多态变量 i ↦ v_i

-- level 表达式（1）加上偏移：l + k ↦ succ (succ … (像))
def LLevel.addOffset (l : LLevel) : Nat → LLevel
  | 0     => l
  | k + 1 => .succ (l.addOffset k)
def IExpr (e : RLevelExpr) : LLevel := (ILevel e.level).addOffset e.offset

-- level 表达式（2）max构造器：逐项翻译，再取 max
def IUniv (u : RUniv) : LLevel := u.foldl (fun acc e => .max acc (IExpr e)) .zero

-- Sort：Prop ↦ Sort 0，Type@{u} ↦ Sort (u + 1)，ISort 的输出是一个 level，真正的 Sort 是 .sort (ISort s)。
def ISort : RSort → LLevel
  | .prop   => .zero -- Rocq 的 Prop 不是由某个 level u 构造出来的， 要单独处理；
  | .type u => .succ (IUniv u) -- Lean 把 Prop 算作第 0 层，而 Rocq 的 Type 从 Set （第一层） 开始编号
```

- 在模型里，Rocq 的任何一个 level，不管是单个的 `Set`、`l`、或是 `max(l+1, m)`，都统一写成 `RUniv`, 表示若干个"level + 偏移"取最大值。单个 level 只是偏移为 0 的特例。 
- `RUniv` 由 `IUniv` 翻译 。`IUniv`内部调用 `IExpr` 处理"level + 偏移"，`IExpr` 再调用 `ILevel` 处理基本的 `Set`、`l`、`var i`。


| Rocq 的 Sort          | 用到的 Rocq level | 这个 level 在 Lean 里（`IUniv`） | Lean 的 Sort（`ISort`，level 的像 + 1）       |     |
| -------------------- | -------------- | -------------------------- | --------------------------------------- | --- |
| `Prop`               | 无（不由 level 构造） | —                          | `Sort 0`                                |     |
| `Type@{Set}`         | `Set`          | `0`                        | `Sort (0 + 1)` = `Sort 1`               |     |
| `Type@{l}`           | `l`            | `u_l`                      | `Sort (u_l + 1)`                        |     |
| `Type@{l+1}`         | `l+1`          | `u_l + 1`                  | `Sort (u_l + 1 + 1)` = `Sort (u_l + 2)` |     |
| `Type@{max(l+1, m)}` | `max(l+1, m)`  | `max (u_l + 1) u_m`        | `Sort (max (u_l + 1) u_m + 1)`          |     |


---
## 收集 Rocq 的全局 level，整理成 Lean 声明的参数列表

```lean
-- 声明的类型和定义体里出现的全局 level，排好序
def levelsOf (d : RDecl) : List String := ...

-- Lean 声明的参数列表
def genParams (d : RDecl) : List String := (levelsOf d).map ("u_" ++ ·)
```

`ILevel` 只负责把表达式里出现的 `l` 改写成 `param "u_l"`，并不会把 `u_l` 登记到声明里。而 Lean 要求声明用到的每个参数都必须在它的参数列表中。所以还要在**整条声明**的层面，把参数列表整理出来：
- `levelsOf`：扫描类型和定义体，收集出现的全局 level，去重并排序；
- `genParams`：给每个 level 加上前缀 `u_`，得到参数列表。`genParams` 和 `ILevel` 用的是同一个前缀 `u_`，所以表达式里出现的每个参数，都一定在参数列表里。

| Rocq 声明                                      | `levelsOf`                    | 参数列表         | Lean 声明                                                                   |
| -------------------------------------------- | ----------------------------- | ------------ | ------------------------------------------------------------------------- |
| `F : Type@{m} → Type@{l} → Type@{max(l, m)}` | `[l, m]`（`m` 只记一次，排序后 `l` 在前） | `[u_l, u_m]` | `def F.{u_l, u_m} : Sort (u_m+1) → Sort (u_l+1) → Sort (max u_l u_m + 1)` |

参数列表的作用：
1. **对调用者**：规定实例的个数和顺序。引用 `F` 时，必须恰好给出两个实例，并按列表顺序填写：`F.{a, b}` 中，`a` 对应 `u_l`，`b` 对应 `u_m`。Lean 再按位置把参数代换成实例。
2. **对翻译正确性**：列表的第 i 个参数对应 Rocq 的第 i 个全局 level。 检查调用者在 Lean 声明里填的第 i 个实例时，知道该拿它和哪个 Rocq level 比较。
## 建模 Lean 声明引用常量时的实例代入

```lean
-- 下面是对 Lean kernel"引用常量时替换参数"这一步的建模。
structure LDecl where
  name   : String
  params : List String          -- 如 ["u_l"]
  type   : LTerm
  value  : Option LTerm

-- 由"声明的参数列表"和"引用时写的实例"配对，得到替换表 s。 例如 subst ["u_l"] [zero]
def subst (ps : List String) (ls : List LLevel) : String → LLevel :=
  fun n => match (ps.zip ls).lookup n with
    | some l => l               -- 表里有：换成对应的实例
    | none   => .param n        -- 表里没有：保持不变

-- 怎么把一个 level 里的参数按替换表 s 换掉
def LLevel.inst (s : String → LLevel) : LLevel → LLevel
  | .zero     => .zero
  | .succ l   => .succ (l.inst s)
  | .max a b  => .max (a.inst s) (b.inst s)
  | .imax a b => .imax (a.inst s) (b.inst s)
  | .param n  => s n                       -- 只有这里真正在替换

-- 把一个项里出现的所有 level 用 LLevel.inst 换掉，其它节点不变
def LTerm.instLevels (s : String → LLevel) : LTerm → LTerm
  | .sort l      => .sort (l.inst s)
  | .const c ls  => .const c (ls.map (·.inst s))
  | .forallE A B => .forallE (A.instLevels s) (B.instLevels s)
  | .lam A t     => .lam (A.instLevels s) (t.instLevels s)
  | .app f a     => .app (f.instLevels s) (a.instLevels s)
  | .bvar i      => .bvar i
```
1. **`instLevels` 负责找带 level 的节点**：它沿着项的树往下走。遇到不带 level 的节点（`forallE`、`lam`、`app`、`bvar`），就原样保留，继续往子树里找。找到带 level 的节点就交给 `inst`：
    -  叶子节点`sort l`：只有一个 level `l`，直接交给 `inst`，即 `l.inst s`。
    - 叶子节点`const c ls`：带一个 level 列表，用 `map` 把列表里的每个 level 都交给 `inst`。
2. **`inst` 负责换**：它在拿到的 level 表达式里找参数（`param`），遇到 `param n` 就查表换成 `s n`，其余部分（`zero`、`succ`、`max`、`imax`）原样保留。
#### LTyping 里的常量规则
- `LTyping` 如何判断引用 `c.{ls}` 的类型：
```
| const : Σ.find c = some d                    →   前提 1
          ls.length = d.params.length          →   前提 2
          LTyping Σ Γ (.const c ls)
                      (d.type.instLevels (subst d.params ls))   结论
```

|部分|含义|
|---|---|
|前提 1：`Σ.find c = some d`|环境里能找到常量 `c` 的声明，记作 `d`|
|前提 2：`ls.length = d.params.length`|引用时写的实例个数，等于声明里的参数个数|
|结论：`.const c ls`|引用 `c.{ls}` ……|
|结论：`d.type.instLevels (subst d.params ls)`|…… 的类型是：`d` 的类型，把参数换成 `ls`|

- 如果环境里有 `c`，并且实例个数对，那么 `c.{ls}` 的类型是 `c` 的类型把参数换成实例的结果。
- 在 Lean 里，只要环境里有 `c`、实例个数对、并且实例里只用当前声明的参数，`c.{ls}` 就有类型：`c` 的类型把参数换成 `ls` 以后的结果。实例取的值是否在上下文成立，要在后面比较类型时（`app`、`conv` 规则）才检查。
- 结论里的三样东西：
    - **`ls`**：引用时写的实例列表，每个参数对应一个实例。实例是 level 表达式（如 `zero`、`param "u_m"`），不一定是具体的数。
    - **`subst d.params ls`**：替换表。把 `d.params` 和 `ls` **按位置**一一配对：第 1 个参数对应第 1 个实例，第 2 个参数对应第 2 个实例，依此类推。前提 2 保证两边一样长，正好配满。
    - **`d.type.instLevels (subst d.params ls)`**：用这张替换表，把 `c` 的**类型**里出现的参数都换成对应的实例。得到的新类型就是 `c.{ls}` 的类型；环境里的 `d` 本身不变。

以 `id.{0}` 为例：

| 步骤   | 内容                                                      |
| ---- | ------------------------------------------------------- |
| 前提 1 | 环境里有 `id`：参数 `["u_l"]`，类型 `∀ A : Sort (u_l + 1), A → A` |
| 前提 2 | 参数 1 个，实例 `[zero]` 也是 1 个                               |
| 替换表  | `subst ["u_l"] [zero]`，即 `u_l ↦ zero`                   |
| 结论   | `id.{0} : ∀ A : Sort (0 + 1), A → A`                    |

#### 为什么 Lean 敢对实例的取值不设要求
前提里只检查了个数和参数名，没有检查实例取什么值。这是因为 `id` 被加入环境 `Σ` 的时候，已经**对 `u_l` 的所有取值**都检查过了（Lean 声明的规则是"对所有 σ 都类型正确"）。所以不管把 `u_l` 换成什么，`id` 都是类型正确的。

这是 Lean 类型论自己的性质，对应一条引理：
```lean
-- 实例化保持类型正确
theorem instLevels_typing :
    LTyping Σ ps Γ t T → LTyping Σ ps' (Γ.instLevels s) (t.instLevels s) (T.instLevels s)
```

它说明 `const` 规则是合理的：照它算出来的类型，确实是一个合法的类型。我们证明翻译正确时不需要证它，因为这属于 Lean 本身的可靠性。
- **前提**：引理是一般性的；用它说明 `const` 规则合理时，前提是环境良构，即环境里的每条声明 `d` 都能用 `LTyping` 推出 `d.type` 是一个类型（`LTyping Σ d.params [] d.type (.sort u)`）。真实 Lean 里这由内核检查保证；模型里靠假设。
- 引理保证引用本身永远没问题。它不保证**引用放进上下文**，这个类型和周围对得上。`id.{5}` 自己完全合法，类型是 `∀ A : Sort 6, A → A`；只是把它作用到 `Nat` 上时对不上。
- **根源在两个系统的差别，以及翻译器怎么弥补它。** Rocq 靠 cumulativity 和约束接受的东西，Lean 要求**完全相等、对所有取值成立**。翻译器必须在实例上做调整，调整失败就会在 `app` / `conv` 这一步暴露出来。

| 情况                 | 例子                                                             | 根源                              | 结果                           |
| ------------------ | -------------------------------------------------------------- | ------------------------------- | ---------------------------- |
| **选错了实例**          | 本该写 `id.{0}`，翻译器写了 `id.{5}` 或照搬了 `id.{u_l}`                    | 翻译器的错误，或 unifier 填了默认值          | 第一关失败；如果碰巧通过，由第二关拦下          |
| **没有任何实例能对上**      | `Definition MyNat : Type@{l} := nat`：`l` 是声明自己的 level，没有别的实例可调 | Lean 没有 cumulativity，光调实例不够     | 需要别的办法，比如 `PULift`（包一层）      |
| **需要 Lean 不知道的约束** | `T : Type@{m} := Type@{l}`，依赖 `l < m`                          | Rocq 是"在约束下成立"，Lean 要求"对所有取值成立" | 需要 R2F-c + PULift 改写；否则翻译不支持 |

---
# 把两边的赋值接起来 ？？？？？？
Rocq 用 ρ（给每个 RLevel 一个数），Lean 用 σ（给每个参数名一个数）。用 ρ 构造出对应的 σ：

```lean
-- "u_l" ↦ ρ (.global l)，"v_i" ↦ ρ (.var i)
def toLVal (ρ : Val) : LVal := ...
```

引理：先翻译再求值，等于先求值。
- `toLVal` 定义了单个Level是的赋值是怎么从Rocq到Lean到，`IUniv_eval` 把单个Level到赋值，扩展到了表达式上面。这说明了用了 `toLVal`的Level对应后，我们给Rocq的Level选一个合理的自然数赋值，到了lean那边，我们也有一个合理的赋值？？？？？？

```lean
theorem IUniv_eval (h : ρ .set = 0) :
    (IUniv u).eval (toLVal ρ) = u.eval ρ
```

在 Rocq 中，假设声明 `id` 使用了一个全局 Universe Level `l`。所有引用 `id` 的地方共享同一个 `l`，它没有固定的数值，但必须满足全局约束表 `C`。Rocq 要求声明在**所有满足 C 的 Universe 赋值下**都合法。

翻译到 Lean 后，全局 Level `l` 转换为 Universe Parameter `u_l`，每次引用 id 时独立指定 `u_l`，例如 `id.{0}`、`id.{1}`、`id.{2}`。同时，Lean Kernel 要求这个声明对 `u_l` 的所有实例化都成立。因此，这种翻译在 Universe 参数的适用范围上提出了更强的要求：原本只需要在 C 约束下合法的声明，现在需要在 Lean 不受 C 限制的参数取值下也合法。
####  取 `σ := ρ` 就能恢复原声明
- **任取**一个满足  Rocq 约束表 C 的赋值 ρ。
- 利用 `ρ` 构造 Lean 的 Universe 参数赋值 `σ := toLVal(ρ)`
- 对每个全局 Level `l`，规定`σ(u_l) = ρ(l)`。在这个 σ 下，翻译后每个 Sort 的值，都等于 Rocq 原来的 Sort 在 ρ 下的值。
