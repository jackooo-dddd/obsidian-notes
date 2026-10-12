Sort 和 Universe 在 Lean 和 Rocq 里面都有。 它们是类型系统最基础的概念，用来规定一个 Type 本身属于什么类型，以及不同类型处于哪个层级。

简单来说：

- Sort（类别）：用于对类型进行分类，例如区分普通数据类型和逻辑命题。
    
- Universe（宇宙层级）：用于区分不同层级的类型，避免出现类型包含自身而导致的逻辑问题。
    

## 1. 为什么需要 Sort / Universe？

我们先看 Lean 中的例子：

```
#check 5       -- 5 : Nat
#check Nat     -- Nat : Type
#check Type    -- Type : Type 1
#check Type 1  -- Type 1 : Type 2
```

可以理解为：

这里出现了一个问题：`Nat` 是一个类型，那么 `Nat` 自己又属于什么类型？

答案是 `Type`。但 `Type` 自己也是一个类型，所以还需要更高层级的 `Type 1`，以此类推。

这就是引入 Universe hierarchy 的原因。

## 2. Lean 里面有哪些 Sort？

Lean 把所有这些层级统一为 `Sort u`。

|Lean 写法|实际含义|
|---|---|
|`Sort 0`|`Prop`，命题的类型|
|`Sort 1`|`Type 0`，也就是 `Type`|
|`Sort 2`|`Type 1`|
|`Sort 3`|`Type 2`|
|`Sort (u+1)`|`Type u`|

也就是说：

```
Prop   = Sort 0
Type   = Sort 1
Type 1 = Sort 2
Type 2 = Sort 3
```

在 Lean 中，Sort 是最一般的表达方式，Prop 和 Type 都是 Sort 的特殊形式。

![](https://www.google.com/s2/favicons?domain=https://lean-lang.org&sz=32)

Lean Language

比如：

```
#check Nat
-- Nat : Type

#check Nat.zero = Nat.zero
-- Nat.zero = Nat.zero : Prop
```

`Nat` 是数据类型，而 `Nat.zero = Nat.zero` 是一个命题，因此两者属于不同的 Sort。

## 3. Rocq 里面有哪些 Sort？

Rocq 也有 Sort，但采用不同的组织方式。

|Rocq Sort|含义|Lean 对应|
|---|---|---|
|`SProp`|严格证明无关的命题|没有完全相同的独立 Sort|
|`Prop`|普通逻辑命题|`Prop`|
|`Set`|小的数据类型，例如 `nat`、`bool`|通常对应 `Type`|
|`Type@{u}`|带 Universe level 的类型|`Type v`，需要对齐层级|

例如 Rocq：

```
Check 5.      (* 5 : nat *)
Check nat.    (* nat : Set *)
Check bool.   (* bool : Set *)
Check Set.    (* Set : Type *)
Check Prop.   (* Prop : Type *)
```

这里的 `Type` 实际存在不同 Universe level，只是 Rocq 通常会自动推断并隐藏具体层级。

## 4. 对于你的 Rocq → Lean 翻译项目，这意味着什么？

假设 Rocq 里面存在：

```
Definition my_number : nat := 5.

Definition my_prop : Prop :=
  5 = 5.
```

翻译到 Lean：

```
def my_number : Nat := 5

def my_prop : Prop :=
  5 = 5
```

这里不仅需要转换 `nat → Nat` 和 `eq → Eq`，还需要让两边声明的 Sort / Universe 正确对应。

例如：

- Rocq `nat : Set`，Lean `Nat : Type`。虽然 Sort 的名字不一样，但可以通过 trusted mapping 对应。
    
- Rocq `Prop` 和 Lean `Prop` 都用来表示命题，但仍然需要考虑两侧证明系统的语义差异。
    
- Rocq `Type@{u}` 和 Lean `Type v` 不一定能直接使用相同的层级数字，还需要保留原来的 Universe constraints。
    
- Rocq `SProp` 没有直接对应的 Lean 原生 Sort，这也是你之前研究 Lean → Rocq import 时需要特别考虑的地方之一。
    

总结： Sort 用来描述一个类型属于哪一类，Universe 用来描述这个类型处于什么层级。Lean 使用统一的 `Sort u` 体系，而 Rocq 使用 `SProp`、`Prop`、`Set`、`Type@{u}`。对于你的翻译器，这些属于底层必须正确处理的类型系统结构，并不是普通的 definition 或 theorem。