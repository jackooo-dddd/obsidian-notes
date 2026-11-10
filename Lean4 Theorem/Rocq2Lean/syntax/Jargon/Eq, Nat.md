## 1. nat ↔ Nat（两个构造器）

Rocq
```
Inductive nat : Set :=
| O : nat
| S : nat -> nat.
```

Lean 4
```
inductive Nat : Type where
| zero : Nat
| succ : Nat → Nat
```
两边构造器一一对应：

|Rocq|Lean|含义|
|---|---|---|
|`O : nat`|`Nat.zero : Nat`|自然数 0|
|`S : nat → nat`|`Nat.succ : Nat → Nat`|给自然数加 1|

例如，数字 2 的构造方式：
```
Rocq: S (S O)
Lean: Nat.succ (Nat.succ Nat.zero)
```

因此，Bootstrap Mapping 定义：
```
nat ↦ Nat
O   ↦ Nat.zero
S   ↦ Nat.succ
```

## 2. eq ↔ Eq（一个构造器）

Rocq
```
Inductive eq (A : Type)
    (x : A) : A -> Prop :=
| eq_refl : eq A x x.
```
- 定义了一个归纳命题 `eq`，可以用来表达两个元素相等。所以只有满足了里面eq_refl的定义，才能说明这个eq proposition是被证明的？
- `: A -> Prop` 表示 `eq` 还需要接收一个类型为 `A` 的参数，才能返回一个 `Prop`。
- 整个 `eq` 的类型实际上是 `eq : forall (A : Type), A -> A -> Prop`
Lean 4
```
inductive Eq {α : Sort u}
    (a : α) : α → Prop where
| refl : Eq a a
```
`eq` 和 `Eq` 都只有一个构造器，用来证明一个元素与自身相等。

| Rocq      | Lean      | 含义             |
| --------- | --------- | -------------- |
| `eq_refl` | `Eq.refl` | 构造 `x = x` 的证明 |

```
| eq_refl : eq A x x.
```
- 对任意 `x : A`，都可以直接构造一个 `eq A x x` 类型的证明。
- `eq_refl` 是证明 `eq` 命题的唯一构造器。它的作用是：对于任意类型 `A`，以及任意元素 `x : A`，我们都可以构造一个证明，说明 `x` 等于它自己。因为 `eq_refl` 只能直接构造 `eq A x x`，所以它可以证明 `3 = 3`，但不能证明 `3 = 5`。
- 例如 `eq_refl 3 : eq nat 3 3` 说明了 `eq_refl 3` 是 `3 = 3` 的一个证明对象。
这里有个很重要的区别：
- `eq` 用于描述相等这个命题。
- `eq_refl` 用于构造相等命题的证明。