z## 1. Expression、Declaration 和 Environment 的区别
在 Rocq 和 Lean 中，Expression（表达式）和 Declaration（声明）属于两个不同的层次，而 Environment（环境）负责保存和管理这些声明。
- Expression（Expr）：描述一个 Term 的内部结构，例如变量、函数应用、Lambda、函数类型，甚至整个函数的实现。
- Declaration：表示一个全局定义，包含 Name、Type、Value（如果存在）、Universe Parameters 等信息，并注册到 Environment 中。
- Environment：保存已经注册的 Declarations，使后续 Expression 能够通过名称引用它们，并让 Kernel 获取相关类型和定义进行检查。
核心区别是：**Expression 是构造程序和证明的基本单位，而 Declaration 是将这些 Expressions 组织起来、赋予全局身份并注册到 Environment 中的单位。**
## 2. Expression：描述 Term 的内部结构
在 Rocq 和 Lean 的 Dependent Type Theory 中，Expression 不仅可以表示普通 Value，还可以表示 Type，因为类型本身也是 Term。例如，`Nat`、`Nat.zero`、`Nat.succ Nat.zero`、`fun (x : Nat) => x` 和 `Nat → Nat` 都属于 Expressions。

在 Lean Kernel 中，Expression 使用 `Lean.Expr` 表示，常见的 AST Nodes 如下：

| Expr Node | 含义 | 例子 |
|---|---|---|
| `sort` | Universe / Sort | `Type u`、`Prop` |
| `const` | 引用全局 Declaration | `Nat`、`Rocq.id` |
| `bvar / fvar` | 绑定变量 / 局部自由变量 | `x` |
| `app` | Function Application | `f x` |
| `lam` | Lambda Function | `fun x => x` |
| `forallE` | Function Type / Dependent Function Type | `(x : A) → B x` |
| `letE` | Local Definition | `let x := 1; x` |
| `mvar` | 尚未求解的 Metavariable | `?m` |

例如：

```lean
fun (x : Nat) => x
```

它的内部 AST 可以简化为：

```text
Expr.lam
  ├── Parameter Type: Expr.const Nat
  └── Body: Expr.bvar 0
```

这一整棵 AST 就是一个 Lean Expression，它描述了一个 Lambda Function，但仅仅生成这个 Expression，并不意味着 Lean Environment 中已经注册了一个全局函数。

## 3. Declaration：把 Expressions 组织成全局声明
例如 Rocq：
```coq
Definition id (A : Type) (x : A) : A := x.
```

Rocq Kernel 会将其保存为一个全局 Declaration，其中包含 Type、Body 和 Universe Information 等。翻译到 Lean 后，假设得到类似：
```lean
def Rocq.id.{u} (A : Type u) (x : A) : A := x
```

它对应的 Lean Declaration 可以简化理解为：
```text
Declaration:
  Name: Rocq.id
  Universe Parameters: u
  Type Expr: ∀ (A : Type u), A → A
  Value Expr: fun (A : Type u) (x : A) => x
  Kind: Definition
```

这里最重要的是：**Type 和 Value 都是 Expressions，但整个 Declaration 本身不是 Expression。** Declaration 是更高一层的数据结构，负责将这些 Expressions 与全局 Name、Universe Parameters 等信息组合起来。Lean 的 `DefinitionVal` 就包含 `name`、`levelParams`、`type`、`value` 等信息。

## 4. Expression 如何引用 Environment 中的 Declaration？

假设 `Rocq.id` 已经被注册到 Lean Environment，现在定义另一个函数：

```lean
def use_id (A : Type) (x : A) :=
  Rocq.id A x
```

这里的 `Rocq.id A x` 本身也是一个 Expression，其内部 AST 可以简化为：

```text
Expr.app
  ├── Expr.app
  │     ├── Expr.const Rocq.id
  │     └── A
  └── x
```

其中 `Expr.const Rocq.id` 只是对全局 Declaration 的引用，并不会将 `Rocq.id` 的整个 Definition 复制到当前 AST 中。Lean 进行 Type Checking 时，会通过 `Expr.const` 保存的 Name 和 Universe Instance，在 Environment 中找到对应的 Declaration，然后获取它的 Type 和 Universe Parameters，实例化本次调用的 Universe Levels，并检查输入参数 `A` 和 `x` 是否符合要求。

因此，二者的关系是：

```text
Current Expression
    │
    └── Expr.const Rocq.id
              │
              │ Lookup by Name
              ▼
        Lean Environment
              │
              └── Declaration: Rocq.id
                    ├── Name
                    ├── Universe Parameters
                    ├── Type Expr
                    └── Value Expr
```

也就是说，**`Expr.const` 负责引用，而 Environment 负责保存被引用 Declaration 的完整信息。**

## 5. 回到 Rocq2Lean Translation

这就解释了为什么 Rocq2Lean 的翻译过程需要区分 `trans` 和 Declaration Creation 两个阶段。`trans` 负责把 Rocq AST 转换成 Lean Expressions，但这些 Expressions 还不能直接成为最终 Declaration，因为还需要处理 Name、Universe Parameters、Dependencies 和 Kernel Checking。

整个过程可以概括为：

```text
Rocq Global Declaration
  (Constant / Inductive)
           ↓
      MetaRocq Export
           ↓
Source IR + Universe Metadata
           ↓
    Recursive trans
           ↓
 Lean Type / Value Expr
           ↓
Universe Solving + Checks
           ↓
 Lean Declaration Creation
           ↓
    Lean Kernel Check
           ↓
     Lean Environment
```

对于普通 Constant，翻译器分别将 Source Type AST 和 Body AST 转换成 Lean Type Expr 和 Value Expr。这些表达式可能暂时包含 Universe Metavariables，需要进一步通过 Unification、Universe Solving 和 Generalization 确定最终的 Universe Parameters，然后才能生成并注册 Declaration。

此外，并不是所有 Declaration 都具有普通 Definition 那样的 Type + Value 结构：

| Declaration | 主要组成 |
|---|---|
| `Definition` | Type Expr + Value Expr |
| `Theorem` | Statement（Type）+ Proof（Value） |
| `Axiom` | Type，没有 Definition / Proof Body |
| `Inductive` | Parameters、Arity、Constructors、Universe Metadata 等 |

Lean 根据声明类别使用不同的 Declaration 形式，例如 `defnDecl`、`thmDecl`、`axiomDecl` 和 `inductDecl`。对于 Inductive，Lean Kernel 还会生成对应的 Constructors 和 Recursors。需要注意，Rocq2Lean 当前的 Statement-only Translation 只翻译 Theorem Statement，并不直接翻译原始 Rocq Proof，也不会因为存在 Statement 就认为证明已经完成。

总结：**`trans` 解决的是“如何将 Rocq Term 变成 Lean Expression”，Declaration Creation 解决的是“如何将这些 Expressions 组织成合法的全局声明”，而 Environment 则负责保存这些声明，供后续表达式引用和 Kernel 检查。**