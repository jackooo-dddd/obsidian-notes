在 Rocq → Lean 机械翻译项目中，`Obligation` 指翻译过程中产生的、需要后续证明的条件（Proof Obligation）。它通常表示：翻译器已经能够处理某个 Declaration 的计算逻辑，但其中仍存在尚未完成的证明。

例如，在当前 `statement-only` 模式下，我们不直接翻译 Rocq 原有的 Proof Body，而是将部分证明提取为独立的 Obligations，交给后续的 Lean Proving Agent。

这里需要区分三个概念：

| 概念 | 含义 |
|---|---|
| Obligation Statement | 描述需要证明什么 |
| Obligation Proof | 真正证明该命题的 Lean Proof Term，目前可能不存在 |
| Pending Definition | 主体已经翻译，但依赖的 Obligations 尚未完成的 Definition |

因此，出现 Obligation 不代表翻译失败，也不代表证明已经完成，而是将尚未解决的证明需求明确记录下来。
### 1. Proof Extraction：从 Definition 中提取证明
考虑 Rocq 中的定义：
```coq
Definition packed (n : nat) : {m : nat | m = n} :=
  exist _ n (eq_refl n).
```
这个 Definition 包含两个部分：
- Computation：构造值 `m = n` 中的 `m`，这里选择 `m := n`。
- Proof：使用 `eq_refl n` 证明 `m = n`，即 `n = n`。
由于 `statement-only` 模式不直接翻译原来的 Proof Body，Exporter 会在 Statement Preparation 阶段将证明单独提取出来，生成新的 Obligation Constant：
```coq
packed__rocq2lean_obligation_1 :
  forall n : nat, n = n
```
然后把原来 Definition 中的 Proof Subterm 替换为对该 Obligation 的引用：
```coq
packed n :=
  exist _ n (packed__rocq2lean_obligation_1 n)
```
这样，原本混在 Definition Body 中的计算部分和证明部分就被分离了。
#### 翻译到 Lean 后
首先，翻译器生成 Obligation Statement：
```lean
def Rocq.packed__rocq2lean_obligation_1.statement : Prop :=
  ∀ n : Nat, n = n
```
注意，`def ... : Prop := ...` 只是定义了需要证明的命题，并没有提供该命题的 Proof。
对于依赖这个 Obligation 的 Definition，翻译器可以生成一个带有显式假设的 Pending Definition：
```lean
def RocqPending.packed
    (h : Rocq.packed__rocq2lean_obligation_1.statement)
    (n : Nat) : {m : Nat // m = n} :=
  ⟨n, h n⟩
```
这里 `h` 是尚未完成的证明假设。Lean Kernel 可以验证：在提供 `h` 的前提下，整个 `packed` Definition 是类型正确的，但这不代表 `h` 已经被证明。
后续完成 Obligation Proof 后，Assembly 才能利用实际 Proof 构造正式的 `Rocq.packed`。

### 2. Statement Preparation 中的不同 `body_state`
Exporter 会根据原始声明以及 Statement Preparation 的结果，为 Constant 标记不同的 `body_state`

| `body_state` | 含义 |
|---|---|
| `obligation` | Preparation 新生成的 Proof Obligation Constant |
| `statement_only` | 原本就是 Proof-valued Constant，只保留 Statement，不翻译原始 Proof Body |
| `opaque_data` | Opaque Data 的 Body 可以成功准备和导出 |
| `opaque_interface` | Opaque Data 的 Body 无法有效准备，只保留 Type Interface |
| `obligation_extraction_failed` | Proof Extraction 后的声明未通过 Rocq Kernel 检查，不能视为成功准备 |

其中，最重要的是区分 `statement_only` 和 `obligation`。
`statement_only` 对应原本就存在的证明声明，例如：
```coq
Lemma addn0 : forall n, n + 0 = n.
```
而 `obligation` 是为了翻译某个 Definition，由 Exporter 新生成的证明需求。在 Source IR 中，还会记录 Obligation 与原始 Definition 的关系，例如：
```json
"native": {
  "obligation": {
    "of": "parent_definition",
    "index": 1
  }
}
```
这里的 `of` 表示 Obligation 所属的原始 Declaration，`index` 表示其编号。
源码：[r2l_export.ml — Statement Preparation](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/rocq/exporter/src/r2l_export.ml)

### 3. Termination Obligation：递归终止证明

除了提取原有的 Proof Subterms，翻译器还可能在处理递归函数时生成新的 Obligation。

原因是 Rocq 和 Lean 对递归的处理机制不同。某些递归函数虽然能够通过 Rocq 的 Guard Checking，但无法直接转换为 Lean 的 Structural Recursor。

此时，翻译器可以尝试使用 Well-founded Recursion，并生成一个 Termination Obligation，例如：

```lean
def Rocq.f__rocq2lean_termination_1.statement : Prop :=
  ∀ s, Acc R s
```

这里的 `R` 表示递归调用之间的关系，`Acc R s` 表示 `s` 对于该关系是 Accessible 的。证明 `∀ s, Acc R s`，即可为对应递归提供终止性依据。实际 Statement 还可能包含额外的局部参数和 Pending Prerequisites。

翻译器负责构造递归的计算逻辑与 Termination Statement，但不直接生成终止性证明。因此，这类函数也可能先以 `RocqPending` 的形式存在。

此外，项目还可能生成：
```text
__rocq2lean_unfold_k
```
用于描述递归函数应满足的 Unfolding Equation。这也是独立的 Proof Task；并非所有递归函数都会生成它。
#### 两种主要 Obligation 的区别

| | Proof Extraction Obligation | Termination Obligation |
|---|---|---|
| 产生阶段 | Exporter Preparation | Lean Translator |
| 产生原因 | Definition 内含 Proof Subterm | Rocq 与 Lean 的递归机制不同 |
| 证明目标 | 原始 Proof 所需的命题 | 递归关系的终止性 |
| 命名形式 | `__rocq2lean_obligation_k` | `__rocq2lean_termination_k` |

对应文档：[TERMINATION.md](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/TERMINATION.md)

### 4. 为什么项目中会出现很多 Obligations？

因为 Rocq 中许多看似普通的数据定义，实际上也包含证明。例如：
- MathComp 的 `eqType` 实例可能包含 `eqP` 正确性证明。
- Subtype 的值需要携带满足指定条件的证明。
- Dependent Cast 可能涉及 Equality Proof。
- 某些递归函数需要额外的 Termination Proof。

而当前项目选择保留计算和数据结构的机械翻译，同时将尚未处理的证明显式提取出来，因此这些原本隐藏在 Definition 内部的 Proof Subterms 会变成独立的 Proof Tasks。

整体流程可以概括为：

```text
Rocq Declaration
       │
       ▼
Statement Preparation / Translation
       │
       ├── Computation → Lean Expressions
       │
       └── Proof Requirements → Obligations
                                    │
                                    ▼
                      RocqPending Definition
                         带显式证明假设
                                    │
                                    ▼
                           Lean Kernel Check
                                    │
                                    ▼
                       Proof Completion + Assembly
                                    │
                                    ▼
                         Final Lean Declaration
```

