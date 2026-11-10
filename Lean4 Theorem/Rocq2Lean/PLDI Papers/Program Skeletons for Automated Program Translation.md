## （基本上没用，让agent看就可以啦）
论文链接： [arXiv 全文](https://arxiv.org/abs/2504.07483) · [ACM 正式论文](https://doi.org/10.1145/3729287)
这篇研究如何把一种语言中的程序自动翻译成另一种语言，实际实现的是 Python → JavaScript。它的核心思想不是直接翻译整段程序，而是将程序分成两个部分：
1. Program Skeleton：保留程序整体的高层结构，这部分可以机械转换。
2. Concrete Fragments：把具体实现片段交给其他翻译或程序合成方法处理。

论文在 9 个真实 Python 程序上的实验显示，约 95% 的代码片段可以自动翻译，约 5% 需要人工参与；最终程序通过了整程序测试。它还提出一个组合正确性的思路：如果每个片段正确、Skeleton 的组合方式也正确，那么可以推导整体翻译正确。需要注意，实验中的正确性验证主要依赖测试，并非完整形式化证明。

你们其实有类似的分层设计：
- 一部分 Rocq AST 结构由通用机械规则翻译。
- 复杂类型、MathComp 结构、特殊递归等需要额外转换机制。
- 每个 Declaration 翻译之后，再进行 Lean 编译和验证。
我认为这篇特别值得参考的是 Compositional Translation Correctness：如何从较小结构的正确翻译，进一步支持整个 Declaration 的翻译正确性。

# 也许有用的地方
## 1. 为复杂翻译规则增加局部正确性要求（Local Correctness Obligations）

论文的思想：SKEL 不只是把程序拆成多个片段，还为每个片段附加局部语义要求 $\varphi_i$，约束生成结果，并以“局部正确性能够组合成整体正确性”为设计目标。但论文并没有完成通用的形式化正确性证明。对应 Section 2、3.3。[Paper](https://arxiv.org/html/2504.07483v2)

在我们的项目中，可以应用到复杂的 `Case/Fix` Lowering。例如将 Rocq 的递归定义转换成 Lean 的 Recursor 或 `Acc.rec` 时，不能只检查生成的 Lean Definition 能否通过 Kernel，还需要验证它是否保留了原始计算行为。我们已有的 `TRUST.md` 记录了对递归调用参数、分支主体及 Lowering 结构的独立 Audit，可以在此基础上进一步增加 Semantic Correspondence Certificates。每条复杂翻译规则可以组织成：

```text
Applicability Conditions
        ↓
Generated Lean Structure
        ↓
Correspondence Obligations
        ↓
Verification / Proof Certificates
```

例如，针对递归函数，除了 Termination Obligation，还可以根据原始 Rocq Definition 生成对应的 Unfolding Equations，检查基础分支返回什么、递归分支调用哪个子问题、如何使用递归结果。Termination Proof 解决“递归是否终止”，Semantic Correspondence 则解决“计算结果是否保持原来的含义”。之后，上层 Declaration 可以复用已经建立的 Correspondence Certificate，而不需要重新展开整个函数的实现，但这种组合还需要相应的 Composition Lemma 支持。

对我们的主要价值：将“新增一条特殊翻译规则”升级为“新增一条具有明确适用条件、Proof Obligations 和 Correctness Evidence 的转换规则”，特别适合复杂递归和 Dependent Pattern Matching。

## 2. 先定义 Representation Relation，再证明 Translation Correctness

论文的思想：SKEL 使用共同模型 ProcEmu 比较两种语言的 Observable Behavior，而不是要求内部实现完全相同。我们可以借鉴这种先明确 Correspondence Criteria、再验证翻译的方式，但论文的类型映射和检查并不构成完整的跨语言 Semantic Preservation Proof。对应 Section 3.2。[Paper](https://arxiv.org/html/2504.07483v2)

在我们的项目中，这个思路可以应用到 Rocq 镜像类型与 Lean Native Type 的适配。例如，将 Rocq 的 `list` 机械翻译为 Lean 中的 `Rocq.list` 后，还希望能够直接使用 Lean 原生的 `List`：

$$
\begin{aligned}
\text{Rocq list}
&\xrightarrow{\text{Mechanical Translation}}
\text{Lean Rocq.list}\\
&\xleftrightarrow{\text{Correspondence Proof}}
\text{Lean List}
\end{aligned}
$$

这里需要分开验证两个层次。第一层是原始 Rocq Definition 与机械翻译得到的 Lean Mirror Definition 是否保持语义；第二层是 Lean 内的 Mirror Type 与 Native Type 是否对应。对于第二层，可以先构造 `toList`、`fromList`，证明它们互为逆函数，从而建立 Datatype Isomorphism；再进一步证明 Operation Correspondence，例如：

$$
\begin{aligned}
&\operatorname{toList}(\operatorname{append}_{mirror}(xs,ys))\\
&=\operatorname{List.append}(\operatorname{toList}(xs),\operatorname{toList}(ys))
\end{aligned}
$$

其中 `append_mirror` 是 Lean 中机械翻译生成的 Append Function，上述公式是建议的 Proof Obligation，并不意味着仓库已经完成该证明。Datatype Iso 说明两种类型可以无损转换；Operation Correspondence 则说明可以安全地将 Mirror Operation 替换成 Lean Native Operation。

需要注意，Lean 内部的 Isomorphism 不能自动证明最初 Rocq → Lean Mirror 的机械翻译语义正确。第一层仍然需要独立的 Translation Correctness Argument 或 Proof。

对我们的主要价值：明确区分“Rocq Source → Lean Mirror”和“Lean Mirror → Lean Native”两层 Correspondence，避免使用第二层的 Iso 掩盖第一层尚未完成的 Semantic Preservation Proof。

## 3. 通过 Ablation Study 和 Error Injection 评估验证能力

论文的做法：SKEL 不只报告最终翻译成功率，还通过 Ablation Study 比较各个组件的贡献。仅使用基本片段生成、增加语义要求、进一步加入检查与修复后，需要人工修复的函数数量分别是 89、61、23。对应 Section 6.2、Table 4。[Paper](https://arxiv.org/pdf/2504.07483)

在我们的项目中，可以借鉴这种实验设计，但重点不再是减少人工修复，而是回答：哪些 Translation Errors 能够通过 Lean Kernel，却会被我们的 Independent Audit 或 Correspondence Certificate 拒绝？

| Verification Level | 检查目标 |
|---|---|
| Lean Kernel Only | 检查生成的 Lean Declaration 是否 Type Correct |
| Kernel + Independent Structural Audit | 检查生成结果是否符合原始 Rocq Source 和机械翻译规则 |
| Kernel + Audit + Correspondence Certificate | 对已覆盖的声明进一步验证明确的 Semantic Correspondence |

具体实验可以固定一批 Rocq Source Declarations，生成正常翻译和故意修改的错误版本。例如交换 Constructor Branches、修改 Recursive Call、读取错误的 Recursive Result，或者将 Theorem Statement 替换成一个更弱但 Type Correct 的命题。这些错误可能仍然被 Lean Kernel 接受，但应当被相应的 Structural Audit 或 Semantic Correspondence 检查拒绝。

我们的 `TRUST.md` 已经记录了多种 Kernel Accepted、Independent Audit Rejected 的 Mutation Cases，因此不需要从零开始。下一步可以系统化地分类这些案例，并统计：

- Translation Coverage：正常翻译中有多少 Declaration 被成功接受。
- Error Detection Rate：注入的错误中有多少被 Kernel、Audit 和 Certificate 分别检测出来。
- False Acceptance：哪些错误翻译仍然通过全部检查。
- Verification Overhead：不同检查层次增加了多少时间和计算开销。

需要注意，更强的 Verification 不一定提高 Accepted Declaration 的数量，反而可能拒绝更多不可靠的翻译。因此，不能只用 Acceptance Rate 衡量验证质量，还需要报告错误检测能力和未覆盖的 Semantic Risks。

对我们的主要价值：将“我们有 Independent Audit，所以翻译可信”转化成可量化的实验结果，明确说明我们的 Verification 能够检测哪些 Lean Kernel 无法发现的翻译错误，以及哪些 Semantic Preservation 问题仍未解决。