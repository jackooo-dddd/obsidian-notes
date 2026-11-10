- MathComp 把一个 Type 包装进了一个带有运算和证明的 Structure，而这个 Structure 的 carrier 使用了共享的 Universe Level。
## 之前讨论的普通 Type
例如 Rocq 中：
```
Definition id (A : Type) (x : A) : A := x.
```
它只接收一个类型 `A`，所以没有两个不同输入类型需要共享同一个 Universe Level 的问题。
## 普通 Type 遇到 fixed level 的问题
考虑一个简化的 Rocq 定义：
```
Universe L. # 故意让 `A` 和 `B` 使用同一个 `L`。

Definition combine
    (A : Type@{L})
    (B : Type@{L}) :=
  A * B.
```
- Rocq 仍然可以利用 cumulativity，把较低 universe 的类型传进去，只要它们都不高于 `L`。
但如果机械翻译为：
```
def combine.{u}
    (A : Type u)
    (B : Type u) :=
  A × B
```
那么对于 `combine Task Nat`, 当 `Task : Type u` 且 `u` 保持泛型时，Lean 就会遇到相同的冲突：因为第二个参数 `Nat` 处于 `Type 0`, 所以 `u = 0 `, 翻译后的函数错误地要求 `Task` 和 `Nat` 使用同一个 Universe Level。
- 所以这不是 `eqType` 独有的问题，而是 Rocq 的 cumulativity 加上共享 Universe Level，在 Lean 中无法直接对应的问题。
##  为什么 MathComp 的 `eqType` 更容易遇到这个问题？
因为 `eqType` 不是单纯的 `Type`，而是一个包装类型的 Structure。
```
Record eqType := {
  sort : Type@{L};    # `sort` 是真正被比较的元素类型，也叫 carrier。
  eq_op : sort -> sort -> bool;   # eq_op` 是相等性判断函数。
}. # 真实 MathComp 结构还包含相等判断的正确性证明。
```
- `L` 是 carrier 使用的共享 Universe Level。
- 于是虽然 `nat_eqType`, `task_eqType` 的内部包装的类型不同，但都是 `eqType` 结构。
Rocq 能把 `nat : Set` 放进 `sort : Type@{L}`，是因为 `Set ≤ L`，而不要求 `Set = L`。
不过要注意：Cumulativity 直接作用在这里的 `sort` 字段所接受的类型层级上，并不是说任意两个 `eqType` 结构本身都可以自动相互转换。
当这些结构再经过 `prod_eqType`、`choiceType`、`finType` 等构造和封装时，就产生了更多 carrier level 的关联。
## 为什么 Corelib 没有如此突出？

|Corelib|MathComp|
|---|---|
|主要有 `nat`、`list`、`prod` 等基本类型|大量 `eqType`、`choiceType`、`finType` 等结构|
|很多类型构造器本身支持独立 universe 或 template polymorphism|很多结构的 carrier 使用共享 global levels|
|类型组合通常比较直接|一个结构可能包装另一个结构，形成层级|
|Universe 冲突比较局部|某个低层 carrier 可能通过多层结构影响泛型参数|


### The situation, step by step

**1. In Rocq, every `eqType` uses one shared level.**  
MathComp does not use universe polymorphism. `eqType` (`Equality.type`) has one global level, call it `L`, and every `eqType` in the whole development lives at that same `L`. Rocq’s cumulativity is what makes this work: `nat : Set`, and `Set` counts as smaller than `L`, so `nat` can be packed into an `eqType` at `L`. Rocq never has to choose.

**2. In Lean, that shared level becomes a parameter that has to be filled in.**  
The translator turns `eqType` into `eqType.{u}`. Each use must pick a concrete `u`, and the carrier must live exactly at `Type u`, because Lean has no cumulativity.

**3. The two parts of the pair demand different values.**

prod_eqType.{u} : eqType.{u} → eqType.{u} → eqType.{u}
                    ↑ SporadicTask     ↑ nat_eqType

- `prod_eqType` takes both parts at the same `u`.
- `nat_eqType` packs `Nat : Type 0`, so it is `eqType.{0}`. That forces `u = 0`.
- `SporadicTask` is a protected Prosa statement, and in Rocq it says “a task type at any level”. Forcing `u = 0` would turn that into “a task type at level 0 only”, which is a weaker statement than the original.

So the only valid answer is `u = 0`, and that answer is forbidden.

### Why each existing rule cannot fix it

**Unification and the solver.** These are not the problem. Unification correctly finds the only solution, `u = 0`. A better solver can’t do better, because no other solution exists. A solver can only pick among valid answers, and here the one valid answer is ruled out.

**Narrowing the level (C-PIN, carrier pins).** We do allow fixing a carrier’s level to 0, but only in unprotected declarations, meaning MathComp internals that are only dependencies. Prosa’s `SporadicTask` and `Job` are protected targets. Interface protection (P0) forbids narrowing them, because the translated statement would then mean less than the Rocq one. Allowing it would mean giving up faithfulness, which is a policy choice rather than a missing rule.

**PULift (rule P).** It only lifts `Prop` into `Type`, and `nat` is data, not a proposition. Rule P is safe because proofs carry no information that later code can inspect. Lifting a proposition changes nothing anyone can observe, so no conversions are needed afterwards.

**ULift (proposal 1, the `Type`-to-`Type` lift).** This is the one that could technically solve it: make `nat_eqType` carry `ULift.{u} Nat` instead of `Nat`, so it fits any level `u`. But the carrier is what the whole structure is about:

- The elements become `ULift Nat`, not `Nat`. A statement that says “for `n` in this `eqType`” is now about lifted numbers.
- Each type former used on the carrier (pairs, sequences, functions, `finType`, and so on) needs its own proof that the lifted version matches the original.

Those proofs are corpus proofs, which this project doesn’t write. In my earlier review, I said that value lifts are safe and generic, but that carrier lifts should stay blocked for this reason. You also decided not to implement rule U.

### In one sentence

Rocq silently lets a level 0 type join a higher level, and Lean cannot. Every existing rule either finds only the forbidden answer `u = 0`, or (rule P) does not apply to data. The only real fix is to change how these carriers look in Lean (lifting them, or giving each part its own level), and that changes the translated interface.