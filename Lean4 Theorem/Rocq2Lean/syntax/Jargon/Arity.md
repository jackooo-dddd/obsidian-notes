Arity 是一个 Inductive Type 的类型签名（Type Signature）。它描述这个归纳类型需要接受哪些参数，以及最终生成的类型属于哪个 `Sort`。
对于 Rocq 的 Inductive，Arity 主要由三个部分组成：
1. Parameters：归纳类型的固定参数。
2. Indices：用来区分不同类型实例的索引（可以没有）。
3. Result Sort：最终生成的类型处于哪个 Universe。
Arity（Declaration Type）规定 Inductive 类型接受什么参数、结果属于哪个 Sort