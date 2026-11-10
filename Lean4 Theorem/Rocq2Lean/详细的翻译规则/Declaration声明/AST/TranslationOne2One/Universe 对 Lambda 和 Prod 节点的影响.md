**单态 Universe 不改变 Prod / Lambda 的节点结构；它影响的是子项中的 Sort，以及声明和使用时需要满足的全局层级约束。** 下面对照 `lt` 和单态 `id`，区分这几个层面。

## 1. 源码与记号约定

以下假设两个定义都按单态方式声明，例如未开启 `Universe Polymorphism`：

```coq
Definition lt (n m : nat) := S n <= m.
Definition id (A : Type) (x : A) : A := x.
```

单态 `id` 自动生成的 universe 名字可能随环境、版本而不同，这里统一记为 `id.u0`。它是**全局共享的层级**，不是每次引用时重新实例化的 universe 参数。

下面的 AST 是简化示意，沿用原笔记的 **0 起始索引**：`rel 0` 指向最近引入的变量。Rocq 原生 `Constr.Rel` 的索引从 **1** 开始，不能把这里的数字直接当作原生 kernel 输出。参见 [Rocq 的 AST 接口](https://github.com/rocq-prover/rocq/blob/master/kernel/constr.mli)。

## 2. 两棵树的包装结构相同，子项不同

### lt

```text
type = prod(n, ind nat,
         prod(m, ind nat,
           sort Prop))

body = lam(n, ind nat,
         lam(m, ind nat,
           le (S (rel 1)) (rel 0)))
```

### 单态 id

```text
type = prod(A, sort Type@{id.u0},
         prod(x, rel 0,
           rel 1))

body = lam(A, sort Type@{id.u0},
         lam(x, rel 0,
           rel 0))
```

两者都是 **type 外面两层 Prod，body 外面两层 Lambda**。不同的是参数类型和最里面的子项，而不是包装节点的种类或层数。

`id` 中各个 `rel` 的含义如下：

| 位置 | 当时的局部上下文（从内往外） | 指向谁 |
| --- | --- | --- |
| 第二层 Prod / Lambda 的定义域 `rel 0` | `A` | `A`，即参数 `x` 的类型 |
| type 最里面的值域 `rel 1` | `x, A` | `A`，即函数的返回类型 |
| body 最里面的 `rel 0` | `x, A` | `x`，即函数返回的值 |

**检查 `x` 的类型时，`x` 还没有加入上下文**，所以此时 `A` 是 `rel 0`；进入值域或函数体后，`x` 成为最近的变量，`A` 就变成 `rel 1`。

## 3. Universe 信息出现在哪里

### 节点与子项的对照

| 对比项 | lt | 单态 id |
| --- | --- | --- |
| Prod / Lambda 自身是否带 level 字段 | 不带 | 不带 |
| 第一个参数的类型 | `ind nat`，具体的归纳类型 | `sort Type@{id.u0}`，一个 Sort |
| 第二个参数的类型 | `ind nat`，不依赖 `n` | `rel 0`，即 `A`，依赖第一个参数 |
| 返回类型 | `sort Prop`，不依赖参数 | `rel 1`，即 `A`，依赖第一个参数 |
| 显式出现的 Sort 子项 | `sort Prop` | `sort Type@{id.u0}`，其中含命名层级 |

**Prod / Lambda 没有 level 字段，不代表它们不受 Universe 影响**：kernel 仍要检查参数类型是否合法，并计算 Prod 自己所在的 Sort。节点字段可见 [Rocq 的 Prod 与 Lambda 定义](https://github.com/rocq-prover/rocq/blob/master/kernel/constr.mli)。

### 类型检查时的 Sort 对照

| 检查对象 | lt | 单态 id |
| --- | --- | --- |
| 第一个参数的类型本身 | `nat : Set` | `Type@{id.u0} : Type@{id.u0+1}` |
| 第二个参数的类型本身 | `nat : Set` | `A : Type@{id.u0}` |
| 整个声明类型所在的 Sort | `Type@{Set+1}`，通常写作 `Type₁` | `Type@{id.u0+1}` |

这里要区分 **返回类型是 `Prop`** 和 **返回类型的类型是 `Prop`**。`lt` 的返回类型是 `Prop`，但 `Prop : Type₁`，所以 `nat -> nat -> Prop` 本身位于 `Type₁`，不是 `Prop`。这些层级由 [Rocq 的 Sort 与 Prod 类型规则](https://rocq-prover.org/doc/V9.1.1/refman/language/cic.html)决定。

## 4. 单态影响的是层级共享与约束

| 对比项 | lt | 单态 id |
| --- | --- | --- |
| 声明的 universe 模式 | Monomorphic | Monomorphic |
| 声明引入的命名层级 | 此例不需要新增层级 | 引入全局层级 `id.u0` 及相关约束 |
| 常量引用的 universe 实例 | `const lt []` | `const id []`，同样为空 |
| 具体应用的层级检查 | `lt 2 5` 不涉及可变层级的选择 | `id nat 3` 要满足 `Set ≤ id.u0` |
| 典型的 universe 失败 | 此例没有层级冲突 | 不同使用点对同一个 `id.u0` 的要求可能冲突 |

**空实例 `[]` 不等于没有 Universe。** 它只表示引用时不传入多态 universe 实参；单态 `id` 的类型中仍然引用全局的 `id.u0`。

也不能说“每次使用 `id` 都会新增约束”。更准确地说：使用时必须满足相应约束；若现有全局图已经蕴含该约束，就不需要新增。使用点的 elaboration 可以提出约束，kernel 则核验项是否在给定的 universe 环境下合法。

例如，把单态 `id` 用在它自己的类型上，会要求：

```text
id 的类型 T = forall (A : Type@{id.u0}), A -> A
T : Type@{id.u0+1}

要把 T 作为 id 的第一个参数，必须满足：
id.u0 + 1 ≤ id.u0
```

这个约束不可能成立，因此产生 universe inconsistency。单态层级的共享和这个自应用问题，见 [Rocq 官方手册的 identity 示例](https://rocq-prover.org/doc/V9.1.1/refman/addendum/universe-polymorphism.html)。

## 5. 计算与翻译到 Lean

Universe 检查不同，但这两个函数的计算仍然遵循常量展开和函数应用：

```text
lt 2 5   →δβ  S 2 <= 5
id nat 3 →δβ  3
```

翻译时应分开处理两个层面：

- **项结构**：Prod 对应 Lean 的 `forallE`，Lambda 对应 `lam`；递归翻译参数类型和内部子项。
- **Universe 环境**：`lt` 主要涉及固定 Sort 的映射；单态 `id` 还需要一致地处理 `id.u0` 和相关约束，不能仅凭引用处的空实例 `[]` 就忽略它。

`id` 中后续类型依赖 `A`，是依赖函数结构的体现，**不是单态 Universe 特有的能力**；多态 `id` 也可以保留相同的参数依赖关系。

## 一句话总结

**两者的 Prod / Lambda 包装骨架相同；单态 `id` 的特殊之处，是 Sort 子项中引用了全局共享的 `id.u0`，所有使用点都必须与这套层级约束相容。**
