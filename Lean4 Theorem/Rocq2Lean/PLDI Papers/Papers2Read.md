### Scalable, Validated Code Translation of Entire Projects using Large Language Models
论文链接： [arXiv 全文](https://arxiv.org/abs/2412.08035) · [ACM 正式论文](https://doi.org/10.1145/3729315) · [Artifact](https://zenodo.org/records/15242640)
它研究什么？
这篇研究如何把整个真实项目从 Go 自动翻译为 Rust，而不只是翻译几段独立代码。
作者发现两个非常关键的问题：
1. Language Feature Mapping：两种语言中的某些功能没有直接对应的结构，如果完全依赖 LLM，很容易翻译错误。因此作者引入事先定义的翻译规则。
2. Type Compatibility：需要在函数签名层面检查类型是否兼容，而不是等整个项目翻译完才发现问题。
整个系统会把代码拆成较小片段，独立翻译、检查输入输出等价性，然后组合。论文报告了最高约 9,700 行、780 个函数的项目规模，以及平均 73% 的函数通过 I/O 等价验证。
这篇与你们目前的工程流程非常相似：
- 首先定义一套通用翻译规则。
- 遇到无法直接对应的语言特性时，增加专门的映射。
- 将整个大型项目拆成 Declaration / Dependency 等较小单位。
- 逐个验证，分析失败，然后改进翻译器。
最大的区别是：它依赖 LLM 进行翻译，主要使用 I/O 等价验证；你们希望进行结构化机械翻译，并进一步建立形式化的跨语言 Correspondence。
可以参考它的 Feature Mapping 和 Scalability Evaluation，但需要明确区分它的测试保证与你们希望建立的证明保证。

