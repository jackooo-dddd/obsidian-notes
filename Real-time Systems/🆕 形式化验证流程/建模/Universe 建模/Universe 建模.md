``` coq
Universe l. # id 是单态的，固定在全局 level l。

Definition id : forall (A : Type@{l}) (x : A), A :=
  fun (A : Type@{l}) (x : A) => x.
Definition idNat : forall (x : nat), nat := fun (x : nat) => id nat x.
```
```lean
# 翻译到 Lean，全局 level l 变成 id 的 universe 参数 u_l
def id.{u_l} : (A : Sort (u_l+1)) → A → A := fun A x => x
# 调用时实例化 u_l 到 0，因为第一个参数 A 填的是 Nat，而 Nat 的类型是 Sort 1。
def idNat : Nat → Nat := fun x => id.{0} Nat x
```
# 建立的模型怎么定义翻译是正确的
- **Lean 里做了什么**：Rocq 的全局 level `l` 被翻译成 `id` 的 universe 参数 `u_l`。在 `id nat` 这个引用处，我们把它实例化成 `0`，也就是 Rocq 的 level `Set` 对应的 Lean level。
- **模型怎么判定翻译正确**：要同时满足两个条件：
    1. **是合法翻译**：`Corr C (id nat) (id.{0} Nat)` 成立；
    2. **Lean 接受**：`id.{0} Nat` 在 Lean 里类型正确，因为 `id.{0}` 要求参数在 `Sort 1` 里，而 `Nat : Sort 1`。
    要证明第 1 条，在 `id` 这个位置必须用 `constDown` 规则，而这条规则要求先交出一个证明：`h : REntails C Set l`。
- **这个命题的意思**：对**每一个**满足 C 的赋值 ρ，都有 ρ(Set) ≤ ρ(l)。也就是说，无论 l 在允许的赋值下取多少，把 `id` 放到最低的 `Set` 层（Lean level 0）去用都是安全的。
# Rocq Universe 的建模

```
RLevel ──→ RLevelExpr ──→ RUniv ──→ RSort        （语法：宇宙长什么样）
   │
   ├──→ RCon ──→ Constraints ──┐
   │                           ├──→ Sat ──→ REntails   （语义：约束是什么意思）
   └──→ Val ───────────────────┘
```

- **RLevel / RUniv / RSort**：描述宇宙的写法
- **RCon / Constraints**：描述 level 之间的约束
- **Val / Sat / REntails**：考虑所有可能的赋值，用约束表筛选出允许的赋值；在所有允许的赋值下都成立的不等式，就是约束表能推出的结论。
---
## 1. RLevel：基本 level

```lean
inductive RLevel where
  | set                     -- Set：最小的 level
  | global (name : String)  -- 全局单态 level，比如 Universe l. 里的 l
  | var (i : Nat)           -- 宇宙多态常量的第 i 个变量
  deriving DecidableEq
```

- 对应项目中 `IR.Level` 的三个层级构造器：`set | global (name) | var (idx)`。
- RLevel 只是一个名字，本身没有大小，也没有"实际值"。在不同的赋值 ρ 下，它可以取不同的值；模型考虑的是**所有满足约束表 C 的赋值**。
---
## 2. RUniv：level 表达式
Rocq 的宇宙可以写成 `Type@{max(l+1, m)}` 这种形式，也就是若干个"level + 偏移"取最大值。

```lean
structure RLevelExpr where
  level  : RLevel
  offset : Nat              -- 偏移，Rocq 里一般是 0 或 1

abbrev RUniv := List RLevelExpr   -- 整体表示列表中所有元素取 max
```

| Rocq 写法               | RUniv                                  |
| --------------------- | -------------------------------------- |
| `Set`（= `Type@{Set}`） | `[⟨.set, 0⟩]`                          |
| `Type@{l+1}`          | `[⟨.global "l", 1⟩]`                   |
| `Type@{max(l+1, m)}`  | `[⟨.global "l", 1⟩, ⟨.global "m", 0⟩]` |

---
## 3. RSort：宇宙 （类型的类型）

```lean
inductive RSort where
  | prop                    -- Prop
  | type (u : RUniv)        -- Type@{u}；Set 就是 type [⟨.set, 0⟩]
```
类型规则中用到的两个运算：

```lean
-- Sort 自身的类型：Type@{u} : Type@{u+1}，Prop : Type@{Set+1}
def RSort.succ : RSort → RSort
  | .prop   => .type [⟨.set, 1⟩]
  | .type u => .type (u.map fun e => { e with offset := e.offset + 1 })

-- ∀ x : A, B 的 Sort（其中 A : s₁，B : s₂）
def RSort.prodSort : RSort → RSort → RSort
  | _,       .prop   => .prop            -- 返回值是命题，整体就是命题（Prop 非直谓）
  | .prop,   s       => s                -- 参数是命题，结果的层级就是返回类型
  | .type u, .type v => .type (u ++ v)   -- max(u, v)：两个列表拼接
```

---
## 4. RCon 和 Constraints：约束

```lean
inductive RCon where
  | le (a b : RLevel)       -- a ≤ b
  | lt (a b : RLevel)       -- a < b，即 a + 1 ≤ b
  | eq (a b : RLevel)       -- a = b

abbrev Constraints := List RCon
```
约束来自 `universe_facts`，每一行形如 `{"l": a, "rel": "lt", "r": b}`

```lean
例子
def C₁ : Constraints :=
  [.lt .set (.global "l"),            -- Set < l：声明全局 level 时产生
   .lt .set (.global "m"),
   .lt (.global "l") (.global "m")]   -- l < m：比如 Definition T : Type@{m} := Type@{l} 产生
```

---
## 5. Val：赋值与求值

```lean
abbrev Val := RLevel → Nat
```

`Val` 是一个**类型**，表示"所有从 RLevel 到 Nat 的函数"。
ρ 是这个类型中的**某一个具体函数**，也就是给每个 level 指定一个自然数的一种方式。

ρ₁ 和 ρ₂ 的类型都是 `Val`，但它们是两个不同的函数：

```
ρ₁：Set ↦ 0, l ↦ 2, m ↦ 5
ρ₂：Set ↦ 0, l ↦ 1, m ↦ 7
```
后面所有的结论，都是对**任意一个满足 C 的 ρ** 成立。Rocq 也不会给 level 分配数字，所以不存在"l 实际等于几"。
### 求值

```lean
-- 求一个 "level + 偏移" 的值
def RLevelExpr.eval (ρ : Val) (e : RLevelExpr) : Nat :=
  ρ e.level + e.offset    -- 先查出 level 在 ρ 下对应几，再加上偏移

-- 求整个 max 表达式的值：对每一项求值，取最大值
def RUniv.eval (ρ : Val) (u : RUniv) : Nat :=
  u.foldl (fun acc e => max acc (e.eval ρ)) 0
```

例：在 ρ₁ 下，`max(l+1, m)` = max(2+1, 5) = 5。
### 约束在 ρ 下是否成立

```lean
def RCon.holds (ρ : Val) : RCon → Prop
  | .le a b => ρ a ≤ ρ b
  | .lt a b => ρ a + 1 ≤ ρ b
  | .eq a b => ρ a = ρ b
```

---
## 6. Sat：赋值满足约束表

```lean
def Sat (ρ : Val) (C : Constraints) : Prop :=
  ρ .set = 0 ∧ ∀ c ∈ C, c.holds ρ
```

要求①：Set 是最小的 level，因此 Set 取 0
要求②：约束表 C 中每一条都成立

### 约束表必须一致

```lean
def Consistent (C : Constraints) : Prop := ∃ ρ, Sat ρ C
```

**为什么需要 `Consistent C`：**`REntails C …` 的意思是："**所有**满足 C 的赋值都让不等式成立。"如果 C 自相矛盾，满足 C 的赋值一个都没有，`REntails` 就会对**任何**不等式都成立，连 `l < l` 也"成立"。所以要用 `Consistent C` 作前提，排除这种空洞的结论。

---
## 7. REntails：约束表能推出的不等式
### 基本形式：两个基本 level 之间

```lean
def REntails (C : Constraints) (a : RLevel) (k : Nat) (b : RLevel) : Prop :=
  ∀ ρ, Sat ρ C → ρ a + k ≤ ρ b
```

`REntails C a k b` 的意思是：对任意一个赋值 ρ，只要 ρ 满足约束表 C 里的所有约束，那么在 ρ 下都有 `ρ a + k ≤ ρ b`。换句话说，**只凭约束表 C，就能推出 `a + k ≤ b`**。

| 性质                                        | 需要的条件   | 例子                                                   |
| ----------------------------------------- | ------- | ---------------------------------------------------- |
| `Type@{a}` 里的东西可以当作 `Type@{b}` 里的东西用（累积性） | `a ≤ b` | `nat : Set`，因为 `Set ≤ l`，所以 `nat` 也算 `Type@{l}` 里的东西 |
| `Type@{a}` 这个宇宙本身是 `Type@{b}` 里的一个元素      | `a < b` | `Type@{l} : Type@{m}` 需要 `l < m`                     |

`id nat` 用的是第一种：`REntails C Set 0 l`。
### 例子 1：Set ≤ l 不需要查约束表

```lean
theorem ex1 : REntails C₁ .set 0 (.global "l") := by
  intro ρ ⟨hset, hC⟩
  omega                     -- ρ Set = 0，而自然数都 ≥ 0
```

### 例子 2：把两条约束串起来

```lean
def C₂ : Constraints :=
  [.lt (.global "k") (.global "m"), .le (.global "m") (.global "l")]

theorem ex2 : REntails C₂ (.global "k") 1 (.global "l") := by   -- k + 1 ≤ l
  intro ρ ⟨_, hC⟩
  have h1 := hC (.lt (.global "k") (.global "m")) (by simp [C₂])  -- k < m
  have h2 := hC (.le (.global "m") (.global "l")) (by simp [C₂])  -- m ≤ l
  simp [RCon.holds] at h1 h2
  omega                                                          -- k + 1 ≤ m ≤ l
```

### 推广到 level 表达式之间

```lean
-- 在约束 C 下，u ≤ v
def REntailsU (C : Constraints) (u v : RUniv) : Prop :=
  ∀ ρ, Sat ρ C → u.eval ρ ≤ v.eval ρ
```





