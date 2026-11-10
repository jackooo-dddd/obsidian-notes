在 Rocq → Lean Translation 中，源 Monomorphic Declaration 使用的是 Global Universe Levels，但翻译器可能将这些 Levels Generalize 成 Lean Universe Parameters。
例如：
```coq
Definition id (A : Type) (x : A) : A := x.
```

假设 Rocq 为它创建了 Global Level `g`：
```coq
id : forall (A : Type@{g}), A -> A
```

翻译器可以通过 R2S：
```text
Rocq Global Level g
        ↓
Lean Level Metavariable ?u
        ↓
Unification + Generalization
        ↓
Lean Universe Parameter u
```
最终得到：
```lean
def Rocq.id.{u} (A : Type u) (x : A) : A := x
```
此时，Lean 允许在不同引用中实例化不同的 `u`，但源 Rocq 中的 `g` 仍然是共享的 Global Level，并没有因此变成 Polymorphic Parameter。
因此，项目必须验证这种 Generalization 是否合理。
### Step 1. R2S：将 Global Levels Generalize 成 Parameters
假设源 Rocq 中存在两个 Global Levels：
```coq
Universe g1 g2.
Constraint g1 <= g2.
```
对应的 Universe Fact 为：
$$
g_1\leq g_2
$$
R2S 首先为它们创建临时 Lean Level Metavariables：
$$
g_1\mapsto ?a,\qquad g_2\mapsto ?b
$$
经过 Type Checking 和 `solveLevels`，如果 Levels 仍然需要出现在公开 Type 中，并且能够合法 Generalize，就可以将它们保留为 Lean Universe Parameters：
$$
g_1\mapsto a,\qquad g_2\mapsto b
$$
### Step 2. R2F-c：检查并编码 Global Universe Constraints

如果直接使用独立 Parameters 无法通过 Lean Kernel，项目可以尝试 R2F-c，根据 Source Global Universe Facts 构造 Level Interpretation。

例如：

$$
g_1\leq g_2
$$

可以构造：

$$
\boxed{
I(g_1)=a,\qquad I(g_2)=\max(a,b)
}
$$

这种映射需要满足两个条件。

1. Constraint Preservation：对于任意 Lean Parameters，都有：

$$
a\leq\max(a,b)
$$

因此，原始的 `g1 ≤ g2` 始终成立。

2. Generality：对于任意合法的 Rocq Universe Assignment，例如 `g1=1, g2=3`，只需选择 `a=1, b=3`，就可以恢复相应的源 Levels：

$$
I(g_1)=1,\qquad I(g_2)=3
$$

因此，R2F-c 不会简单地把两个 Levels 合并成同一个 Universe，而是通过 `max` 保留源约束允许的不同层级。

项目中的 `ownLevelInterp` 负责根据 Native Universe Facts 构造这种 Interpretation。对于严格约束 `g1 < g2`，还可以通过 `succ` 表示必要的层级偏移。

### Step 3. R3：检查跨 Declaration 的 Reference Coherence

Monomorphic Global Levels 可能在多个 Rocq Declarations 中被共享，因此仅检查当前 Declaration 的 Type Correctness 还不够。

项目中的实际测试：

```coq
Universe ua ub.
Constraint ua <= ub.

Definition idb
    (A : Type@{ub}) (a : A) : A := a.

Definition usea
    (A : Type@{ua}) (a : A) : A :=
  idb A a.
```

这里源 Global Facts 保证：

$$
ua\leq ub
$$

Rocq 因此允许将 `Type@{ua}` 中的 `A` 传入要求 `Type@{ub}` 的 `idb`。

假设 Lean 中已经生成：

```lean
def Rocq.idb.{u_ub}
    (A : Type u_ub) (a : A) : A := a
```

翻译 `usea` 时，Lean Unification 可能得到：

```lean
Rocq.idb.{u_ua} A a
```

但是源 `idb` 使用的是 `ub`，为什么目标允许选择 `u_ua`？

这就需要 R3（Reference Instantiation）检查：

$$
ua\leq ub
$$

由于 Rocq Native Universe Facts 能够证明这一关系，因此目标选择较低的 `u_ua` 具有源 Cumulativity 的依据。

R3 主要检查两种情况：

| 情况 | 检查方式 |
|---|---|
| 当前 Declaration 与被引用 Constant 共享同一个源 Global Level | 要求使用相同的 Level Interpretation，保证 Coherence |
| 被引用的 Global Level 不属于当前 Declaration | 目标实例必须满足 Source Facts 支持的 No-raising 条件 |

例如，如果 Source Facts 只有 `g1 ≤ g2`，翻译器不能无依据地将对应 `g1` 的引用实例提高到 `g2`，因为这可能改变源 Constant Reference 的 Universe 含义。

项目主要使用 `checkUniverseObligations` 和 `checkInstantiation` 实现这些检查。

### Step 4. 检查 Universe Generality（C / P0）

除了 Source Constraints 和 Reference Coherence，还需要检查翻译器是否错误地限制了原始 Declaration 的 Universe 范围。

例如，源 Rocq 中：

```coq
Definition f (A : Type@{g}) := ...
```

如果 `g` 没有被源 Facts 限定为 `Set`，但翻译器将它固定为：

```lean
def f (A : Type 0) := ...
```

那么原本可以接受更高 Universe 类型的声明，就被限制在 `Type 0`。

因此，项目通过 `freeLevelPin`、Statement Generality 和 Protected Interface Checks 等机制，检查是否出现：
- 本来需要保留的 Universe Level 被错误固定。
- 输入参数的 Universe Requirements 被不必要地限制。
- 受保护的 Theorem Statement 或公开接口发生未经批准的 Specialization。

需要注意，检查 Generality 并不意味着每个 Global Level 都必须成为独立 Parameter。关键是翻译后的接口能否保留源声明要求的合法使用范围，或者是否采用了有明确审计依据的特殊转换规则。

### Step 5. Lean Kernel 与 Independent Audit

最终，项目采用多层验证：

| 检查 | 核心问题 |
|---|---|
| R0 / Source Facts | 导出的 Global Universe Constraints 是否确实来自 Rocq？ |
| R2S / R2F-c | 目标 Parameters 和 Level Expressions 是否正确表示源 Levels？ |
| R2B / Solution Facts | 被 Unification 求解的 Levels 是否满足源约束？ |
| R3 | Constant References 是否保持 Global Level Coherence？ |
| C / P0 | 是否错误缩小公开 Universe Interface？ |
| Lean Kernel | 最终目标 Declaration 是否 Well-typed？ |
| Independent Audit | 是否独立验证了上述翻译规则和 Universe 关系？ |

其中，Exporter 从 Rocq Native Universe Graph 提取 `universe_facts`，再由 Translator 使用这些 Facts 检查 Level Interpretation 和 References。独立 Python Auditor 会重新验证对应关系，而不是仅相信 Translator 的结果报告。

## 总结

Rocq Monomorphic Global Level 转换为 Lean Universe Parameter 的流程可以概括为：

```text
Rocq Global Universe Levels + Constraints
                 │
                 ▼
R2S：创建 Level Metavariables
                 │
                 ▼
Type Checking + solveLevels
                 │
                 ▼
Generalize 成 Lean Universe Parameters
                 │
                 ▼
R2F-c（必要时）
使用 max / succ 编码 Global Facts
                 │
                 ▼
R3：检查跨 Declaration Reference Coherence
                 │
                 ▼
C / P0：检查 Universe Generality
                 │
                 ▼
Independent Audit + Lean Kernel Checking
```

最重要的是：将 Rocq Global Levels Generalize 为 Lean Universe Parameters，并不自动意味着翻译错误。

- 如果 Lean Declaration 对所有参数都合法，且源声明能作为符合 Global Facts 的实例被恢复，那么较强的目标 Generality 可以是安全的。
- 如果目标 Typing 依赖源 Universe Constraints，则可能需要 R2F-c 将约束编码进 `max` / `succ` Expressions。
- 如果多个 Declarations 共享源 Global Levels，必须使用 R3 检查引用实例的 Coherence，不能让不同调用随意改变源 Universe 关系。

因此，我们验证的不仅是 Lean Kernel 能否接受声明，还包括：源 Universe Facts、Constant Reference Relationships 和公开接口的 Generality 是否得到正确保留。

对应源码：
- [UNIVERSE_TRANSLATION.md — R2、R2F-c、R3](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_TRANSLATION.md)
- [Translate.lean — ownLevelInterp、checkInstantiation](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)
- [Emit.lean — solveLevels、Generality Checks](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean)
- [Univ.v — Monomorphic Universe Fixture](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/fixtures/universes/Univ.v)