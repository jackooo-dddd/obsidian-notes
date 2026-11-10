```lean
def Rocq.count.{u_197} (A : Type u_197) (l : Rocq.list.{u_197} A) : Rocq.nat :=
  Rocq.length.{u_197} A l
```
“实参”指的是**Universe 实参**，也就是填进被调用声明的 **Universe 参数**里的 Level，而不是普通的函数参数。以 `len_nat` 为例：

```lean
Rocq.length.{0} Rocq.nat l
--          ↑    ↑        ↑
--   Universe 实参   普通参数（A := nat，l := l）
```

- `Rocq.length` 有一个 **Universe 参数** `u_197`。调用时写在 `.{…}` 里的 `0` 就是填给它的 **Universe 实参**，这一节讲的就是它从哪里来。
- `nat` 和 `l` 是 `length` 的**普通参数** `A`、`l` 的实参。它们直接由 Step 5 翻译源中的 `app` 节点得到，和这一节无关。

所以那句话可以写成：

> 在被翻译的声明中，每调用一次别的声明，都要为被调用声明的每个 Universe 参数填一个 Level，也就是 `Rocq.length.{…}` 花括号中的部分，这就是 Universe 实参。调用 Monomorphic 声明时，AST 中并没有给出这些 Level，所以 Translator 要自己找：先查表，查不到再新建元变量。

---

**没写出来的 Level：先查表，查不到才现场新建**

`length` 的 Lean 签名是 `Rocq.length.{u_197} (A : Type u_197) …`，它在 Step 8 被接受时登记了：**第 0 个参数代表源 Level 197**。

引用 `length` 时，AST 中只有 `const length []`，Instance 是空的，扫描这个节点得不到任何 Level。所以 Step 5 翻译到这个引用时，Translator 先查登记，知道要为 197 填一个实参，再去查当前声明的 `gl` 表：
- **197 在表里** → 直接用表中的元变量（复用）；
- **197 不在表里** → 为这一处新建一个元变量。
#### 情况一：复用，197 是 `count` 自己的 Level

```coq
Definition count (A : Type@{197}) (l : list A) : nat := length l.
```

```text
Step 4：扫描 Type 和 Body
        A : Type@{197} 中写出了 197          → own = [197]
        const length [] 中没有 Level
        gl = { 197 ↦ ?m }

Step 5：Type@{197}       → Type ?m
        const length []  → 查登记：length 的参数代表 197
                         → 查表：197 在表里，用 ?m
                         → Rocq.length.{?m} A l

Step 6：?m 仍然自由，并且出现在类型中      → 成为参数 u_197

Step 7：R3 检查 length 的实参：
        197 是 count 的 own level，实参必须就是 u_197 → 通过
```

```lean
def Rocq.count.{u_197} (A : Type u_197) (l : Rocq.list.{u_197} A) : Rocq.nat :=
  Rocq.length.{u_197} A l
```

**说明**：在 Rocq 中，`count` 和 `length` 用的是同一个全局 Level 197。翻译后，两者在这里也用同一个 Lean 参数 `u_197`，“同一个 Level”的关系得到保留。
#### 情况二：新建，`len_nat` 中没有 197

```coq
Definition len_nat (l : list nat) : nat := length l.
```

```text
Step 4：扫描 Type 和 Body
        没有任何地方写出 197                → own 中没有 197
        gl 中没有 197

Step 5：const length []  → 查登记：length 的参数代表 197
                         → 查表：197 不在表里，新建一个元变量 ?k
                         → Rocq.length.{?k} nat l

Step 6：类型检查：length 要求 A : Type ?k，实际传入 nat : Type 0
        → 统一得到 ?k := 0

Step 7：R3 检查 length 的实参 0：
        197 不是 len_nat 的 own level，实参不能超过 Rocq 允许的范围
        Rocq 能推出 Set ≤ 197                → 通过
```

```lean
def Rocq.len_nat (l : Rocq.list.{0} Rocq.nat) : Rocq.nat :=
  Rocq.length.{0} Rocq.nat l
```

**说明**：在 Rocq 中，这里用的仍然是 197，`nat` 借助 Cumulativity（`Set ≤ 197`）被“抬”了上去。Lean 没有 Cumulativity，于是改为把 `length` 直接实例化到 `nat` 所在的 Level 0。这个 0 是类型检查解出来的，所以还要经过 R3 检查，确认它没有超出 Rocq 允许的范围。
#### 对比

|                  | `count`               | `len_nat`            |
| ---------------- | --------------------- | -------------------- |
| 项中是否写出了 197      | 是（`A : Type@{197}`）   | 否                    |
| 197 是否在 `gl` 表里  | 是：`197 ↦ ?m`          | 否                    |
| 引用 `length` 时的实参 | 复用表里的 `?m`            | 新建 `?k`              |
| Step 6 的结果       | `?m` 成为参数 `u_197`     | `?k := 0`            |
| Step 7 的 R3 要求   | 实参必须**就是** `u_197`    | 实参**不超过** Rocq 允许的范围 |
| 保留下来的关系          | 与 `length` 是同一个 Level | 只保留上界 `≤ 197`        |