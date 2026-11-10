在当前 Rocq → Lean Translation 项目中，并不是所有 Rocq Universe Levels 都严格对应一个固定的 Lean Level。
最重要的区别是：
- 明确的 `Set`：直接映射为 Lean Level `0`。
- Polymorphic Universe Parameter：通常映射为对应的 Lean Parameter，特殊情况下可以使用受约束的 Level Expression。
- Monomorphic Global Level：通过 R2S / R3 进行 Generalization 和 Reference Checking，不一定保持逐次引用时的数值对应。
### 1. 首先区分 Universe Level 和 Sort
```text
Rocq Universe Level: Set  → Lean Level 0

Rocq Type@{Set}         → Lean Sort 1 = Type 0

Rocq Prop              → Lean Sort 0 = Prop
```
因此，`Set → 0` 指的是 Universe Level 的映射，不代表 Rocq 的 `Set` 被翻译成 Lean 的 `Prop`。
在项目的 `Translate.lean` 中，这两种转换分别由不同函数处理：
```lean
-- Universe Instance
transInstLevel
  | .set => pure .zero
```
而对于 Sort：
```text
Type@{Set} → Sort (0 + 1) → Type 0
```
### 2. Polymorphic Universe Parameter：R6
考虑项目中的 Polymorphic Constant：
```coq
Set Universe Polymorphism.

Definition pid@{u}
    (A : Type@{u}) (a : A) : A := a.
```

其目标 Lean 表示可以简化为：
```lean
def pid.{v_0}
    (A : Type v_0) (a : A) : A := a
```
这里的基本映射是：
$$
u\longmapsto v_0
$$

#### 2.1 调用时明确使用 `Set`
例如：
```coq
pid@{Set} nat 3
```

MetaRocq Exporter 会保存本次引用的 Universe Instance：
```text
Constant: pid
Universe Instance: [Set]
```
Translator 使用 `transInstLevel`：
```lean
| .set => pure .zero
```
因此，目标引用会使用：
```lean
Rocq.pid.{0} Rocq.nat 3
```
即：
$$
\boxed{\mathrm{Set}\longmapsto 0}
$$
这是明确的 Source Universe Instance 与 Lean Level 之间的直接对应。
#### 2.2 如果 Polymorphic Parameters 之间存在 Constraints

例如源声明要求：

$$
u\leq v
$$

在特殊的 R6-I Interpretation 路径中，可以构造：

$$
I(u)=a,\qquad I(v)=\max(a,b)
$$

此时就不再是简单的独立参数映射。

但这种 Interpretation 仍然被设计为保留合法 Source Universe Assignments。例如源实例 `u=0, v=2`，可以选择 `a=0, b=2`，从而得到：

$$
I(u)=0,\qquad I(v)=2
$$

因此，Polymorphic Universe Parameters 的基本映射是一一对应的，但为了保留 Universe Constraints，最终可能使用 `max` / `succ` Expressions。

### 3. Monomorphic Global Level：R2S / R3
与 Polymorphic 不同，Rocq Monomorphic Global Level 不会在每次引用时独立实例化。
例如：
```coq
Universe g.

Definition idG
    (A : Type@{g}) (x : A) : A := x.
```
这里的 `g` 是固定的 Global Universe Level。但项目可能通过 R2S 将其 Generalize，生成：
```lean
def Rocq.idG.{u_g}
    (A : Type u_g) (x : A) : A := x
```
此时 `u_g` 是 Lean Universe Parameter，但它是翻译器引入的 Generalization，并不意味着 Rocq 原本的 `g` 可以逐次实例化。
#### 3.1 两个 Declarations 共享同一个 Global Level
Rocq：
```coq
Definition useG
    (A : Type@{g}) (x : A) : A :=
  idG A x.
```
`useG` 和 `idG` 都使用同一个 Global Level `g`。
普通翻译路径中，`sharedOrFreshLevels` 会复用这个共享 Level 的 Interpretation，因此可以得到：
```lean
def Rocq.useG.{u_g}
    (A : Type u_g) (x : A) : A :=
  Rocq.idG.{u_g} A x
```
这里必须保持 R3 Coherence：源声明共享同一个 Global Level，目标引用也需要使用一致的 Level Interpretation。

#### 3.2 调用者没有直接使用 Global Level `g`

例如：

```coq
Definition useNat : nat :=
  idG nat 3.
```

在 Rocq 中，`idG` 仍然使用 Global Level `g`，并没有因为传入 `nat` 而重新将 `g` 实例化为 `Set`。

但由于：

```coq
nat : Set
```

Rocq 可以通过 Cumulativity 接受该调用。

翻译到 Lean 后，Translator 可能先生成：

```lean
Rocq.idG.{?w} Rocq.nat 3
```

因为目标 `Rocq.nat` 位于 `Type 0`，Lean Unification 可以求得：

$$
?w=0
$$

最终得到：

```lean
Rocq.idG.{0} Rocq.nat 3
```

为什么允许？因为 R3 会检查这次目标实例化是否受到 Source Global Facts 支持。这里需要：

$$
\mathrm{Set}\leq g
$$

这一关系允许目标选择较低的 Level `0`，使 Lean 的参数类型精确匹配。

因此：

| | Rocq | Lean |
|---|---|---|
| `nat` 的 Universe | `Set` | `0` |
| `idG` 使用的 Universe | 固定 Global Level `g` | 目标引用可选择 `0` |
| 为什么合法 | Cumulativity：`Set ≤ g` | Unification + R3 No-Raising |
| 是否表示源 `g = Set` | 否 | 否，只是目标引用的实例 |

这也是为什么 Monomorphic Global Levels 不要求逐次引用时与 Lean Level 数值完全相同。

### 4. 项目到底保证什么？

| 机制 | Universe 对应关系 | 主要保证 |
|---|---|---|
| `transInstLevel` | `Set → 0` | 明确的 Source Instance 直接映射 |
| R6 | Polymorphic Variable → Lean Parameter / Expression | 保留 Source Universe Instances |
| R2S / R2F-c | Global Level → Parameter / Level Expression / Solution | 保留受支持的 Global Universe Relations |
| R3 | 检查 Generalized Constant 的引用实例 | Coherence、No-Raising |
| R5 | Template Inductive 根据实际参数求解 | 遵守 Template Universe Rules |

对于 Global Levels，项目并不要求每次目标引用都使用源 Global Level 名称对应的同一个 Lean Parameter。它允许受 Source Cumulativity 支持的实例化，但必须经过 R3 检查。

对于 R2F-c，还有一个更强的性质：当目标参数使用某个满足 Source Facts 的合法 Assignment 时，构造出的 Level Interpretation 可以恢复对应源 Global Levels 的值。

### 5. 总结

最重要的是区分以下三种情况：

1. 明确的 `Set`：直接翻译为 Lean Level `0`，因此 `Type@{Set}` 对应 `Type 0`。
2. Polymorphic Universe Parameter：R6 按照 Source Instance 翻译；如果存在 Local Constraints，可能使用 `max` / `succ` Interpretation。
3. Monomorphic Global Level：R2S 可以将其 Generalize 成 Lean Parameter；在 Constant References 中，R3 可以允许源 Facts 支持的较低实例化，而不要求数值上一一对应。

所以我们的项目保证的并不是：

$$
\text{每个 Rocq Level 都固定等于某个 Lean Level}
$$

而是：目标 Universe Interpretation 和 Reference Instances 必须满足对应的 Source Universe Constraints、Coherence 和 Generality 检查，并最终通过 Lean Kernel。

### 对应源码

- [Translate.lean — transTypeLevel / transInstLevel](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean#L516-L573)
- [Translate.lean — transHead](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean#L3384-L3405)
- [Translate.lean — sharedOrFreshLevels / checkInstantiation](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)
- [UNIVERSE_TRANSLATION.md — R2 / R3 / R6](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_TRANSLATION.md)
- [Univ.v — Monomorphic Fixture](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/fixtures/universes/Univ.v)
- [Poly.v — Polymorphic Fixture](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/fixtures/poly/Poly.v)