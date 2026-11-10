### 1. 核心问题：Rocq 和 Lean 的 Kernel 表示不同

在 Rocq → Lean Translation 中，Pattern Matching 和 Recursion 不能简单地进行 AST 节点替换，因为两者的 Kernel 使用不同的表示方式：

- Rocq Kernel：直接支持 `case`（Pattern Matching）和 `fix`（递归定义），通过 Guard Checking 检查递归是否合法。
- Lean Kernel：主要使用 Inductive Types 的 Recursors 表示 Pattern Matching 和结构递归。Lean 源代码虽然也支持 `match` 和递归定义，但需要经过 Elaborator 转换成 Kernel 可以检查的形式。

因此，翻译器需要将 Rocq 中的 `case` 和 `fix` 转换为符合 Lean Recursor 结构的 Expressions。即使一个 `match` 完全没有递归，也需要进行相应的转换。

### 2. Pattern Matching Translation

对于普通的 `match`，主要需要解决两个问题：构造 Motive，以及构造正确的 Recursor Branches。

#### 2.1 构造 Motive

Motive 用来决定 Pattern Matching 的结果类型，特别是在不同 Constructors、Indices 或匹配值下，结果类型应该是什么。

翻译器需要根据 Rocq `match ... return ...` 中的 Return Predicate，构造 Lean Recursor 的 Motive，并确定相应的 Universe Level。

例如，如果普通 `match` 的返回类型始终是 `Bool`，Motive 可以写成：

```lean
motive := fun _ => Bool
```

但对于 Dependent Pattern Matching，返回类型可能依赖正在匹配的值及其 Indices，因此需要构造更复杂的 Motive。

#### 2.2 构造 Recursor Branches

Lean Recursor 对每个 Branch 的参数结构有严格要求：
- 按照 Constructor 的字段顺序接收参数。
- 对递归字段，还需要接收对应的 Induction Hypothesis（IH）。
- 即使某个 Branch 不需要使用 IH，也必须保留正确的参数结构。

例如，Rocq 中：

```coq
Definition isZero (n : nat) : bool :=
  match n with
  | O => true
  | S _ => false
  end.
```

使用 Lean 原生 `Nat` 和 `Bool` 示意，对应的 Recursor 形式是：

```lean
def isZero (n : Nat) : Bool :=
  Nat.rec
    (motive := fun _ => Bool)
    true
    (fun _n _ih => false)
    n
```

这里 `Nat.rec` 接收：
- `motive`：确定递归结果的类型。
- `true`：对应 `Nat.zero` Branch。
- `fun _n _ih => false`：对应 `Nat.succ` Branch。
- `n`：需要匹配的实际输入。

虽然 `_ih` 没有被使用，但 `Nat.rec` 的 `succ` Branch 仍然要求接收这个参数。

因此，Pattern Matching Translation 的核心是：根据源 Match 构造正确的 Motive、Universe Level 和 Branches，使整个 Recursor Application 通过 Lean Kernel Checking。

### 3. Recursion Translation

对于 Rocq 的 `Fixpoint`，除了将 Pattern Matching 转换成 Recursor，还需要处理 Recursive Calls 和 Termination。

#### 3.1 将 Recursive Calls 转换为 IH

Rocq 的 `Fixpoint` 允许函数在满足 Guard Condition 时调用自身，而 Lean Recursor 已经通过 IH 提供了递归结果。

因此，翻译器需要：
1. 找到递归函数的 Decreasing Argument。
2. 选择合适的 Recursor，并调整参数和递归结构。
3. 将 Recursive Calls 转换成对应的 IH Application。

简单的 Structural Recursion 通常可以直接转换。对于 Changing Parameters、Mutual Recursion 或 Course-of-Values Recursion，则可能需要额外的转换规则。

例如，对于一个递归调用：

```text
f n
  ↓
Recursor 中已经提供的 IH
```

翻译器不能简单地保留 `f n`，而需要让它使用当前 Recursor Branch 中对应的递归结果。

#### 3.2 无法直接转换时，处理 Termination

某些递归虽然能够通过 Rocq 的 Guard Checker，但无法直接转换成当前翻译器支持的 Lean Structural Recursor 形式。

此时，翻译器可以尝试 Well-Founded Recursion：
- 定义递归调用之间的 Relation。
- 使用 `Acc` / Well-Founded Recursion 表达递归计算。
- 如果无法自动证明递归下降，则将缺失的 Termination Proof 保留为显式 Proof Obligation。

这里需要注意：不能因为 Rocq 接受了某个递归定义，就在 Lean 中直接假设它一定满足目标 Recursion Principle。

如果依赖尚未证明的 Termination Obligation，目标声明只能作为带有显式前提的条件性结果，不能将其视为已经完成的无条件翻译。如果无法安全转换，也可以拒绝该 Declaration。

### 4. 项目中的 M Rules

根据当前仓库的 [ALL_RULES.md](https://github.com/jackooo-dddd/rocq-core/blob/main/results/corelib-complete/ALL_RULES.md)，M Rules 可以分为以下几类：

| 类别 | 对应规则 | 主要作用 |
|---|---|---|
| Pattern Matching | M01–M02、M12 | Dependent Match、Non-uniform Match、Constructor-shaped Indices |
| Structural Recursion | M03–M06 | Recursive Call 转换、Generalize Parameters / Indices、Match 结构调整 |
| Advanced Recursion | M07–M09 | Mutual Recursion、递归调用展开、Course-of-Values |
| Termination Handling | M10–M11 | Accessibility Conversion、Well-Founded Proof Obligations |
| Recursive Cast Repair | M13 | 修复递归展开与类型转换相关的问题 |

其中：
- M01–M02：处理 Dependent / Non-uniform Pattern Matching。
- M03–M06：将普通 Structural Recursion 转换为 Lean Recursor，并处理变化的参数、Indices 和递归结构。
- M07–M09：处理 Mutual Recursion、间接递归调用以及 Course-of-Values Recursion。
- M10–M11：处理 Accessibility 和 Well-Founded Recursion，包括未解决的 Termination Obligations。
- M12–M13：处理特殊 Constructor-shaped Indices 和 Recursive Cast Repair。

当前规则清单包含 M01–M13。这些是不同翻译机制的分类，并不意味着每一种递归都能被支持，也不代表每条规则都已在测试范围内实际触发。

主要实现位于 [Translate.lean](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)，包括 `transCase`、`transCaseNU`、`transFix`、`transFix1`、`transFixAcc`、`transFixWf` 和 `transFixMutual` 等函数。

### 5. 整体翻译流程

```text
Rocq case / fix AST
        │
        ▼
1. Pattern Matching Lowering
   - 构造 Motive 和对应 Universe Level
   - 构造 Recursor Branches
   - 排列 Constructor Fields 和 IH
        │
        ▼
2. Recursion Lowering（如果存在递归）
   - 确定 Decreasing Argument
   - 选择合适的 Recursor
   - 将 Recursive Calls 转换为 IH
        │
        ▼
3. Termination Handling（必要时）
   - Structural / Advanced Recursor
   - Well-Founded Recursion
   - Explicit Proof Obligations
        │
        ▼
Lean Recursor Expression
        │
        ▼
Lean Kernel Checking
        │
        ▼
Independent Audit
```

### 6. 总结

Recursion / Pattern Matching Translation 主要需要解决三个问题：

1. Pattern Matching Reconstruction：将 Rocq 的 `case` 转换为 Lean Recursor，正确构造 Motive、Universe Level 和 Branches。
2. Recursive Call Reconstruction：将 Rocq 的 `fix` 中的 Recursive Calls 转换为 Lean Recursor 提供的 IH，并处理变化的参数与复杂递归结构。
3. Termination Justification：对于无法直接进行 Structural Recursion 的情况，寻找其他合适的 Recursion Principle，并显式保留无法自动证明的 Termination Obligations。

因此，M Rules 的核心目的不是简单地将 Rocq 的 `case` / `fix` 替换成 Lean 的 `match` / `fix`，而是重新构造符合 Lean Kernel 要求的 Recursor Expressions，同时保留必要的递归结构和终止性条件。