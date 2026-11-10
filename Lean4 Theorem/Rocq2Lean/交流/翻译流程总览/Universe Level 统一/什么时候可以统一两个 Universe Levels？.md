判断 Universe Levels 能否安全统一，关键在于统一后是否会限制原本合法的公开输入，以及是否改变 Declaration 的公开接口。
- 如果两个 Universe Levels 分别对应两个独立输入，那么将它们统一为 `u = v`，可能会限制原本允许的输入组合，造成 Generality Loss。
- 但在其他常见情况下，例如一个 Level 对应输入 `A`，另一个 Level 对应被调用 Constant 的 Universe Instance，后者通常只是用于确定该 Constant 能否接受 `A`。如果这个 Constant 可以在 `A` 的 Universe Level 上实例化，那么将两个 Levels 统一，就不会限制原本合法的输入范围。
因此，重点不只是两个 Levels 是否存在约束，而是它们是否分别控制需要保留独立性的公开接口，还是其中一个仅用于适配另一个。
通常需要区分以下四种情况。
### 情况 1. Input Level + Constant Reference Level
Rocq 中：
```coq
Definition relation (A : Type) := A -> A -> Prop.

Definition equiv (A : Type) (R : relation A) := R.
```
概念上涉及两个 Levels：
- `u`：输入类型 `A` 所属的 Universe。
- `v`：被引用的 `relation` 所期望的 Universe。
Rocq 可以利用 Cumulativity 满足：
$$
u\leq v
$$
如果 `relation` 已经被翻译为支持 Universe Instantiation 的 Lean Declaration，那么翻译器可以尝试：
```lean
relation.{u} A
```
这相当于在本次引用中选择 `v = u`，使 `relation` 的参数类型与实际输入 `A` 匹配。

为什么可能允许？因为 `v` 主要用于适配被引用 Constant 的参数，而不是控制另一个独立的输入类型。只要引用的其他 Universe Requirements 不受影响，这种实例化通常不需要限制 `A` 的范围。

不过，具体检查取决于源 Constant：
- Polymorphic Constant：R6 保留 Rocq Elaboration 已确定的 Universe Instance。
- Monomorphic Constant：目标 Generalization 后可以通过 Unification 求解引用 Level，但必须通过 R3 的 Coherence / No-Raising 检查。
### 情况 2. 两个独立的 Input Levels
Rocq 中：
```coq
Polymorphic Definition foo@{u v}
    (A : Type@{u})
    (B : Type@{v}) := ...
```
这里 `u` 和 `v` 分别控制两个输入类型。
例如，原本允许：
```text
A : Type 0
B : Type 1
```
如果翻译器将它们统一：
```lean
def foo.{w}
    (A : Type w)
    (B : Type w) := ...
```
那么两个输入必须属于同一 Universe，原本允许的不同 Universe 组合可能无法再使用。
因此，如果 Rocq 没有要求 `u = v`，通常不能直接合并两个独立的 Input Levels，否则会损失 Universe Generality。项目使用 `binderIndependence` 等机制保护 Statement 和 Protected Definition 的输入接口。

### 情况 3. Input Level + Output Type Level
普通 Definition 的返回值通常不需要引入独立的较高 Universe，例如：
```coq
Polymorphic Definition id@{u}
    (A : Type@{u}) (x : A) : A := x.
```
返回值类型仍然是 `A`，因此只需要 `u`。
即使返回值本身是一个 Type，也可以直接使用输入的 Universe：
```coq
Polymorphic Definition myRelation@{u}
    (A : Type@{u}) : Type@{u} :=
  A -> A -> Prop.
```

但有些 Type-valued Definitions 会明确保留更高的 Output Universe，例如：
```coq
Polymorphic Definition promote@{u v | u <= v}
    (A : Type@{u}) : Type@{v} := A.
```
这里：
- `u`：输入 `A` 的 Universe。
- `v`：返回类型被声明所在的 Universe。
Rocq 允许：
$$
u\leq v
$$
如果翻译为：
```lean
def promote.{u}
    (A : Type u) : Type u := A
```
虽然没有限制输入 `A`，却降低了 Result Sort，使目标不能直接保留原本 `u < v` 时较高的返回 Universe。
因此，对于 Input + Output Type：
- 如果结果本来就由输入 Universe 决定，通常不需要另一个独立 Level。
- 如果源声明明确保留了较高的 Result Universe，不能随意合并。
- 项目可以在满足条件时采用 R2B-V Lowering，或者利用 Universe Interpretation + `PULift` 保留较高的输出 Universe。
### 情况 4. Body-only Universe Levels
例如：
```coq
Universe u v.
Constraint u <= v.

Definition f (A : Type@{u}) (x : A) : A :=
  let B : Type@{v} := A in x.
```
这里 `u` 出现在公开 Type 中，`v` 只用于 Body 内部的局部定义。
因此，翻译器可以尝试：
$$
I(u)=\alpha,\qquad I(v)=\alpha
$$
得到：
```lean
def f.{u} (A : Type u) (x : A) : A :=
  let B : Type u := A
  x
```
这种统一不直接改变公开输入和返回类型，因此通常比合并独立 Input Levels 更灵活。
但 R2B 仍然需要检查源 Universe Facts。例如，`u ≤ v` 允许选择相等，而 `u < v` 不允许直接令 `v = u`。

## 总结：不同 Universe Levels 能否统一？

| 两个 Levels 的作用 | 能否统一？ | 主要原因 |
|---|---|---|
| Input + Constant Reference | 通常有条件允许 | 引用 Level 可以适配实际输入，需通过 R3 / R6 |
| 两个独立 Inputs | 通常不可以 | 可能限制合法的输入 Universe 组合 |
| Input + Output Type | 需要额外判断 | 可能降低公开 Result Universe |
| Public Level + Body-only Level | 通常较灵活 | 不一定改变公开接口，但必须满足 R2B / Source Facts |

### 对项目中 Solved Levels 的理解
**如果统一只是在适配已有输入或求解内部 Level，通常更容易被允许；如果统一限制了两个独立输入，或者降低了原本需要保留的输出 Universe，就必须更加谨慎。**
此外，即使 `u ≤ v` 允许 `u = v`，也不代表永久合并两者能够保留源声明的全部 Universe Generality。