### Why translation gets slower as the library gets bigger
**The short version:** total time ≈ number of declarations × attempts per declaration × time per attempt. In a bigger library, all three grow at once, and they multiply.
#### An everyday picture

Think of filling in a huge Sudoku, where the cells are universe levels and the rules are Rocq’s universe constraints.

- We don’t search the puzzle cleverly. We have a short list of prepared strategies (the ladder).
- For each strategy, we write out the whole grid and then check every rule. If a rule breaks, we throw the grid away and try the next strategy.
- Each try has a stopwatch. When time runs out, the try counts as failed.

A small library is a small puzzle: the first strategy usually works, and writing the grid out takes milliseconds. A large library is a giant puzzle, and everything below gets worse at the same time.
#### The four effects

**1. More declarations, so more puzzles.**
- The Corelib test had 1,029 statements.
- The Prosa corpus needs about 11,000 declarations, including about 5,100 from MathComp.
- All of MathComp has about 22,000 source declarations, before Hierarchy-Builder generates its many extra ones.  
    Every declaration goes through the ladder on its own.

**2. Each declaration is bigger, so each try is slower.**
- MathComp builds structures in layers: equality → choice → modules → rings → ordered → numeric.
- The generated obligations deep in this stack restate all the layers below them. So the higher a structure is, the bigger its terms, and the longer one Lean elaboration takes.
- A simple Corelib lemma takes milliseconds. A numeric-hierarchy obligation takes **10–20 seconds per try**: one was stopped at 9 s, another succeeded after 14.7 s, and one variant was stopped at 21.9 s.

**3. More universe levels per declaration, so far more possible answers.**
- A simple lemma has 1–3 levels. A deep MathComp obligation has dozens; one has 34 copies of a single Hierarchy-Builder level alone.
- Each level can take several values: its own parameter, equal to another level, lowered, or 0.
- With 3 options per level, 5 levels give 243 combinations, and 30 levels give about 200 trillion. (This is an illustration of growth, not the exact count the translator faces.)
- The ladder tries only a fixed handful of strategies. As the number of possible answers explodes, it becomes more and more likely that the right answer is not among the first strategies, or is reached only after the stopwatch runs out.
- A hard declaration already goes through more than ten tries. One numeric obligation was tried at least 11 times.

**4. More files, so more rules, which also take longer to check.**
- Rocq keeps one universe graph for the whole development, and every file adds constraints to it.
- More constraints means more ways for a quick guess to break one. It also means each check (“does Rocq allow `a ≤ b`?”) has more to look through.
- In the current corpus, one group of 232 levels is already forced equal across files.
#### What this looks like in real runs
- **Half the time is wasted.** In one full run, **49%** of all attempt time went to strategies on terms where no strategy ever succeeds. The ladder can’t tell in advance that a term is hopeless.
- **Many failures are just time-outs.** In that run, 115 of 238 failing declarations had a try stopped by the stopwatch, 98 of them in MathComp’s numeric hierarchy. When we re-ran the timed-out tries with more time, 100 more declarations translated (the audit question on those is still open).

## Rocq → Lean Translation：为什么 Library 扩大后运行时间增长很快？

Library 扩大后，Translation Time 不一定与 Declaration Count 成正比。原因不仅是需要翻译的 Declarations 更多，还可能出现一批单次处理成本很高的复杂声明，而 Retry Ladder 会对这些声明反复执行 Translation 和 Type Checking。

当前证据主要支持：**昂贵的 Declarations × 多次 Retry × Resource Limits，是 Translation Time 增长的重要原因。** 但还不能据此认定整个翻译器具有指数时间复杂度。

### 1. Translation Time 由什么决定？

可以用下面的模型近似描述总时间：

$$
\boxed{
T_{\text{translation}}
\approx
T_{\text{preparation}}
+
\sum_{d=1}^{N}\sum_{j=1}^{A_d}C_{d,j}
+
T_{\text{other}}
}
$$

| 符号 | 含义 |
|---|---|
| $N$ | 需要处理的 Declarations 数量，包括依赖 |
| $A_d$ | Declaration `d` 实际执行的 Translation Attempts 数量 |
| $C_{d,j}$ | Declaration `d` 的第 `j` 次 Attempt 的处理成本 |
| $T_{\text{preparation}}$ | 翻译前的准备成本 |
| $T_{\text{other}}$ | 其他未计入单次 Attempt 的开销 |

因此，总时间取决于三个主要因素：Declaration Count、每个 Declaration 的 Attempt Count，以及每次 Attempt 的实际成本。

Library 变大直接增加的主要是需要处理的声明数量，但不意味着所有声明都会更复杂。例如，新增大量简单 Definitions，可能只造成近似线性的时间增长；新增少数大型 HB Obligations，却可能显著增加总时间。

另外，`1,029 statements` 与 `11,000 declarations` 不是同一个统计口径。比较时必须确认是否包含 Definitions、Inductive Blocks、Generated Obligations 和 Dependencies，以及被依赖阻塞而没有真正执行 Translation 的记录。当前实现会对部分依赖失败的声明提前返回，并非每条记录都完整执行 Retry Ladder。

### 2. 为什么某些 Declarations 特别昂贵？

#### 2.1 处理成本取决于 AST，而不是源码行数

翻译器处理的是 Exporter 导出的 Type AST 和 Body AST，其中包含 Binder Types、Applications、Universe Instances、Projections、Pattern Matching 等结构。

例如，MathComp 的一些 HB Numeric-hierarchy Obligations，即使 Rocq 源文件中的声明看起来不长，Elaboration 后的 Type AST 也可能包含复杂的类型参数、结构实例和依赖关系。

因此，真正决定 Translation 成本的是目标表达式的规模、类型关系的复杂度，以及 Type Checking 所需的计算，而不是 `.v` 文件的行数。

不过，依赖多个 Declarations 不代表翻译器一定会展开它们所有的 Bodies。一般的 Constant References 仍然保留为引用，只是在 Definitional Equality 或特定 Inline 路径中可能需要进一步计算。

更准确地说：Library 扩大后可能引入一批远比普通声明昂贵的生成项，而不是所有 Declarations 都同时变大。

#### 2.2 一次 Attempt 的成本不仅是 Universe Solving

一次 Translation Attempt 的成本可以概念性地拆成：

$$
C_{d,j}
=
C_{\text{term construction}}
+
C_{\text{type checking}}
+
C_{\text{universe/interface checks}}
+
C_{\text{kernel checking}}
$$

实际执行可能提前失败，因此不是每个 Attempt 都会走完全部阶段。

当前 `processConstant` 使用 `IO.monoMsNow` 记录整个 `processConstantCore` 的执行时间，包括表达式构造、Type Checking、Universe Solving 和其他检查。

因此，如果某个 Attempt 花费 15 秒，不能直接得出 Universe Solver 花费 15 秒的结论。

要判断具体瓶颈，还需要进一步测量：
- Term Construction
- `Meta.check` / Definitional Equality
- Universe Level Solving
- Universe / Interface Checking
- Kernel Checking

这一区别非常重要。如果主要成本来自反复检查大型 Term，那么只优化 Level Selection，却依然重复完整 Type Checking，可能无法获得明显加速。

### 3. Retry Ladder 如何放大运行时间？

当前 Translator 会为一个 Declaration 尝试不同的 Translation Strategies，例如：

```text
同一个 Source Declaration
          │
          ├── R2S / Plain Translation
          │     └── Type Checking → Failed
          │
          ├── R2F-c / Fact Interpretation
          │     └── 再次 Translation + Checking
          │
          ├── Cumulativity / R3↓
          │     └── 再次 Translation + Checking
          │
          ├── Per-occurrence Unification
          │     └── 再次 Translation + Checking
          │
          └── 其他特殊 Retry
                └── Accepted / Failed / Resource Limit
```

这些 Attempts 使用不同 Flags 重新进入 `processConstantCore`。部分策略还会改变目标 Term，例如 Inline、`PULift` 或其他 Representation Transformations。

因此，问题不只是多尝试几个 Universe Levels，而是这些选择可能需要重新进行昂贵的 Translation 和 Type Checking。

需要注意：
- 不是每次都重新翻译整个 Dependency Closure；已经翻译成功的依赖通常以目标签名形式复用。
- Ladder 会跳过部分不适用的策略，并在合适的时候停止。
- 部分已成功的 Definitions 仍可能重试，以减少 Defaulted Levels 或改善 Universe Generality。

所以，额外 Attempts 并不全部是无意义的开销，有些是为了保证翻译结果的质量。

#### 3.1 项目中的实际计时数据

`UNIVERSE_SOLVER_PROPOSAL.md` 记录了 S17 Run 的 Translation Attempt Time：

| Attempt 类型 | 时间 | 占比 |
|---|---:|---:|
| 每个 Declaration 的 First Attempt | 5,253 秒 | 32% |
| Universe-only Retry Tiers | 2,742 秒 | 17% |
| Term-changing Tiers（包含部分 Universe Variants） | 8,373 秒 | 51% |

这说明大量时间不仅花在首次翻译，还花在后续 Retry Attempts 上。其中 Term-changing Tiers 尤其昂贵，因为不同 Universe Variants 可能需要重复处理相同或相近的大型 Terms。

该 Proposal 也记录了少数大型 HB Declarations 集中消耗时间的现象，其中一个 Declaration 的处理时间达到 881 秒。

因此，对 Translation Time 的分析不能只看平均值，还需要关注最昂贵的 Declarations 及其 Attempt Count。

### 4. 为什么少数困难 Declarations 可以主导总时间？

以下数字仅用于说明机制，并非实际 Benchmark：

| Declaration 类型 | 数量 | 平均 Attempts | 每次成本 | 总成本 |
|---|---:|---:|---:|---:|
| 简单 Declarations | 1,000 | 1 | 0.01 秒 | 10 秒 |
| 困难 Declarations | 100 | 10 | 15 秒 | 15,000 秒 |

虽然困难声明的数量不到总数的十分之一，却几乎占据全部运行时间。

因此，Library 扩大后，总时间增长可能主要来自少数昂贵声明，而不是所有声明的平均成本同时增加。

比起只统计 Declaration Count，更重要的是分析：
- 最昂贵的 Declarations 有多少？
- 它们各自执行了多少 Attempts？
- 哪些 Tiers 消耗最多时间？
- 哪些 Attempts 最终成功，哪些没有产生成功候选？

这也是为什么当前 `tier_times` 很有价值。

### 5. Universe Levels 更多，会导致指数增长吗？

更多 Universe Levels 和 Constraints 确实可能增加处理难度，但不能直接认为当前 Translator 在执行指数规模的搜索。

假设有 30 个 Levels，每个都有 3 种独立选择，那么理论组合数为：

$$
3^{30}=205891132094649
$$

但这只是一个假设的搜索空间，不代表当前 Translator 实际枚举了这些组合。

项目中的 Universe Levels 分为不同类别：
- Public Universe Parameters：需要满足 Generality Requirements。
- R2F Readings：根据 Source Facts 决定。
- Template Levels：根据实际参数决定。
- Body-only Levels：通过 Unification / R2B 求解。
- R-SPLIT / R-CARRIER Copies：受到 Representation Rules 限制。
- Residual Levels：需要合法的 Default Justification。

因此，Levels 并不是每个都拥有三个完全自由的选择。

当前 Retry Ladder 主要枚举预先定义的 Translation Strategies，再由各个策略内部的 Unification 和 Universe Checking 求解 Levels，而不是遍历所有可能的 Level Assignments。

真正可能增加成本的是：
1. Levels 通过 `max`、Equality 和 Type Constraints 产生更复杂的相互关系。
2. 简单策略更容易失败，需要执行更多 Retry Tiers。
3. 单轮 Type Checking 和 Level Solving 可能更昂贵。
4. 某些 Attempts 消耗完 Resource Budget，仍未得到结果。

同样，新增 Constraints 不一定总是增加求解难度。它们也可能排除部分选择，让 Solver 更容易确定答案。

因此，34 个 Universe Copies 或更多 Levels 是值得监测的复杂度指标，但不能单独证明运行时间具有指数增长趋势。

### 6. Resource Limits 如何增加时间成本？

某些 Translation Attempts 并不是没有合法解，而是 Resource Budget 不足以完成。

例如，记录中的 `factory_14` obligation 142：

```text
较小预算：
  运行约 9 秒
  Resource Limit，未完成

较大预算：
  同一个 Variant 运行约 14.7 秒
  Translation 成功
  Consumer / Audit 通过
```

这个例子表明，原来的 Attempt 并非必然无法翻译，而是未能在分配的资源预算内完成。

当前 `Emit.lean` 中，`budgeted` 为部分 Late-tier Attempts 使用独立的 Heartbeat Budget：

```lean
withTheReader Core.Context
  (fun c => { c with maxHeartbeats := c.maxHeartbeats / 5 })
  (withCurrHeartbeats x)
```

如果 Attempt 超出预算，就恢复状态，并记录 `RESOURCE_LIMIT`，之后仍可尝试其他 Tiers。

需要注意，Heartbeat Budget 不是严格的 Wall-clock Timeout。因此，观测到的 9 秒不是固定的 9 秒截止时间。

#### 6.1 为什么 Time-out 会造成重复成本？

因为一个 Attempt 被中止后，下一次 Retry 不会从原来的中止位置继续。

例如：

$$
9+14.7=23.7\text{ 秒}
$$

这两次 Attempts 就已经消耗约 23.7 秒，还没有计算其他 Retry Tiers。

但增加 Resource Budget 不一定意味着更快。它可能让部分原本失败的 Attempts 成功，也可能让最终仍然失败的 Attempts 消耗更多资源。

因此，提高 Budget 首先是 Coverage 与 Resource Cost 之间的权衡，而不是必然的性能优化。

另外，出现 `RESOURCE_LIMIT` 不代表 Declaration 的所有失败都由预算造成；它可能同时存在 Typing、Universe Facts 或 Interface Rejection 等问题。

### 7. Global Universe Facts 是否因为 Library 变大而越来越慢？

这一点需要区分，因为当前项目已经对 Universe Relation 查询进行了优化。

`IR.lean` 中的 `UniverseFacts` 包含：

```lean
index : Std.HashMap (String × String) String
```

正常情况下，查询 `a ≤ b` 等关系时，可以通过索引读取对应结果，而不需要每次扫描完整的 Universe Relations Table。

例如：

```lean
f.index.getD (a, b) "none"
```

因此，不能简单认为 Library 变大后，每一次 Universe Relation Check 都要遍历更大的 Graph。

更大的 Global Universe Graph 仍然可能增加以下成本：
- Exporter 计算和导出 Native Universe Facts。
- 构建 Universe Facts Index。
- 保存更多 Universe Relations。
- 更复杂的 Declarations 触发更多 Relation Checks。

但当前正常路径中的单次关系查询已经被索引化。

因此，不能仅仅因为 Source Graph 包含大量 Levels，或者有 232 个 Levels 在源 Facts 下相等，就断定 Global Relation Lookup 是 Translation Time 增长的主要瓶颈。

真正需要测量的是：单轮 Attempt 具体调用了多少次 Universe Checks，以及这些 Checks 在总时间中占多少比例。

### 8. 当前测量能够支持哪些结论？

当前测量表明，Translation Time 有相当一部分被昂贵的 Retry Attempts 消耗，但仍需要区分两件事。

第一，没有产生成功结果的 Attempts，并不一定是可以全部删除的无效工作。例如，一份运行分析中记录了约 49% 的时间没有直接产出成功结果，但某些 Attempts 可能通过增加 Budget 成功。因此，要安全地提前终止，需要可靠的 Conflict / Unsatisfiability 判断，而不能仅凭过去失败过就跳过。

第二，出现 Time-out 不代表 Time-out 是唯一失败原因。例如，记录中有 115 个失败 Declarations 出现过 Time-out，但不能据此推断这 115 个声明全部只需增加 Budget 即可解决。同样，扩大预算后新增的 Producer-side Results，如果尚未通过 Consumer 和 Independent Audit，也不能直接计入最终有效 Coverage。

所以，当前最可靠的判断是：**Retry Ladder 对部分大型声明重复执行昂贵的 Translation / Checking，是重要的时间放大因素；Resource Limits 又进一步增加了失败与重试成本。**

但究竟哪个阶段最昂贵，还需要对 Attempt 内部进行更细的 Profiling。

### 9. 下一步最值得测量什么？

项目已经记录了 `tier_times`，其中包含每个 Attempt 的 Tier、耗时和结果，因此可以先分析：

| 指标 | 要回答的问题 |
|---|---|
| Declaration Total Time | 哪些声明消耗最多时间？ |
| Attempt Count | 哪些声明反复执行最多 Tiers？ |
| Time per Tier | 哪些 Translation Strategies 最昂贵？ |
| Attempt Status | 时间主要消耗在成功、拒绝还是 Resource Limit？ |
| Defaulted Levels | 哪些额外尝试用于减少 Defaults？ |
| Phase Timing | Term Construction、`Meta.check`、Level Solving 和 Kernel Checking 各占多少？ |

`UNIVERSE_SOLVER_PROPOSAL.md` 提出使用 Per-declaration Universe Solver，将部分 Universe Assignment Choices 联合求解，减少对同一个 Term 进行多轮 Universe-only Retry 的成本。

其核心思路不是重新翻译整个 Dependency Closure，而是利用已经翻译好的 Dependency Signatures，为当前 Declaration 联合求解 Universe Constraints，再保留现有的 Kernel、Source Facts 和 Interface Audit。

不过，Solver 本身也有成本，而且并非所有昂贵的 Term-changing Tiers 都能被它消除。因此，实际加速效果仍然需要 Benchmark，而不能只根据减少了多少 Attempts 推断。

## 总结

Library 扩大后，Translation Time 可能增长得比 Declaration Count 更快，主要涉及四个因素：

1. Declaration Count 增加：需要处理更多 Definitions、Inductive Blocks 和 Obligations。
2. Cost per Attempt 增加：复杂的 HB / MathComp Declarations 可能具有更昂贵的 AST Translation 和 Type Checking。
3. Retry Amplification：多个 Universe Strategies 可能反复处理同一个大型 Declaration。
4. Resource Limits：部分可成功 Attempts 被提前中止，之后重新尝试造成额外成本。

因此：

$$
\boxed{
\text{Translation Time}
\approx
\text{Declaration Count}
\times
\text{Attempts per Declaration}
\times
\text{Cost per Attempt}
}
$$

这只是一个概括性模型，并非严格复杂度公式。

当前证据支持 Retry Amplification 和昂贵声明是重要的性能问题，但还不能证明整个 Translator 具有指数时间复杂度，也不能将已索引化的 Global Universe Relation Lookup 视为主要瓶颈。

最重要的优化方向是：识别少数最昂贵的 Declarations，分析哪些 Translation / Checking 工作被重复执行，再通过 Per-declaration Universe Solving、受控的 Candidate Reuse 和更精细的 Phase Profiling 减少重复成本，同时保留原有的 Universe、Interface 和 Kernel Validation。

### 对应源码与文档

- [UNIVERSE_SOLVER_PROPOSAL.md — Per-declaration Universe Solver](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_SOLVER_PROPOSAL.md)
- [Emit.lean — Retry Ladder、Budgeted Attempts、Tier Timing](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean)
- [IR.lean — UniverseFacts Index](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/IR.lean)
- [UNIVERSE_TRANSLATION.md — Universe Solving Rules](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_TRANSLATION.md)