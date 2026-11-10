在 Rocq → Lean 项目中，Body 指一个 Declaration 的具体实现（Implementation）。
### 1. 什么是 Body？

考虑最简单的 Rocq Definition：

```coq
Definition x : nat := 3.
```

Rocq 会将这个 Declaration 保存到 Environment 中，包括：

| 部分 | 内容 | 含义 |
|---|---|---|
| Name | `x` | Declaration 的名字 |
| Type | `nat` | `x` 必须是一个自然数 |
| Body | `3` | `x` 的具体值 |
| Opacity | Transparent | Kernel 可以展开 Body |

对于函数也是一样：

```coq
Definition square (n : nat) : nat := n * n.
```

它在 Kernel 中的表示大致是：

```text
Name : square
Type : nat -> nat
Body : fun n : nat => n * n
```

这里需要区分 Body、Function Application 和计算结果：

- `fun n => n * n`：`square` 的 Body，即函数的具体实现。
- `square 3`：一次 Function Application（Expression）。
- `9`：这次函数调用经过计算得到的结果。

因此，Body 不是函数运行后的结果，而是函数本身的定义。

### 2. 什么叫 Body 成功导出和翻译？

考虑一个 Opaque Data：

```coq
Definition pick : nat.
Proof.
  exact 3.
Qed.
```

Rocq Environment 中保存的信息为：

```text
Name    : pick
Type    : nat
Body    : 3
Opacity : Opaque
```

虽然 `pick` 是 Opaque，Kernel 不允许通过普通 δ-reduction 展开它，但其 Body 仍然存在。我们的 Exporter 可以尝试通过专门的 Opaque Body Access 获取它。

#### Step 1. Exporter 获取并导出 Body

Exporter 获取的不是原始 Tactic 文本 `exact 3`，而是经过 Rocq Elaboration 的 Term。例如，自然数 `3` 可以表示为：

```coq
S (S (S O))
```

Exporter 利用 MetaRocq 将 Term 转换为 AST，再序列化为 Source IR：

```text
Rocq Environment
    │
    ├── Type: nat
    └── Body: S (S (S O))
              │
              ▼
         MetaRocq Export
              │
              ▼
         Type AST + Body AST
```

这就是 Body Export：把 Rocq Environment 中的具体实现提取为可供翻译器处理的 AST，而不是重新解析原始 Rocq Source Code。

#### Step 2. Translator 翻译 Body

Exporter 完成后，Translator 得到：

```text
Rocq Type AST : nat
Rocq Body AST : S (S (S O))
```

接着分别调用相应的 Term Translation，将它们转换为 Lean Expressions：

```text
Rocq Type AST  → Lean Type Expression
Rocq Body AST  → Lean Body Expression
```

最后生成 Lean Declaration，例如：

```lean
opaque Rocq.pick : Nat := 3
```

Lean Kernel 会检查 Body `3` 是否具有声明要求的 Type `Nat`。由于源 Declaration 是 Opaque，目标也使用 Lean `opaque`，保留其不透明性。

这就是 Body Translation：将导出的 Rocq Body AST 转换成 Lean Expression，并通过 Lean Kernel 检查。

### 3. 为什么有些 Body 无法成功导出或翻译？
某些 Definition 的 Body 不仅包含计算逻辑，还包含 Proof Subterms。例如：
```coq
Definition bounded : {m : nat | m <= 5}.
Proof.
  exists 2.
  repeat constructor.
Qed.
```
- 这里的 `{m : nat | m <= 5}` 是 Rocq 中的 Subset Type（子集类型），本质上是 `sig (fun m : nat => m <= 5)`。它表示一个由两部分组成的数据：一个自然数 `m`，以及一个证明 `m <= 5` 的 Proof。也就是说，这个类型的值不仅包含一个 `nat`，还必须附带证明这个自然数满足条件。由于 `sig` 属于 `Set`，因此 `bounded` 是一个 Data-valued Constant，而不是普通的 Proof-valued Constant。
- 在 `Proof` 部分，`exists 2` 表示选择 `2` 作为 `m` 的具体值，此时还需要证明 `2 <= 5`。`repeat constructor` 会反复尝试使用归纳构造器来完成这个证明。因此，`bounded` 的完整 Body 实际上包含两部分：Data（`2`）和 Proof（`2 <= 5` 的证明）。最后，`Qed` 将这个 Definition 保存为 Opaque Constant。
在当前项目的 `statement-only` 模式下，我们不直接翻译原始 Proof Body。因此，Exporter 会进行 Statement Preparation：
1. 提取 Proof Subterm，将其转换成独立的 Proof Obligation。
2. 使用 Obligation 的引用替换原来的 Proof，生成 Prepared Body。
3. 让 Rocq Kernel 重新检查 Prepared Body，确认修改后的声明仍然合法。
4. 如果检查成功，就将 Prepared Body 导出，交给 Translator 进行机械翻译。
例如，准备后的结构可以理解为：
```text
Original Body
 ├── Data  : 2
 └── Proof : 原始证明
               │
               ▼
Statement Preparation
               │
               ├── Data  : 2
               └── Proof : Obligation Reference
                              │
                              ▼
                       Prepared Body
                              │
                              ▼
                      Rocq Kernel Re-check
                              │
                              ▼
                       Body Translation
```

如果翻译主体成功，但 Obligation 尚未证明，Lean 中可以先生成带有显式证明假设的 `RocqPending` Definition，等待后续 Proof Completion 和 Assembly。

但如果 Prepared Body 因复杂递归、Proof-dependent Computation 或其他类型检查问题无法通过 Rocq Kernel Re-check，那么这个 Opaque Data 可能退回到 `opaque_interface`，只保留 Type Interface，而不声称已经翻译其具体实现。

### 4. Body Export、Body Translation 和 Opaque 的区别

| 概念 | 含义 |
|---|---|
| Body | Declaration 的具体值或函数实现 |
| Body Export | 从 Rocq Environment 获取 Body，并导出为 Source AST |
| Body Translation | 将 Rocq Body AST 转换为 Lean Expression |
| Body Preparation | 提取 Proof Obligations，生成可用于翻译的 Prepared Body |
| Opaque | Kernel 不允许通过普通 δ-reduction 展开该 Constant 的 Body |
| `opaque_data` | Opaque Body 成功准备和导出，可以继续翻译实现 |
| `opaque_interface` | Body 无法有效准备或导出，只能保留 Type Interface |

最重要的是：Opaque 并不代表 Body 不存在，也不代表 Exporter 无法读取它。它只限制 Kernel 的 Definitional Reduction。对翻译器来说，真正需要区分的是能否取得 Body、能否成功准备 Body，以及能否将其机械翻译成合法的 Lean Declaration。