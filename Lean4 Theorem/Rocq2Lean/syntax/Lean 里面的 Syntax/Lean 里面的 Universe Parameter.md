下面三个例子都沿用同一个 `length`。翻译后它的 Lean 签名是（用 R8 的写法，`Sort 1` 就是 `Type`，`nat` 在 `Sort 1` 中）：

```lean
def Rocq.length.{u_197} (A : Sort u_197) (l : Rocq.list.{u_197} A) : Rocq.nat := …
```

`u_197` 是 `Rocq.length` 自己的参数，代表 Rocq 的全局 Level 197。

---
### 情况 1：不同声明引用同一个带参数的声明，各填各的

```coq
Definition len_nat (l : list nat) : nat := length l.
Definition count (A : Type@{197}) (l : list A) : nat := length l.
```

翻译到 Lean：

```lean
def Rocq.len_nat (l : Rocq.list.{1} Rocq.nat) : Rocq.nat :=
  Rocq.length.{1} Rocq.nat l                    -- 这里给 u_197 填 1

def Rocq.count.{u_197} (A : Sort u_197) (l : Rocq.list.{u_197} A) : Rocq.nat :=
  Rocq.length.{u_197} A l                       -- 这里填 count 自己的 u_197
```

**说明：**
- `len_nat` 中没有 197，所以引用 `length` 时建了一个新元变量。类型检查发现 `A` 是 `nat`，它在 `Sort 1` 中，于是解成 1。
- `count` 中 197 是它自己的 Level，所以传的是它自己的变量，最后成为 `count` 的参数 `u_197`。
- 两处填的值不同，互不影响。`Rocq.length` 的定义也没有被改动，它仍然带着参数 `u_197`，以后谁引用它都可以重新填。
### 情况 2：同一个声明内部共享一个 Level，会一起变

```coq
Definition count2 (A : Type@{197}) (l : list A) (k : list nat) : nat :=
  length l + length k.
```

在 Rocq 中，两次 `length` 用的都是同一个 197。第二次能用在 `nat` 上，是因为 Cumulativity：`nat : Set`，而 `Set ≤ 197`。

**第一次尝试（`c[]`）**：197 是 `count2` 自己的 Level，所以两处引用都传**同一个**元变量 `?m`：

```text
length l：要求 ?m = A 所在的 Level
length k：要求 ?m = nat 所在的 Level = 1
→ ?m := 1，A 的类型也跟着变成 Sort 1
```

得到的结果是（示意）：

```lean
def Rocq.count2 (A : Sort 1) (l : Rocq.list.{1} A) (k : Rocq.list.{1} Rocq.nat) : Rocq.nat :=
  Rocq.length.{1} A l + Rocq.length.{1} Rocq.nat k
```

这比 Rocq 原来的声明**窄**：原来 `A` 可以是 `Type@{197}` 中的任何类型，现在只能是 `Type` 0 中的。接下来怎么处理，取决于 `count2` 是什么：
- **如果它是受保护的声明或一个 Statement**：Step 7 会拒绝，因为源中自由的 Level 197 被固定成了 1。
- **如果它是普通定义**：这次尝试会先被接受。但 tier ladder 的 ⑫ 会再试一次按出现处的翻译，结果更一般就替换掉它。

**按出现处 tier（`unify`）**：每一处引用各建一个元变量，翻译完再对回去：

```text
length l：?m1 = A 所在的 Level → 仍然自由 → 成为 u_197
length k：?m2 = 1
```

```lean
def Rocq.count2.{u_197} (A : Sort u_197) (l : Rocq.list.{u_197} A) (k : Rocq.list.{1} Rocq.nat) : Rocq.nat :=
  Rocq.length.{u_197} A l + Rocq.length.{1} Rocq.nat k
```

Step 7 的 R3 检查确认两个实参都合法：
- 第一处是 `count2` 自己的 `u_197`，与源中的 197 完全一致；
- 第二处是 1，Rocq 能推出 `Set < 197`，所以没有超出范围。
### 情况 3：一个声明被接受时把 Level 定死了，之后都只能用它

```coq
Definition natBox : Type@{197} := list nat.
Definition choose (b : bool) (B : Type@{197}) : Type@{197} :=
  if b then natBox else B.
```

**`natBox` 先被翻译**。在 Rocq 中，`list nat` 在 `Set` 中，靠 Cumulativity 放进了 `Type@{197}`。Lean 没有 Cumulativity，`natBox` 的类型只能和 `list nat` 的类型完全相同，所以 197 被解成了具体的值，不再是参数。假设它就这样被接受了（示意）：

```lean
def Rocq.natBox : Sort 1 := Rocq.list.{1} Rocq.nat      -- 没有参数，Level 定死为 1
```

Step 8 按这个结果登记：`Rocq.natBox` 没有 Universe 参数。

**之后翻译 `choose`。**`if` 的两个分支在 Lean 中必须是同一个类型：

```text
then 分支：natBox : Sort 1         -- 已经定死，没有参数可填
else 分支：B      : Sort ?m        -- ?m 是 choose 自己为 197 建的元变量
→ ?m := 1，于是 B : Type@{197} 被压成了 B : Sort 1
```

在 Rocq 中，`choose` 可以接受 `Type@{197}` 中的任何 `B`。到了 Lean，`B` 只能是 `Sort 1` 中的。这又是一次变窄：
- 如果 `choose` 是受保护的或是 Statement，就被拒绝；
- 如果是普通定义，就以更窄的形式被接受。之后所有引用 `choose` 的声明，又会被它连带限制。

而且**这次没有 tier 能解开**。情况 2 里，问题出在 `count2` 自己内部，可以按出现处重新翻译；而这里，问题出在**已经接受并登记**的 `natBox` 上。`choose` 无论怎么试，拿到的都是一个没有参数的 `Rocq.natBox`。要修，只能回头改 `natBox` 的翻译，但 tier ladder 是“第一个被接受的胜出”，不会回头。

这就是之前讲的 **early success with a bad choice**：错误的选择发生在 `natBox`，暴露却在 `choose` 以及之后的声明中。

我们实验中的真实例子也是这样：S24 中，CoqEAL 的 `refines_apply` 被一个早期 tier 接受了，接受的形式把两个本来独立的 Level（38758 和 38763）合成了一个。它自己通过了，但之后引用它的 `refines_abstr2`、`refine_ltn` 等声明全部失败。后来的修正是把那个早期规则挪到 ladder 的最后。

---

**说明：**`len_nat`、`count`、`count2`、`natBox`、`choose` 都是为了说明机制而构造的例子，Lean 输出是示意。尤其是 `natBox`：197 被解成什么具体值，以及这次解是否能通过 Step 7 的 fact 检查（Rocq 中有 `Set < 197`），要看实际翻译时用的是哪条规则。情况 3 中的真实例子，是 `refines_apply` 那一段。