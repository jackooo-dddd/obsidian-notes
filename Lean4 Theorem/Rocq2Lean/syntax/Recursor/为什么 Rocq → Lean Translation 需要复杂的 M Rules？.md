最核心的原因是：Lean 本身也需要进行这些复杂的转换，只不过 Lean Elaborator 会自动帮程序员完成；而我们的 Rocq → Lean Translator 直接操作 Lean Kernel Expressions，因此必须自己完成原本由 Elaborator 负责的一部分工作。

这里需要区分三个层次：
- Lean Source Code：程序员使用高级语法编写 `match` 和递归函数，不需要直接处理 Recursor。
- Lean Kernel Expressions：Elaborator 将Lean Source Code 里的高级语法转换成 Kernel 可以检查的底层表达式，包括 Recursor、Motive、Induction Hypothesis（IH）等。
- Rocq → Lean Translator：直接生成 Lean `Expr`，因此需要显式构造这些底层结构。
### 1. 用一个例子理解区别

假设需要定义一个将自然数乘以 2 的函数。
#### 1.1 普通 Lean 编程
程序员可以直接写：
```lean
def double : Nat → Nat
  | 0 => 0
  | n + 1 => Nat.succ (Nat.succ (double n))
```

Lean Elaborator 会分析递归结构，并生成类似下面的 Recursor Expression：

```lean
def double (n : Nat) : Nat :=
  Nat.rec
    (motive := fun _ => Nat)
    0
    (fun k ih => Nat.succ (Nat.succ ih))
    n
```
注意，原来的 Recursive Call：
```lean
double n
```
已经被转换成 Recursor 提供的：
```lean
ih
```
同时，Motive、Branch Parameters 和 IH 都由 Lean Elaborator 自动构造。
#### 1.2 Rocq → Lean Translation
假设 Rocq Source 为：
```coq
Fixpoint double (n : nat) : nat :=
  match n with
  | O => O
  | S k => S (S (double k))
  end.
```
MetaRocq Exporter 导出的是经过 Rocq Elaborator 检查的 Kernel AST，其中包括 `tFix`、`tCase`、`tRel`、`tApp` 等节点。

我们的 `trans` 并不是将这些节点重新生成简洁的 Lean Source Code，再交给 Lean Elaborator，而是直接构造 Lean `Expr`。

因此，翻译器必须自己完成：
1. 确定 Rocq `tFix` 对应哪个 Lean Recursor。
2. 根据源 Return Predicate 构造 Motive。
3. 构造符合 Lean Recursor 接口的 Branches。
4. 将 Recursive Calls 转换成对应的 IH。
5. 确保最终 Expression 通过 Lean Kernel Checking。
### 2. 两套处理路线的区别
普通 Lean 编程：

```text
Lean Source Code
match / recursion
        │
        ▼
Lean Elaborator
自动处理 Pattern Matching 和 Recursion
        │
        ▼
Lean Kernel Expressions
Recursor Applications
        │
        ▼
Lean Kernel Checking
```

Rocq → Lean Translation：

```text
Rocq Kernel AST
tCase / tFix
        │
        ▼
Rocq → Lean Translator
M Rules 构造 Recursor Expressions
        │
        ▼
Lean Kernel Expressions
Recursor Applications
        │
        ▼
Lean Kernel Checking
        │
        ▼
Independent Audit
```

关键区别：普通 Lean 编程直接使用现成的 Elaborator，而我们的项目是在进行跨语言的 Kernel-level Translation。

### 3. 为什么不直接翻译成 Lean 的 `match`？

理论上，也可以设计另一种翻译路线：

```text
Rocq Kernel AST
        │
        ▼
Generate Lean Source Code
        │
        ▼
Lean Elaborator
        │
        ▼
Lean Kernel Expressions
```

这样确实可以复用 Lean 自带的 Pattern Matching 和 Recursion 处理能力，但仍存在几个问题。

1. Type System Differences：Rocq 和 Lean 的 Type System、Universe Rules 和 Inductive Types 并不完全相同。Rocq 中合法的 Dependent Match，不一定能够直接转换为 Lean 中合法的 `match`。
2. Translation Correspondence：Lean Elaborator 会自动选择 Motive、Generalize Parameters、插入类型转换并选择 Recursion Principle。因此，最终生成的 Expression 不一定容易与原始 Rocq Kernel Term 建立直接对应关系。
3. Independent Audit：我们的目标不仅是生成 Lean Kernel 接受的 Declaration，还需要检查翻译是否符合预定的结构对应规则、Universe Constraints 和计算行为要求。

因此，使用 Lean Elaborator 并非不可能，但它不能自动解决 Rocq → Lean Translation Correctness 的问题。直接构造 `Expr` 可以让翻译规则更加明确，也更容易进行 Independent Audit。

需要注意，Kernel Checking 和 Independent Audit 本身并不等于已经完成跨语言的形式化语义等价证明。

### 4. 为什么 M Rules 会这么复杂？

Lean Elaborator 可以根据 Lean Source Code 自由选择合适的 Recursion Principle，而我们的 Translator 需要根据已经存在的 Rocq Kernel Term，重建对应的 Lean Recursor Structure。

| 情况 | 普通 Lean 编程 | Rocq → Lean Translator |
|---|---|---|
| 普通 Pattern Matching | 自动生成 Motive 和 Recursor | M01–M02：重建 Return Predicate 和 Branches |
| 简单 Structural Recursion | 自动识别递归结构 | M03：确定 Decreasing Argument，转换 Recursive Calls |
| 递归参数发生变化 | Elaborator 尝试 Generalization | M04–M06：显式处理 Parameters、Indices 和 Match 结构 |
| Mutual Recursion | Elaborator 处理支持的互递归形式 | M07：构造联合递归结果 |
| 复杂递归调用 | 尝试更复杂的 Recursion Principle | M08–M09：展开间接调用、Course-of-Values |
| Termination | 自动检查或要求终止证明 | M10–M11：Accessibility、Well-Founded Recursion 和 Proof Obligations |
| 特殊 Match / Cast | Elaborator 处理支持的转换 | M12–M13：特殊 Indices 和 Recursive Cast Repair |

这里还需要注意：并非所有非递归 Pattern Matching 都需要 IH。Lean 也可以使用 `casesOn` 等消去器，其 Branch 不包含递归 IH。如果翻译器选择的是 `rec`，则必须按照该 Recursor 的接口提供 IH 参数，即使 Branch 实际上不需要使用它。

因此，M Rules 的复杂性不仅来自 Lean Recursor 本身，也来自 Rocq 和 Lean 在 Kernel Representation、Dependent Types、Recursive Structure 和 Termination Checking 等方面的差异。

### 5. 总结
> The complexity arises because our translator operates at the kernel-expression level rather than the surface-syntax level. Lean's elaborator automatically compiles high-level pattern matching and recursive definitions into recursors. Our translator must explicitly reconstruct these recursor applications from Rocq kernel terms, including motives, branch arguments, recursive hypotheses, and termination justifications. Furthermore, unlike Lean's native elaborator, the translator must preserve and audit the correspondence with the original Rocq declarations.

因此，M Rules 并不是在实现一套完全独立于 Lean 的递归机制，而是在跨语言环境中，重新完成 Lean Elaborator 通常负责的 Recursor Lowering，并增加 Rocq → Lean 所需要的结构对应、Universe 和 Proof Obligation 检查。

最核心的区别是：普通 Lean 程序员编写高级语法，由 Elaborator 自动生成底层表达式；我们的 Translator 直接从 Rocq Kernel AST 构造 Lean Kernel Expressions，因此必须显式处理这些转换。