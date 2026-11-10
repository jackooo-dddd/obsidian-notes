在 Rocq → Lean Translation 中，Polymorphic Constants 的 Universe Parameters 和每次引用时的 Universe Instances，已经由 Rocq Elaboration 确定。因此，翻译器不需要像处理 Monomorphic Global Levels 那样，重新推断它们的对应关系。

这使得 Polymorphic 的 Universe Mapping 更直接，但在处理 Cumulativity 时，也限制了翻译器调整 Universe Instances 的自由度。

### 1. R6：按照 Rocq 的 Universe Instance 进行翻译

考虑 Rocq 中：

```coq
Polymorphic Definition polyId
    (A : Type) (x : A) : A := x.
```

其类型可以概念性地表示为：

```coq
polyId@{u} :
  forall (A : Type@{u}), A -> A
```

翻译到 Lean：

```lean
def polyId.{v_0}
    (A : Type v_0) (x : A) : A := x
```

这里源 Polymorphic Parameter `u` 对应 Lean Parameter `v_0`。

如果另一个 Declaration 引用：

```coq
polyId@{v} A x
```

那么 Translator 会将已经导出的 Source Universe Instance `v` 转换成相应的 Lean Level：

```lean
polyId.{v_1} A x
```

其中 `v_1` 表示当前 Declaration 中源变量 `v` 的 Lean Interpretation。

项目通过 `transInstLevel` 处理这些 Instances：

| Rocq Universe Instance | Lean Universe Argument |
|---|---|
| `Set` | `0` |
| 当前 Polymorphic Variable `v` | 对应 Lean Parameter 或其 Level Interpretation |
| Global Universe Level `g` | `g` 的 Lean Level Interpretation |

例如，Rocq 明确引用：

```coq
polyId@{Set} nat 3
```

则目标 Universe Instance 是 `0`：

```lean
polyId.{0} Rocq.nat 3
```

关键是：对于源 Polymorphic Constant，R6 按照 Exporter 已记录的 Universe Instance 逐个翻译，而不是重新创建独立的 Metavariables，让 Lean 任意选择更方便的 Levels。

#### 特殊情况：Local Universe Constraints

如果源 Polymorphic Parameters 存在：

$$
u+1\leq v
$$

项目在受支持的 `polyUniverseInterpretation` 路径中，可以构造：

$$
I(u)=a,\qquad I(v)=\max(b,a+1)
$$

因此，最终的 Lean Universe Argument 不一定只是一个单独的 Parameter，也可能是 `max` / `succ` Expression。

但这种 Interpretation 仍然需要保留源 Universe Constraints 和合法的实例化范围，而不是任意改变 Source Instance。

### 2. Polymorphic 整体上减少了 Universe Solving 的复杂度

虽然 Polymorphic 在处理 Cumulativity 时限制更多，但整体上，它的 Universe Translation 通常比 Monomorphic 简单。

因为 Rocq 已经明确给出了 Universe Parameters 和每次 Reference 的 Universe Instance，所以翻译器不需要重新推断这些 Level 的对应关系。

|Universe Translation 环节|Monomorphic|Polymorphic|
|---|---|---|
|Universe Parameters|需要决定哪些 Global Levels 转成 Lean Parameters|Rocq 已经给出，直接映射|
|Metavariables|通常需要，为 Global Levels 寻找 Interpretation|源 Universe Variables 不需要重新创建待求解 Metavariables|
|Unification / Level Solving|需要解决 Level 匹配与约束|通常不需要为源 Polymorphic Levels 做这类求解|
|Generalization|需要检查能否将 Global Levels 变成自由 Parameters|原本已经是 Universe Parameters|
|Universe Instance|可以通过 R3 等规则调整|必须遵循 Rocq 的 Instance|
|Cumulativity|可以尝试 Level Merging、R3↓ 等|主要依赖 Constraint Readings（`max`）或 `PULift`|

需要注意，Polymorphic 并不意味着整个翻译过程中绝对没有 Metavariables。Lean 的 Type Checking 仍可能使用临时 Metavariables，额外引入的 Lean Universe Parameters 也可能需要求解。但对于 Rocq 已明确给出的 Polymorphic Universe Variables，不需要像 Monomorphic Global Levels 那样重新决定其映射。

### 3. 为什么 Polymorphic 的 Cumulativity 反而可能更难？

考虑 Rocq：

```coq
Polymorphic Definition polyId@{k}
    (A : Type@{k}) (x : A) : A := x.

Polymorphic Definition useHigher@{u v | u <= v}
    (A : Type@{u}) (x : A) : A :=
  polyId@{v} A x.
```

这里 Rocq 通过 Cumulativity 允许：

$$
u\leq v
$$

因此，即使 `A` 属于较低的 `Type@{u}`，也可以传给要求 `Type@{v}` 的 `polyId`。

但直接翻译到 Lean：

```lean
def useHigher.{u, v}
    (A : Type u) (x : A) : A :=
  polyId.{v} A x
```

通常无法通过 Lean Kernel，因为：

```text
polyId.{v} 期待 A : Type v
实际 A 的类型是    Type u
```

Lean 不支持 Rocq 那样的一般 Universe Cumulativity，因此不能仅根据 `u ≤ v` 接受这次调用。

#### 为什么不能直接将 `v` 改成 `u`？

对于源 Monomorphic Constant 被 Generalize 后的引用，项目有时可以通过 Unification 和 R3↓，将目标引用的 Level 降低到实际输入的 Level。

但这里 `polyId@{v}` 是 Rocq 已经明确记录的 Polymorphic Universe Instance。如果直接改为：

```lean
polyId.{u} A x
```

就改变了 Source Instance。即使对于简单的 `polyId` 计算结果相同，对于其他 Constants，Universe Instance 还可能影响返回类型、其他参数和后续引用。

因此，R6 不能无条件采用这种替换。

#### 项目如何处理？

针对受支持的 Cumulativity 情况，项目可以尝试：

- `polyUniverseInterpretation`：通过 `max` / `succ` 编码源 Local Universe Constraints。
- `PULift`：对于符合条件的 Type-valued Results，显式包装较低 Universe 的类型，保留较高 Result Universe。
- `type_lift_coercions`：在存在有效 `PULift` 表示的情况下，通过 `PULift.up/down` 处理部分下游函数参数和返回值的表示差异。

但需要区分：`max` 只能保证 Universe Constraints，不能单独解决 Lean 缺少 Cumulativity 的问题；`PULift` 也不是任意 `Type u` 到 `Type v` 的通用隐式转换。

如果现有规则不能合法处理 Source Universe Instance 和 Lean Typing 之间的冲突，翻译器仍然需要拒绝该候选翻译。

## 总结

Polymorphic Constants 对 Universe Translation 的影响主要体现在两个方面：
1. Universe Mapping 更确定：R6 直接翻译 Rocq 已经确定的 Universe Parameters 和 Source Instances，不需要像 Monomorphic Global Levels 那样重新进行大量 Level Mapping 和 Generalization。
2. Cumulativity 处理更受限制：由于 Source Instance 已明确，翻译器不能随意通过降低或合并引用 Levels 解决类型不匹配，而需要采用受支持的 Constraint Interpretation、`PULift` 或其他经过验证的转换规则。

因此，可以概括为：

**Polymorphic 减少的是 Universe Instance 的推断工作，但不一定减少 Universe Cumulativity 的处理难度。**

相关源码：
- [Translate.lean — R6 / transInstLevel / transHead](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)
- [UNIVERSE_TRANSLATION.md — R3 / R6](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_TRANSLATION.md)
- [TYPE_LIFT.md — Polymorphic Type Lifting](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/TYPE_LIFT.md)