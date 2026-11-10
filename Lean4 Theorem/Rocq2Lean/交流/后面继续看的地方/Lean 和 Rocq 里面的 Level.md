## Rocq：Level 是带约束的名字
**1. Level 是一个有名字的对象，没有具体的数值**

在 Rocq 里写 `Type` 时，Rocq 会自动新建一个 Level，并给它起一个名字：

```coq
Definition length (A : Type) (l : list A) : nat := …
(* Rocq 实际记下的是：A : Type@{Corelib.Init.Datatypes.197} *)
```

“197” 只是这个 Level 的编号式名字，不代表“第 197 层”。你无法问 Rocq“197 等于几”。用 `Print Universes` 查看，只能看到它和别的 Level 的关系：

```text
Set < Corelib.Init.Datatypes.197
Corelib.Init.Datatypes.198 <= Corelib.Init.Datatypes.197
```

**2. 关系放在一张全局约束图里，Rocq 随时检查整张图是否一致**

约束从哪来？每当 Rocq 需要给一个参数类型指定一个level的时候，它就会**记下一条约束**，而不是报错。比如：

```coq
Definition promote (A : Type@{u}) : Type@{v} := A.
(* A 在 Type@{u} 中，却要放进 Type@{v} → Rocq 记下约束 u ≤ v，接受这个定义 *)
```

所有文件、所有声明产生的约束，都放进**同一张图**。只要加入一条约束会让整张图产生矛盾，Rocq 就拒绝。

**3. Level 可以是全局的，也可以是某个声明自己的变量**

```coq
(* 单态：u 是全局的，id1 和 id2 共享同一个 u *)
Universe u.
Definition id1 (A : Type@{u}) (a : A) := a.
Definition id2 (A : Type@{u}) (a : A) := a.

(* 多态：w 属于 pid 自己，每次使用都会换成新的 Level *)
Polymorphic Definition pid@{w} (A : Type@{w}) (a : A) := a.
(* pid@{Set} 和 pid@{w'} 是两次不同的实例化 *)

(* 多态声明还可以带自己的局部约束 *)
Polymorphic Definition promote@{u v | u <= v} (A : Type@{u}) : Type@{v} := A.
```
---
## Lean：Level 只有三种形式，没有“全局 Level”
### 1. Level 的三种形式
Lean 中任何一个 Level，都是下面三种之一：

|形式|写法|例子|含义|
|---|---|---|---|
|**具体的值**|`0`、`1`、`2`…|`Type`（即 `Type 0`）、`Type 1`；`Sort 0` 就是 `Prop`|固定在某一层|
|**参数**|声明名字后面的 `.{u}`|`def f.{u} (A : Type u) …`|这个声明自己的一个“待定的层”，只在这个声明内部有意义|
|**表达式**|用前两种组合|`u + 1`、`max u v`、`imax u v`|比如“比 u 高一层”“u、v 中较高的那层”|

除此之外没有第四种：Lean 里**不存在**一个属于整个环境、被多个声明共享的 Level。

例子（三种形式都用到）：

```lean
def natList : Type := List Nat                       -- 具体的值：固定在 Type 0
def pairType.{u, v} (A : Type u) (B : Type v)        -- 参数：u、v
    : Type (max u v) := A × B                        -- 表达式：max u v
```

判断两个 Level 是否相等，Lean 是**把表达式化简后比较**，不查任何约束图。比如 `max u u` 就是 `u`，`max u 0` 就是 `u`，`imax u 0` 就是 `0`；而 `u` 和 `v` 是两个不同的参数，永远不相等。
### 2. 在声明内部：参数是“对任意取值都要成立”的未知数
声明 `.{u, v}` 时，Lean 对 `u`、`v` 一无所知，也不允许你说明它们之间的关系。所以这个声明必须对 `u`、`v` 的**每一种取值**都成立：

```lean
def promote.{u, v} (A : Type u) : Type v := A
-- error: type mismatch，A 的类型是 Type u，期望的是 Type v
```

`Type u` 和 `Type v` 只有在 `u = v` 时才相等，并不是对所有取值都成立，所以被拒绝。Rocq 遇到同样的写法会记下约束 `u ≤ v` 并接受；Lean 则没有地方写这条约束。想让它成立，只能改写参数本身，比如把结果改成 `Type (max u v)`，再用 `ULift` 把 `A` 抬上去。

### 3. 在使用时：每次引用都要把参数换成一个实参
引用一个带参数的声明时，要给它的每个参数填一个 Level，可以是三种形式中的任意一种：

```lean
def myId.{u} (α : Sort u) (a : α) : α := a

#check myId.{1} Nat 3          -- 填具体的值：u = 1（Nat : Type = Sort 1）
#check myId Nat 3              -- 不写，Lean 自动推出 u := 1
#check myId.{2} Type Nat       -- 这一次 u = 2（Type : Sort 2）

def useId.{w} (β : Type w) (b : β) : β :=
  myId.{w + 1} β b             -- 填调用者自己的参数组成的表达式：u = w + 1
```

需要注意两点：
- **一次引用里，参数只有一个值**。比如在 `myId.{1} Nat 3` 中，`myId` 的整个类型都按 `u = 1` 来读，不能这一处算 1、那一处算 2。
- **不同的引用之间互不影响**。同一个文件里可以既有 `myId.{1}`，又有 `myId.{2}`；`myId` 本身的定义也不会因此改变。


|想表达的|Rocq|Lean|
|---|---|---|
|“把 `Type@{u}` 里的东西放进 `Type@{v}`”|自动记下约束 `u ≤ v`，接受|拒绝：Level 必须完全相等|
|“这个 Level 和那个文件里的是同一个”|用同一个全局 Level（如 197）|做不到：只能各自一个参数，引用时传过去|
|“`v` 至少和 `u` 一样大”|写约束 `u <= v`|不能写约束，只能把 `v` 换成 `max u v`|
|“这个声明在任意层都能用”|写成 Polymorphic，或者靠 Cumulativity|默认就是：所有声明都可以带参数|
|“Level 到底是几”|永远不知道，只知道关系|要么是具体的数，要么是参数或表达式|

一句话总结：**Rocq 的 Level 是一个“全局约束系统里的未知数”，大小关系可以事后由 Rocq 自动补上；Lean 的 Level 是“写在声明里的显式参数”，每处都必须写准，而且写不了任何大小关系。**