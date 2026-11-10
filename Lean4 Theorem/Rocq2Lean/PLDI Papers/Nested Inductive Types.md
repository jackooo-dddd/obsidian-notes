## （基本上没用，让agent看就可以啦）
### Nested Inductive Types: Justified and Usable Nested Inductive Types in Lean and Rocq
论文链接： [ACM 正式论文](https://doi.org/10.1145/3808322) · [PLDI 官方页面](https://pldi26.sigplan.org/details/pldi-2026-papers/79/Nested-Inductive-Types-Justified-and-Usable-Nested-Inductive-Types-in-Lean-and-Rocq)
Lean 和 Rocq 都支持 Inductive Types，但是对于 Nested Inductive Types（嵌套归纳类型），两边的处理方法和限制并不完全一样。
例如某个归纳类型的构造器递归地包含 `List T`，就可能出现嵌套归纳结构。论文指出：
- Lean 会拒绝一些实际上合理的 Nested Inductive Types。
- Rocq 接受的某些定义，却无法生成真正可用的消去原则。
- 作者提出新的有效性条件，把合适的 Nested Inductive Types 转换成 Mutual Inductive Types，并证明相关消去原则等价。

## 1. Argument View：先分类，再翻译
论文 §3.2 不直接让每个转换函数反复分析原始 AST，而是先把构造器参数整理成四种结构。假设正在定义 `Tree A`，可以这样理解：
```text
nat             → 普通非递归参数
Tree A          → 当前类型的直接递归出现
A               → 被判定为严格正的类型参数
list (Tree A)   → 当前类型通过 list 嵌套出现
```
这里的“普通非递归参数”不是说它必须是全局常量，而是说它不涉及当前递归类型或被标记为严格正的参数。分类后还要检查相应条件，不能仅凭分类就认定它合法。

我们在哪里复用？
放在 Source IR 解析之后、Inductive Translation 之前，为每个构造器参数生成结构化描述，再交给 `Translate.lean` 使用。
例如，遇到 `list (Tree A)`，翻译器不只是看到一个普通函数应用，而是明确知道：这是通过 `list` 发生的递归，需要按嵌套结构处理。
这样，后续的直接翻译、Nested → Mutual 改写和合法性检查，都可以共用这份分析结果。可复用的是“结构分析与转换逻辑分离”的设计，不是把这四类作为整个 Rocq AST 的通用分类。论文也明确把 View 与正性证明分离，以便让转换和证明各自组织。

## 2. Scope-safe Translation：改写结构时，不丢失变量依赖
论文 §3.1 的例子是：
```text
All (fun a => typing a return_type) branches
```
这里的 `return_type` 来自外层构造器。将这个嵌套结构提取成新的 Mutual Inductive 时，新定义中仍然需要 `return_type`，但原来的外层作用域已经不在了。直接复制表达式就会产生未绑定变量。

作者的处理方法是：保留需要的非递归变量，把它们变成新类型的显式 indices。例如：
```text
All_mut : term -> list term -> Type
```
第一个 index 就承载 `return_type`。但不能把所有外层参数都搬进去：如果把当前正在定义的递归类型或递归证明引入 index 的类型，可能生成不允许的 Inductive-Inductive Definition。

我们在哪里复用？
放在 `Translate.lean` 中会改变 binder/context 的结构改写部分，尤其是提取辅助定义、生成 Mutual Inductive，以及调整参数与 indices 的规则。

我们可以借鉴这样的处理顺序：
> 先确定新定义依赖哪些外层变量，再检查哪些依赖可以合法保留，最后更新参数、indices 和变量编号。
关键不是“删掉递归参数就好了”，而是保证改写后所有仍被使用的变量都有合法来源。如果某个必要依赖无法合法保留，这条改写规则就不能直接使用。论文中的 Context Strengthening 和特殊化后的 substitution，正是在处理这些问题。

## 3. Positivity Preservation：给具体转换规则建立证明
论文 §3.3 证明了 `pos_nested_to_mutual`，核心意思是：
$$
\operatorname{Positive}(I)
\;\Longrightarrow\;
\operatorname{Positive}(\operatorname{nested\_to\_mutual}(I))
$$
这里的前提是作者定义的正性条件，不是“任何被 Rocq 接受的定义”。证明保证：符合条件的输入经过这条转换后，输出仍然满足正性要求。这部分已经在 MetaRocq 中机械化。

我们在哪里复用？
用于 Correctness Proofs／Verification 层。最直接的接入对象，就是前面第二点中那些会改变类型结构、参数和作用域的翻译规则。
例如，我们可以为某条规则分别建立：
- 作用域保持：输入没有未绑定变量，转换后也没有。
- 正性保持：输入满足规定的正性条件，转换后的归纳定义仍然满足目标侧要求。
这些是我们需要新增的证明目标。能复用的是“明确适用条件 → 定义转换 → 证明保持性质”的组织方式，不能直接拿论文的定理证明 Rocq → Lean 正确。

而且要区分：

> 正性保持说明没有破坏某项合法性条件，不等于两边数据类型、函数或定理的语义已经对应。

因此，它应当补充我们已有的 `Iso`、Representation Relation 和 Statement Correspondence，而不是替代它们。