## Universe Cumulativity：为什么需要 u ≤ v？
Rocq 支持 Universe Cumulativity，允许一个位于较低 Universe Level 的 Type，在满足约束的情况下，被当作较高 Universe Level 的 Type 使用。例如 Rocq 官方文档中的定义：
```coq
Polymorphic Definition le@{u v}
    (A : Type@{u}) : Type@{v} := A.
```
- 这里 `A : Type@{u}` 表示输入 `A` 是一个位于 Universe Level `u` 的类型
- `: Type@{v}` 表示声明要求返回一个位于 Universe Level `v` 的类型
- `:= A` 表示函数实际返回的就是 `A`，没有对它进行任何修改。
####  为什么 Rocq Kernel 要求 u ≤ v？
Rocq Kernel 检查这个 Definition 时，首先推断 Body `A` 的类型为 `Type@{u}`，但声明要求 Body 的类型为 `Type@{v}`。因此，Kernel 需要检查实际类型能否用于期望类型的位置。由于 Rocq 支持 Universe Cumulativity，只要满足：
$$
\boxed{u\leq v}
$$
就允许将 `A : Type@{u}` 当作 `A : Type@{v}` 使用。例如：

| u | v | 是否允许 | 原因 |
|---|---|---|---|
| 0 | 0 | Yes | 相同 Universe Level |
| 0 | 2 | Yes | 低层级可以用于高层级 |
| 2 | 0 | No | 高层级不能直接用于低层级 |

需要注意，这个 Definition 是 Universe Polymorphic 的，因此 Rocq 保存的是通用约束 `u ≤ v`，而不是把 `u` 和 `v` 固定成某两个具体数值。

## 为什么只扫描 AST 不够？
MetaRocq Exporter 导出的 Declaration 可以简化理解为两部分：
```text
Declaration: le
│
├── Type AST
│   └── Π (A : Type@{u}), Type@{v}
│
└── Body AST
    └── λ (A : Type@{u}) => A
```
通过 AST，我们能够发现 Declaration 使用了两个 Universe Levels：`u` 和 `v`
- 但是 AST 中并没有节点写着 `u ≤ v`。这个约束来自 Rocq Kernel 对 Body 的实际类型和声明的期望类型进行检查时所要求的 Cumulativity Relation。因此，Exporter 除了导出 Type AST 和 Body AST，还需要导出：
```text
Universe Levels:       u, v
Universe Constraints:  u ≤ v
```
这些信息可以从 Declaration 的 Universe Context 和 Rocq Kernel 的 Universe Graph 中提取。
