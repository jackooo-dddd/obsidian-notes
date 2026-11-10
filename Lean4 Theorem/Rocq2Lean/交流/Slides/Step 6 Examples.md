## Step 6 ①、②、③ Examples
下面三个例子分别对应 Step 6 的 ①、②、③ 三步，说明 Lean 的统一怎么解出 Level 元变量。
### ① 检查类型表达式（Type）
```coq
Definition firstLen (A : Type@{197}) (l : list A) (k : list nat) : nat := …
```
翻译后，类型表达式中有两处 `list`，它们的 Level 各是一个空位（示意）：
```lean4
∀ (A : Type ?m) (l : Rocq.list.{?x} A) (k : Rocq.list.{?y} Rocq.nat), Rocq.nat
```
Lean 检查类型表达式时会遇到两次函数调用：

- `Rocq.list.{?x} A`：`list` 要求参数在 `Type ?x` 中，传入的 `A` 在 `Type ?m` 中。两边都空着，于是连在一起：`?x := ?m`。
- `Rocq.list.{?y} Rocq.nat`：`list` 要求参数在 `Type ?y` 中，传入的 `nat` 在 `Type 0` 中。一边固定，于是解出：`?y := 0`。

这一个例子里，两种情况都出现了：一个空位被连到另一个空位上，另一个被解成了具体的值。
### ② 检查值表达式（Value）
**例子一：被解成具体的值**
```coq
Definition len_nat (l : list nat) : nat := length l.
```
```text
Value：fun l => Rocq.length.{?k} Rocq.nat l

调用 length 时，它的第一个参数 A 要求的类型是 Type ?k；
实际传入的是 nat，而 nat 的类型是 Type 0。
为了让两者一致，Type ?k 必须等于 Type 0  →  ?k := 0
```
**例子二：同一个类型放进两次调用，两个空位被连在一起**
```coq
Definition count3 (A : Type@{197}) (l : list A) : nat := length l + size l.
(* size : ∀ (B : Type@{300}), list B → nat *)
```
```text
Value：fun A l => Rocq.length.{?m} A l + Rocq.size.{?j} A l
调用 length：length 要求 Type ?m，A 的类型也是 Type ?m
            （count3 和 length 在 Rocq 中用的是同一个 Level 197，所以共用 ?m）
            → 两边已经相等，不需要解；?m 仍然空着
调用 size：  size 要求 Type ?j，A 的类型是 Type ?m
            （size 的 Level 300 不是 count3 自己的，所以新建了 ?j）
            → 两个不同的空位，连在一起：?j := ?m
```
同一个 `A` 被传给了两个函数，所以这两次调用的 Level 必须一样。
### ③ 对齐值表达式和类型表达式
```coq
Definition natList : Type@{198} := list nat.
```
```text
Type：   Type ?n                      -- 198 是 own level，先放空位 ?n
Value：  Rocq.list.{0} Rocq.nat       -- Value 整体的类型是 Type 0

对齐：Value 整体的类型 Type 0 必须等于声明类型 Type ?n  →  ?n := 0
```
在 Rocq 中，`list nat` 在 `Set` 中，靠 Cumulativity 放进了 `Type@{198}`。Lean 没有 Cumulativity，只能让两边完全相等，于是 198 被解成 0。



## Step 6 ⑤  Examples

用 `count`来展示什么时候元变量成为参数：

```coq
Definition count (A : Type@{197}) (l : list A) : nat := length l.
```

翻译到 Step 6 的 ⑤ 时，项是这样的：

```text
Type：   ∀ (A : Type ?m) (l : Rocq.list.{?m} A), Rocq.nat
Value：  fun A l => Rocq.length.{?m} A l
gl = { 197 ↦ ?m }
```

`?m` 三个条件都满足：
1. **是本声明自己的 Level**。197 直接写在 `count` 的声明类型里（`A : Type@{197}`），所以 Step 4 扫描时把它收进了 own，并为它建了 `?m`。`?m` 不是引用 `length` 时现场新建的：引用时 197 已经在表里，复用的正是这个 `?m`。
2. **统一之后还空着**。①–③ 中，Lean 检查了 `A : Type ?m`、`list.{?m} A`、`length.{?m} A l`，每一处都是 `?m` 和 `?m` 自己比较，没有任何地方要求它等于某个具体的值或另一个 Level。所以 Lean 对它没有任何要求，它一直空着。
3. **出现在类型表达式里。**`?m` 出现在 `count` 的声明类型中：第一个参数 `A : Type ?m`，以及第二个参数 `l : list.{?m} A`。调用 `count` 的人要提供 `A`，所以必须看得到“`A` 可以在哪个 Universe”。

于是 ⑤ 把它变成参数：`?m := u_197`。

```lean
def Rocq.count.{u_197} (A : Type u_197) (l : Rocq.list.{u_197} A) : Rocq.nat :=
  Rocq.length.{u_197} A l
```

结果是调用者可以自己选 `u_197`：用 `count` 数 `nat` 的列表，就选 0；数更高层 Universe 中类型的列表，就选更大的值。这和 Rocq 中 `A` 可以是 `Type@{197}` 中任何类型的意思一致。


## Step 6 ⑥ Examples
用一个「不管传进来什么类型，都返回 0」的函数，展示元变量什么时候在 ⑥ 中取默认值 0。
### 例子：`ignoreType` 和 `test`
```coq
Definition ignoreType (A : Type@{197}) : nat := 0.   (* 不管 A 是什么，都返回 0 *)

Definition test : nat := ignoreType unitT.           (* 把 unitT 传进去 *)
```
> [!note] 假设
> 沿用之前的假设：`unitT` 是一个已有的类型，在 `Type@{300}` 中，翻译到 Lean 后是 `Rocq.unitT.{u_300}`，带一个参数。`unitT` 和 `ignoreType` 都是为了说明而假设的。

`ignoreType` 先被翻译。197 出现在它的声明类型里，所以成为参数：
```lean4
def Rocq.ignoreType.{u_197} (A : Type u_197) : Rocq.nat := 0
```
然后翻译 `test`：
```text
Step 4：test 的项里没有写任何 Type → own = []，gl = {}

Step 5：引用 ignoreType：197 不在表里 → 新建 ?k
        引用 unitT：     300 不在表里 → 新建 ?a，得到 Rocq.unitT.{?a} : Type ?a
        ignoreType 要求 A : Type ?k，传入的 unitT 在 Type ?a 中 → ?k := ?a
        得到：Rocq.ignoreType.{?a} Rocq.unitT.{?a}

Step 6：没有任何地方要求 ?a 等于某个具体的值 → ?a 一直空着
        ⑤ ?a 不是 test 自己的 Level，test 的声明类型 nat 里也没有它 → 不成为参数
        ⑥ 取 0
```
最终结果：
```lean4
def Rocq.test : Rocq.nat := Rocq.ignoreType.{0} Rocq.unitT.{0}
```
### 为什么 `?a` 没人约束
在 `test` 里，唯一的约束来自这次调用：传入参数的类型要和 `ignoreType` 要求的一致。但这只是把两个空位连在一起（`?k := ?a`）：

- `ignoreType` 收什么 Universe 的类型都可以；
- `unitT` 也可以放在任何 Universe。

没有任何一处要求它们等于某个具体的值，所以 `?a` 是自由的，一直空到最后。
### 验证：填什么都行
把 0 换成一个新参数 `r`：
```lean4
Rocq.ignoreType.{r} Rocq.unitT.{r}
```
对任何 `r`，Lean 都接受，所以填 0 不影响正确性。这也说明，这个位置填什么值都合法，甚至可以做成参数。
### 为什么不做成参数
做成参数是完全合法的，上面的验证证明的正是这一点。不做成参数，真正的原因是：它没有出现在 `test` 的声明类型里。

- 调用者用不上：`test` 的声明类型是 `nat`，调用 `test` 的人看不到这个 Level，也不需要选它。如果把它做成参数，就会变成 `test.{r} : nat`：调用者必须填一个 `r`，可是填什么都没有区别。
- 和源不一致：Rocq 中的 `test` 本来就没有这样一个 Level，凭空多一个参数，反而和源不一致。

> [!tip] 判断的关键：在不在声明类型里
> 反过来，引用别人时新建的元变量，如果出现在声明类型里，是会成为参数的，这就是 R3G。所以判断的关键是「在不在声明类型里」，而不是「是不是别人的」。
>
> 「声明类型」指整个声明的类型，即声明签名里 `:=` 前面的那部分：每个参数的类型，加上最后的返回类型。详见 [[类型是什么意思 （整个声明的类型）]]。
### 为什么选 0
Step 7 对这类元变量只有一个要求：不超过被引用的那个源 Level（R3，不能「抬高」）。0 一定满足：

- 0 对应的是 Rocq 的 `Set`，而在 Rocq 中每个全局 Level 都严格大于 `Set`；
- 由于 Cumulativity，任何能放进 `Set` 的东西，也都能放进任何一个 `Type@{l}`。

所以对任何被引用的 Level 来说，0 都是一个合法的选择，R3 检查一定通过。
