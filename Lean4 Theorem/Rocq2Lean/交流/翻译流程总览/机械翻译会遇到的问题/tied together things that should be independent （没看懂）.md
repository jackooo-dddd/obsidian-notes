The problem in plain words:
1. **Rocq has one universe graph for the whole development.** If one file needs `51 ≤ 101` and another needs `101 ≤ 51`, Rocq concludes that 51 and 101 are the same level. Across the corpus, 232 levels end up all equal this way.
2. **Lean has no global graph.** Each declaration has its own independent parameters. To stay faithful, the translator writes such a level as `max(u51, u101)`.
3. **This tied together things that should be independent.** `ProcessorState` mentions `Job` (level 51) and `Core` (level 101), two independent types. Through the `max`, they became linked in Lean. When `processor_state` set `Core := unit` (level 0), `Job` was dragged down to 0 too. That narrows a protected statement, so it was refused.
4. **It also spread.** The old check refused `max` arguments, so the translator filled in a default 0, which later caused a refusal in `factory_66`. That one failure blocked 712 roots.
**In Rocq:**
- Once both facts (`51 ≤ 101` and `101 ≤ 51`) are in the graph, 51 and 101 are the same level for everything loaded after them, not just in some files.
- That does no harm, because in Rocq a level is only an upper bound. `Job : Equality.type@{51}` accepts any carrier whose type sits at level 51 or below. `Core : …@{101}` likewise. `unit : Set` fits under both.
- So equal levels never force `Job` and `Core` to be the same size. Each can still be anything below the shared bound.

**In Lean:**
- There is no global graph, so the translator turns each global level into a universe parameter of each declaration.
- There is no cumulativity either, so a level is the exact universe of the carrier, not a bound.
- To stay faithful to the facts, the translator wrote such a level as `max(u51, u101)`. That made the two carriers depend on the same parameters. Fixing one (`Core := unit` at 0) then dragged the other (`Job`) to 0.
- So the Rocq fact “these bounds are equal” turned into “these types live in exactly the same universe”. That is a much stronger claim, and the statement became narrower.

**So the precise version of your sentence:**
- Lean doesn’t need to set them equal. Doing that is exactly what narrows the statement.
- Merging the whole group into one parameter was the failed repair R2F-eq.
- The working fix was rule R. It leaves the carriers as separate parameters, so `Job` and `Core` stay independent. It only accepts an argument like `max(u51, u101)` when Rocq’s facts make it equal to `u51` in every case.
Rule R changes both how the translator builds level arguments and what the check accepts. The decoupling itself comes from the first part. My earlier line “change the check, not the representation” was too loose. The accurate version: the final Lean form doesn’t change (separate parameters, no merged group, no lift), but how the translator builds level arguments does. I’m going from docs/COHERENCE_READINGS.md §6 here, not the code.

**Part 1: how the translator builds level arguments (this is what makes `Job` and `Core` independent).**

- **One fresh variable per occurrence.** Before rule R, every occurrence of a shared level (51, 101, …) inside a declaration was tied to the same level variable. A new retry tier now gives each occurrence its own fresh level variable.
- **Typing decides; leftovers go back.** Unification then runs. An occurrence gets a different value only if typing forces it. Every variable typing leaves free is bound back to the declaration’s own level parameter (the doc calls this `rebindShared`).
- **Effect on `processor_state`.** `Core := unit` now pins only the occurrence at `Core`’s position to 0. `Job`’s occurrences have their own variables, so they stay at `Job`’s parameter. Before, the shared `max(u51, u101)` reading dragged both down together.
- **Blocks (inductive types) work the same way.** Each binder and field keeps its own plain parameter. The `max` reading is used only for the arity’s final sort, where it is provably equal to the source’s level.

**Part 2: what the check accepts.**

- With fresh variables, some occurrences are still solved as expressions like `max(u51, u101)`. The old coherence check accepted only exactly `u51`, so it refused these and fell back to defaults such as 0. That default 0 is what spread to `factory_66`.
- The rule: an argument is accepted for level `l` if it equals `l` in every assignment of levels that satisfies Rocq’s facts. Rocq’s facts force 51 = 101, so `max(u51, u101)` always equals `u51` and is accepted with no default.
- This is implemented twice, independently: in the translator (`equalAtModels`) and in the audit (`equal_at_models`).

So Part 1 stops `Job` and `Core` from being tied together. Part 2 stops the remaining `max` terms from being refused and replaced with a default 0. Neither part alone would have fixed `processor_state` and `factory_66`.

## Global Universe Equality 与 Cumulativity：Plain Levels、Per-occurrence Levels 和 Rule R

在 Rocq → Lean Translation 中，真正困难的不是表达 Global Universe Equality，而是**在保留 Global Levels 相等的同时，不错误地限制不同输入类型的实际 Universe Levels**。
这个问题需要两部分共同解决：
- Part 1（Construction）：Plain Carrier Parameters + Per-occurrence Levels，避免输入层级被不必要地绑定。
- Part 2（Checking）：Rule R，接受有 Source Universe Facts 依据的 `max` Interpretation。
### 1. 区分 Global Universe Level 与实际 Carrier Level

假设 Rocq Global Universe Graph 中：

$$
L_{51}\leq L_{101},\qquad L_{101}\leq L_{51}
$$

因此：

$$
\boxed{L_{51}=L_{101}=L}
$$

但对于实际输入 `Job` 和 `Core`，设它们的 Universe Levels 分别为 $\alpha$、$\beta$。Rocq Cumulativity 只要求：

$$
\alpha\leq L_{51},\qquad \beta\leq L_{101}
$$

即：

$$
\boxed{\alpha\leq L,\qquad\beta\leq L}
$$

**不能推出 $\alpha=\beta$。**

例如，`Core := unit` 只说明 Core 的实际 Level 为 `Set`（Lean Level `0`），并要求 $0\leq L$。它不意味着 $L=0$，也不意味着 Job 的实际 Level 必须是 `0`。

因此，需要区分：
- Global Level `L`：两个 Carrier 位置允许使用的共同 Universe 上界。
- Actual Levels `α`、`β`：两个输入类型实际所属的 Universe，可以彼此不同。

### 2. Part 1：避免在 Lean 的 Carrier Types 中错误绑定 Levels

旧翻译可能产生：

```lean
Job  : Type (max a b)
Core : Type (max a b)
```

Lean 不支持 Rocq 那样的隐式 Universe Cumulativity，因此两个 Carrier 被要求属于同一个精确 Universe。

如果 `Core := Unit`，Lean Type Checking 可能要求：

$$
\max(a,b)=0
$$

这又会将 `Job` 的 Universe 错误限制为 `0`。

仅仅放宽 R3 Coherence，甚至只创建新的 Metavariables，都无法修复已经绑定的接口：

```lean
Job  : Type (max ?a ?b)
Core : Type (max ?a ?b)
```

因为两个输入仍然共享相同的 Level Expression。

#### 2.1 Plain Carrier Parameters

修复方式之一是在适用的 Inductive Block 翻译路径中，为独立 Carrier 保留 Plain Parameters：

```lean
Job  : Type a
Core : Type b
```

而整个 Inductive 的最终 Result Sort 仍然可以使用 R2F Interpretation：

```text
Binder / Field Carrier Levels → Plain Parameters
Inductive Final Result Sort  → R2F max Interpretation
```

这样就不会把结果 Sort 所需的 Global Universe 关系，不必要地施加到两个独立 Carrier 的精确层级上。

#### 2.2 Per-occurrence Metavariables

另一个修复是在 Constant References 处使用 Per-occurrence Levels。

`sharedOrFreshLevels` 在 `sharedFresh` 模式下，会为每次适用的引用创建新的 Metavariable，例如：

```text
Job 相关引用：?job
Core 相关引用：?core
```

Lean Type Checking 可以分别求解：

```text
?job  := uJob
?core := 0
```

而不会仅仅因为源 Global Levels 相等，就强迫 `uJob = 0`。

对于没有被 Typing 决定的 Levels，翻译器再通过 `rebindShared` 等机制恢复必要的共享关系。因此，Per-occurrence 并不是永久拆开所有 Global Levels，真正需要一致的引用仍然必须保持 Coherence。

### 3. Part 2：Rule R 接受合法的 `max` Reading

经过 Part 1 的构造和求解，部分 Constant References 仍然会使用：

```lean
max u51 u101
```

但它对应的源 Global Level 可能是 `L51`。

旧的 Coherence 检查可能要求 Universe Argument 必须直接是 `u51`，因此拒绝 `max u51 u101`。

Rule R 放宽的是这个检查：只要目标 Level Expression 在所有满足 Source Facts 的赋值下，都表示所要求的源 Level，就可以接受。

例如：

$$
F_{\mathrm{Rocq}}\models
\max(L_{51},L_{101})=L_{51}
$$

因为源 Facts 已经证明：

$$
L_{101}\leq L_{51}
$$

所以该等式成立。这里甚至不需要两个源 Levels 完全相等；单向的 `L101 ≤ L51` 就足够。

需要注意，Rule R 并不是要求 Lean Kernel 认为：

$$
\max(u_{51},u_{101})\equiv u_{51}
$$

对任意独立参数都成立。

Rule R 检查的是 Source Facts 下的语义对应关系；Lean Declaration 本身仍然需要通过 Kernel Type Checking。

### 4. 为什么必须同时使用两部分？

| 机制 | 解决的问题 | 单独使用的局限 |
|---|---|---|
| Plain Carrier Parameters + Per-occurrence Levels | 防止 `Core := Unit` 不必要地将 `Job` 限制为 Level `0` | 合法的 `max` Reading 仍可能被旧 Coherence 检查拒绝 |
| Rule R | 接受 Source Facts 支持的 `max` Universe Argument | 无法自动拆开已经共享同一精确 Level 的 Carrier Types |

因此，Part 1 负责构造更一般的 Lean 类型接口，Part 2 负责验证这些接口中使用的 Universe Interpretations。

还需要澄清：Rule R 失败并不是直接将 `max` 替换为 `0`。真正的问题是较一般的候选翻译被旧检查拒绝后，翻译器可能退回到包含 Universe Defaults 的其他路径，从而逐步造成下游 Generality 的损失。例如文档中的 `Countable → ordinal.{0} → factory_66` 传播链。

## 总结

整个问题可以归纳为三个不同层次：

1. Source Equality：Rocq 的 Global Facts 证明 $L_{51}=L_{101}$，R2F 可以用相同的 `max` Interpretation 表示。
2. Input Independence：即使 Global Levels 相等，实际 Carrier Levels $\alpha$、$\beta$ 也不必相等。Plain Parameters 和 Per-occurrence Levels 防止它们被错误绑定。
3. Reference Coherence：Rule R 允许有 Source Facts 依据的 `max` Reading，同时继续要求 Lean Kernel 检查目标声明。

**最核心的区别是：Global Universe 上界相等，不代表实际输入类型的精确 Universe Levels 必须相等。**

对应实现：
- [Translate.lean — sharedOrFreshLevels、checkInstantiation](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)
- [Emit.lean — Inductive Construction / Universe Solving](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean)
- [COHERENCE_READINGS.md — Rule R](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/COHERENCE_READINGS.md)