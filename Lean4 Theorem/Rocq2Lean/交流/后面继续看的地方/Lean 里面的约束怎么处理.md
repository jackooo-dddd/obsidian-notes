我们不在 Lean 里加约束。Lean 的声明本来就要对参数的所有取值都成立，所以不需要约束。我们要做的是：确认翻译时选出来的每个 Level 都没有违反 Rocq 的关系，也没有让声明比 Rocq 原来的更窄；只有在声明必须依靠约束才能成立时，才用 max 把这个约束编进 Level 的写法里。

这段话里有四个意思，下面逐个讲，每个配一个例子。
### 一、为什么 Lean 里不需要约束
Lean 检查一个带 Universe 参数的声明时，要求它对参数的**所有取值**都成立。比如：

```lean
def Rocq.polyId.{v_0} (A : Type v_0) (x : A) : A := x
```

Lean Kernel 接受它，意思是：`v_0` 取 0、1、100，或者任何别的 Level，这个声明都是对的。这是最强的保证，所以这类声明不需要任何约束。

反过来，如果某个声明只在“`u ≤ v`”时才成立，Lean 会直接拒绝它，因为 Lean 也会去检查 `u > v` 的情况。所以 Lean 中被接受的声明本来就没有需要约束的地方。我们要操心的不是“在 Lean 里补上约束”，而是另外两件事。
### 二、确认没有违反 Rocq 的关系
翻译时会选出很多 Level：被解出的 own level、引用处的实参、默认值。每一个都要回头查 `universe_facts`，看 Rocq 能不能推出它。

**例 1：引用处的实参，可以更低，不能更高。**

```lean
def Rocq.len_nat (l : Rocq.list.{0} Rocq.nat) : Rocq.nat := Rocq.length.{0} Rocq.nat l
```

`length` 的参数代表 Rocq 的 197，这里填了 0，也就是 Rocq 的 `Set`。查表：Rocq 能推出 `Set ≤ 197`，所以通过。这对应 Rocq 中“`nat` 借助 Cumulativity 被放进 197”。

假如某个翻译让 `length` 的实参变成了另一个 Level 300，而 Rocq 推不出 `300 ≤ 197`，就会被拒绝：

```text
argument u_300: 300 ≤ 197 is not entailed by the source universe graph
```

意思是 Rocq 从来没有在比 197 更高的地方用过 `length`，Lean 也不能这样用。

**例 2：解出来的 own level，要满足它自己的关系。**

```coq
Definition natList : Type@{197} := list nat.
```

Lean 没有 Cumulativity，197 被强制解成 0，也就是 `Set`。但 Rocq 中有 `Set < 197`，这里却成了 `197 = Set`，违反了关系，Step 7 拒绝。
### 三、确认没有变窄
光“不违反”还不够。一个声明可以完全不违反 Rocq 的关系，却比 Rocq 原来的**能用的范围小**。所以还要检查一般性，这对 Statement 和受保护的公开声明是硬性要求。

**例 3：自由的 Level 不能被固定。**

```coq
Lemma length_nil : forall (A : Type@{197}), length (@nil A) = 0.
```

Rocq 中这个定理对 `Type@{197}` 中的**任何** `A` 都成立，197 在源中是自由的。如果翻译时 197 被固定成了 0：

```lean
def Rocq.length_nil.statement : Prop := ∀ (A : Type 0), Rocq.length.{0} A Rocq.nil = 0
```

这个命题不违反任何关系，但它只讲了 `Type 0` 中的类型，比原定理弱。Step 7 的 free-level pin 检查会拒绝它。正确的翻译是把 197 留成参数 `u_197`，让命题对所有层都成立。我们的实验中真实出现过这种拒绝：Prosa 的 EDF `sched_valid` 中，`JobArrival` 的 Level 58 在源中是自由的，翻译时却被解成了 0。

**例 4：两个独立的范围不能被绑在一起。**

```coq
Lemma swap_pair : forall (A : Type@{a}) (B : Type@{b}), …
```

Rocq 中 `A` 和 `B` 可以在不同的层。如果翻译时统一把 `a`、`b` 连成了同一个，命题就只讲“`A` 和 `B` 在同一层”的情况，也变窄了。Step 7 的量化独立检查会拒绝。
### 四、声明必须依靠约束时：用 max 编进去
有些声明在 Rocq 中**必须**靠约束才能成立。照第一部分的说法，直接翻译会被 Lean 拒绝。这时的办法是：不写约束，而是换一种写 Level 的方式，让约束**永远自动成立**。

**例 5：**

```coq
Polymorphic Definition pairIn@{u v | u <= v}
    (A : Type@{u}) (B : Type@{v}) : Type@{v} := prod A B.
```

`prod A B` 在 `max(u, v)` 这一层。Rocq 中因为 `u ≤ v`，所以 `max(u, v) = v`，声明成立。直接翻译：

```lean
def Rocq.pairIn.{v_0, v_1} (A : Type v_0) (B : Type v_1) : Type v_1 :=
  Rocq.prod A B      -- 类型是 Type (max v_0 v_1)，不是 Type v_1：v_0 > v_1 时不成立 → 拒绝
```

把 `v` 读成 `max(v_0, v_1)`：

```lean
def Rocq.pairIn.{v_0, v_1} (A : Type v_0) (B : Type (max v_0 v_1)) : Type (max v_0 v_1) :=
  Rocq.prod A B      -- 类型是 Type (max v_0 (max v_0 v_1)) = Type (max v_0 v_1) ✓
```

这样，不管 `v_0`、`v_1` 取什么值，“`v` 至少和 `u` 一样大”都自动成立，Lean 就接受了。而且没有变窄：Rocq 中任何一组满足 `u ≤ v` 的取值，都可以由 `v_0 = u`、`v_1 = v` 得到（这时 `max(u, v) = v`）。

单态的全局 Level 也有同样的做法：`interp` tier 把 `v` 读成 `max(u_v, u_u)`。

不过 `max` 不是万能的。如果声明靠的是“把低层的东西当作高层的东西用”（Cumulativity），比如 `promote (A : Type@{u}) : Type@{v} := A`，那么光改 Level 的写法不够，还得用 `PULift` 把 `A` 显式抬上去。
### 小结
> Lean 的声明本来就要对参数的所有取值都成立，所以不需要、也写不了约束。翻译时我们做三件事：第一，每个选出来的 Level 都要查 Rocq 的关系，可以更低，不能更高，自己的 Level 之间的关系也不能被破坏；第二，不能让声明比 Rocq 原来的更窄，自由的 Level 不能被固定，独立的范围不能被绑在一起；第三，如果声明必须依靠约束才能成立，就用 `max` 改写 Level，让约束自动成立，同时不丢掉任何原来合法的取值。

（`length_nil`、`swap_pair`、`pairIn` 是为了说明构造的例子；`JobArrival` 那一例来自我们的实验。）