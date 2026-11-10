[[Template and Nontemplate Inductive]]
[[Global Universe and Universe Parameter]]
[[Sort, Type and Universe]]
![[Pasted image 20261022121644.png|548]]
三个核心环节：
- **语法和表达式**：`trans` 将完整 Arity 和所有 Constructor Types 转换为 Lean Expressions，并通过临时 `self` 处理当前归纳类型的递归引用。
- **Universe 处理**：为整个 Block 建立统一的层级映射，通过 Type Checking 与 Unification 求解临时层级，并确定最终的 Universe Parameters。
- **翻译正确性**：检查翻译后的 inductive 是否符合源 Universe 信息，最后将整个归纳声明交给 Lean Kernel。
## Step 1. 准备 Arity AST 和 Constructor Type AST
例如，Rocq 中：
```
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.

# 如果把隐藏的 Universe Parameter `u` 显示出来
Inductive list@{u} (A : Type@{u}) : Type@{max(Set,u)} :=
| nil  : list@{u} A
| cons : A -> list@{u} A -> list@{u} A.
```
- `u`：Universe Parameter， `list` 的 Template Universe Level，可以根据传入的 `A` 实例化。
- `A : Type@{u}`：输入参数 `A` 是一个位于 Universe `u` 的类型。
这是一个完整的 Inductive Declaration（归纳类型声明），定义了一个列表类型和如何构造列表中的值

| 概念                    | 例子                      | 具体含义                           |
| --------------------- | ----------------------- | ------------------------------ |
| Inductive Declaration | 整个 `Inductive list ...` | 定义归纳类型及其所有构造器的完整声明             |
| Inductive Type        | `list`                  | 这个声明引入的归纳类型                    |
| Type Constructor      | `list`                  | 接收类型参数 `A`，产生新类型 `list A`      |
| Arity                 | `∀ A : Type, Type`      | 描述 `list` 接收什么参数，以及结果属于哪个 Sort |
| Data Constructors     | `nil`、`cons`            | 用于构造 `list A` 类型中的具体值          |
| Constructor Types     | `A → list A → list A`   | 描述数据构造器需要什么参数，以及最终构造什么类型的值     |

- Arity 描述的是 Type Constructor `list` 的类型签名。
- Constructor Type：cons 自身的类型
Exporter 会导出整个 Block 的结构。其中交给 `trans` 的主要表达式是：

| AST                               | 描述什么                                   | `list` 中的内容                           |
| --------------------------------- | -------------------------------------- | ------------------------------------- |
| **Arity AST**                     | `list` 接受什么参数，以及 `list A` 属于哪个 `Sort`。 | `∀ A : Type@{u}, Type@{max(Set,u)}`   |
| **`nil` 的 Constructor Type AST**  | `nil` 接受哪些参数，构造什么类型的值                  | `∀ A : Type@{u}, list A`              |
| **`cons` 的 Constructor Type AST** | `cons` 接受哪些参数和字段，构造什么类型的值              | `∀ A : Type@{u}, A → list A → list A` |

下面两种表达在含义上完全相同：
写法 1：使用 `forall`
```coq
forall (A : Type@{u}), Type@{max(Set,u)}
```
写法 2：使用 `∀`
```coq
∀ A : Type@{u}, Type@{max(Set,u)}
```
- `A : Type@{u}`：参数 `A` 本身是一个位于 Universe `u` 的类型。
- `Type@{max(Set,u)}`：结果 `list A` 属于这个 Universe。
这里的 `Type@{max(Set,u)}` 是 Rocq 实际导出的 `list` 的返回 Sort，表示 `list A` 所在的 Universe Level 由 `Set` 和 `u` 中较高的那个决定。为了方便理解，我们把 Rocq 自动生成的较长 Universe Level 名字简写成了 `u`。[实际导出记录](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/results/casestudy/exports/Datatypes/source.ndjson#L43)
##### Arity 是整个类型构造器 (list) 的类型签名
 Arity 描述一个类型构造器接收哪些参数，以及传入这些参数后，会得到一个属于什么 Sort 的类型。
- 对于`Inductive list (A : Type) : Type := ...`, Arity 描述的是 list 接受一个类型参数 A，然后返回一个类型。
- 因此，完整 Arity 包含参数绑定 `∀ (A : Type@{u}), Type@{max(Set,u)}`
##### Constructor Type 同样包含参数绑定
例如 `nil` 的完整类型是：`∀ (A : Type@{u}), list A`
不是单独的 `list A`
所以翻译器可以直接翻译完整的 Arity AST 和 Constructor Type AST，不需要另外把参数重新拼接进去。
##### Inductive 不需要 Constant 那样的 Value Body
对于 Constant，我们需要翻译 Type AST 和 Body AST
对于 Inductive，我们主要翻译 Arity AST 和 所有 Constructor Type AST
[IR 中的归纳声明结构](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/IR.lean#L97-L125)

## Step 2. 为整个 Inductive Block 建立 Universe 映射
在翻译 Inductive 的 Arity 和 Constructor Types 之前，先决定 Rocq 中的 Universe Levels 如何在 Lean 中表示，并保证整个 Inductive 使用同一套表示。

|概念|含义|示例|
|---|---|---|
|Source Level|Rocq 声明中的 Universe Level|`u`、`v`|
|Lean Universe Parameter|生成的 Lean 声明公开接受的 Level 参数|`s`、`a`、`b`|
|Lean Universe Metavariable|翻译过程中尚未确定的 Level|`?m`|

我们要构建一个从 Rocq Universe Level 到 Lean Level Expression 的映射表：
$$
\mathcal U:\text{Rocq Level}\rightarrow\text{Lean Level Expression}
$$
例如：
$$
\mathcal U(u)=a,\qquad \mathcal U(v)=\max(a,b)
$$
告诉翻译器：当 Rocq AST 中出现 Universe Level `u` 或 `v` 时，应该分别使用 Lean 中的 `a` 或 `max(a,b)` 来表示，从而让整个 Declaration 的 Universe 解释保持一致。
##### 2.1 为什么必须统一处理整个 Inductive Block？
```coq
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```
Inductive Translation 不能分别独立翻译 Arity、`nil` 和 `cons`，因为它们共同定义的是同一个 Inductive Type。因此，整个 Block 必须保证两件事：Universe Parameters 一致，以及 Constructors 中的递归引用指向同一个 Inductive Type。
整个 Inductive Block 必须统一处理两个方面：
- Universe Mapping：确保 Arity 和 Constructors 使用兼容的 Universe Parameters。
- Recursive Reference（`self`）：确保所有 Constructors 中的 `list A` 都指向当前正在定义的同一个 Inductive Type。
###### Universe Parameters 一致
假设 Arity 已经确定 `list` 的 Universe Parameter 是 `s₁`：
```text
list.{s₁} (A : Sort s₁)
```
但如果 `cons`独立使用另一个 Universe Parameter `s₃`：
```text
cons : (A : Sort s₃) →
       A → list.{s₃} A → list.{s₃} A
```
那么 `cons` 使用的 `A` 和 `list A` 就可能与 Arity 已经确定的 Universe 要求不兼容，导致类型不匹配。因此，不能让每个 Constructor 独立决定自己的 Universe Mapping。

解决方式是先为整个 Block 建立一套共享映射。假设 Rocq 中 `A` 的 Universe Level 是 `u`，翻译器首先建立：`Rocq Level u → Lean Level s`
然后所有部分都复用这套映射：
```text
Arity : A : Sort s
nil   : A : Sort s
cons  : A : Sort s
```
这样 Arity 和所有 Constructors 使用的都是兼容的 Universe Parameters。
###### Inductive Type 一致：使用临时 `self`
除了 Universe Parameters，`nil` 和 `cons` 中的 `list A` 也必须引用当前正在定义的同一个 Inductive Type。例如：
```coq
cons : A -> list A -> list A
```
这里出现了两次 `list A`。但翻译器此时还在创建 `list`，它尚未正式加入 Lean Environment，因此不能像普通 Global Constant 一样直接引用已经存在的 Declaration。
为了解决这个问题，翻译器使用临时的 `self`，表示当前正在创建的 Inductive Type：
```text
正在创建 list
    ├── Arity：定义 list 的类型
    ├── nil：返回 self A
    └── cons：A → self A → self A
```
这里的 `self A` 就代表当前的 `list A`。因此，`cons` 中的递归参数和返回类型都会引用同一个 Inductive，而不会错误地指向另一个类型。
需要注意，`self` 只是翻译过程中的临时引用，不会额外生成一个名为 `self` 的 Inductive Type。整个 Block 构建完成后，这些引用都会对应到最终生成的 `list` Declaration。
### 2.2 Template Inductive：根据 Metadata 决定 Universe 参数
- 这是 `list` 所使用的路径
##### 第一步：从 Metadata 找到 Universe 与普通参数的关系
Rocq：
```
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```
假设 Exporter 将参数类型记录为 `A : Type@{u}`
对于这个 Template Inductive，`native.template_info` 告诉翻译器：
```
Template Level: u
Bound Parameter: A
Parameter Position: 0
```
- 它的含义是：`u` 是与类型参数 `A` 关联的 Template Level。`list` 的实例可以通过 `A` 的实际 Sort 来确定这个 Level 的目标表示。
源码中的 `templateBinding` 会验证参数 AST 与 Metadata 是否匹配，包括 Template Level 是否正确绑定到参数类型。
##### 第二步：创建 Lean Universe Parameter
假设 Rocq 中的 Template Universe Level 为 `u`，翻译器为它创建对应的 Lean Universe Parameter `s`：
$$
u \longmapsto s
$$
这里需要注意，普通 Global Level 和 Template Inductive 的 Universe 翻译方式有所不同。
对于普通 Rocq Global Level，通常采用：
$$
\mathrm{Type@}\{u\} \longmapsto \mathrm{Sort}(s+1)=\mathrm{Type}\ s
$$
而对于当前支持 Sort 参数的 Template Inductive，翻译器使用 R5/R8 的特殊处理：
$$
\mathrm{Type@}\{u\} \longmapsto \mathrm{Sort}\ s
$$
因此，Rocq 中的参数 `A : Type@{u}` 会被翻译为 Lean 中的 `A : Sort s`. 这里的关键是：`s` 表示参数 `A` 所属的完整 Sort Level，而不是直接复制 Rocq 中的 Universe Level 数值。
例如：

| 实际传入的 A | A 所属的 Sort | Lean 中的 s |
|---|---|---|
| `Nat` | `Type 0 = Sort 1` | `1` |
| `Type 0` | `Type 1 = Sort 2` | `2` |
| `P : Prop` | `Prop = Sort 0` | `0` |

这样，翻译器就可以通过不同的 `s` 来表示不同 Sort 层级的类型，包括 `Prop` 和各层 `Type`，使同一个 Lean Inductive Declaration 能够支持不同层级的元素类型。[[Sort, Type and Universe]]
##### 第三步. 为什么翻译后的 `list A` 属于 `Sort (max 1 s)`？
回到 Rocq 的定义：
```coq
Inductive list (A : Type) : Type := ...
```
这里结尾的 `: Type` 表示 `list A` 属于 `Type` 层级，而不是 `Prop`。因此，尽管我们允许参数 `A : Sort s`，也不能直接生成：
```lean
inductive Rocq.list.{s} (A : Sort s) : Sort s
```
原因是当 `s = 0` 时：
```lean
A      : Prop
list A : Prop
```
但原来的 `list` 是普通数据类型，具有相应的构造和消去行为，不能直接将其降为命题类型。
因此，翻译器为结果 Sort 保留最低层级 `1`，确保 `list A` 始终属于 `Type`，而不是 `Prop`：

$$
\boxed{\mathrm{list}\ A : \mathrm{Sort}(\max(1,s))}
$$

| Lean Universe Parameter | `A` 所属的 Sort | `list A` 所属的 Sort |
|---|---|---|
| `s = 0` | `Prop` | `Sort 1 = Type 0` |
| `s = 1` | `Type 0` | `Sort 1 = Type 0` |
| `s = 2` | `Type 1` | `Sort 2 = Type 1` |

因此，最终可以得到以下形式：
```lean
inductive Rocq.list.{s} (A : Sort s) : Sort (max 1 s) where
  | nil : Rocq.list A
  | cons : A → Rocq.list A → Rocq.list A
```
源码中的 `typeFloor` 就是用于在结果必须属于 `Type` 的情况下，为 Sort Level 添加非 `Prop` 的下界 `1`。
##### 第四步：得到最终的 Universe 映射
现在整个 Block 可以使用：
```
Source Template Level:
    u

Template Metadata:
    u ← parameter A

Lean Parameter:
    s

Shared Mapping:
    u ↦ s

Translation Convention:
    Type@{u} ↦ Sort s

Result Sort:
    Sort (max 1 s)
```
最终声明（省略长命名空间）：
```
inductive Rocq.list.{s}
    (A : Sort s) : Sort (max 1 s) where
  | nil : Rocq.list A
  | cons : A → Rocq.list A → Rocq.list A
```
它与仓库中生成的 [Corelib list 声明](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/results/corelib-complete/Corelib/Init/Datatypes.txt?utm_source=chatgpt.com#L377-L386) 对应。
### 2.3 Non-template Inductive：使用 Universe Parameters 和 R2F 处理约束
Non-template Inductive 不依靠 Template Metadata 将 Universe Level 绑定到某个类型参数，而是根据整个 Block 的源 Universe Levels 及其 Constraints 建立映射。
翻译器主要有两种处理方式：直接使用独立的 Lean Universe Parameters（Plain），或者使用 R2F 将源 Universe Constraints 编码到 Lean Level Expressions 中。
###### 情况 A：Plain——使用独立的 Universe Parameters
假设某个 Non-template Inductive Block 使用两个源 Universe Levels：`u, v`
如果不需要额外编码它们之间的约束，翻译器可以直接建立映射：
$$
u \mapsto a,\qquad v \mapsto b
$$
例如将：
```coq
A : Type@{u} 和 B : Type@{v}
```
翻译为：
```lean
A : Type a 和 B : Type b
```
这里 `a`、`b` 是独立的 Lean Universe Parameters，可以在使用目标声明时分别实例化。由于没有额外的关系需要保证，翻译器不必使用复杂的 Level Expressions。
这就是源码中的 `plain` 路径。
##### 情况 B：R2F——处理源 Universe Constraints
假设 Rocq 中存在约束：
$$
u \leq v
$$
考虑一个Non-template Inductive：
```coq
Inductive box (A : Type@{u}) : Type@{v} :=
| mk : A -> box A.
```
这里 `A` 位于 Universe `u`，而 `box A` 位于 Universe `v`。由于 Constructor `mk` 需要保存一个 `A` 类型的元素，源系统要求 `u ≤ v`。如果直接使用 Plain Mapping：
$$
u \mapsto a,\qquad v \mapsto b
$$
得到：
```lean
inductive Rocq.box.{a, b}
    (A : Type a) : Type b where
  | mk : A → Rocq.box A
```
这通常无法通过 Lean Kernel，因为 `a` 和 `b` 是独立参数，Lean 无法保证 `a ≤ b`。Rocq 中虽然存在这个 Constraint，但 Lean 的普通 Universe Parameters 不会自动携带它。
因此，翻译器可以使用 R2F，将源 Universe Constraints 编码进目标 Level Expressions：
$$
\boxed{u \mapsto a,\qquad v \mapsto \max(a,b)}
$$
翻译结果为：
```lean
inductive Rocq.box.{a, b}
    (A : Type a) : Type (max a b) where
  | mk : A → Rocq.box A
```
因为无论 `a`、`b` 如何实例化，都有：
$$
a \leq \max(a,b)
$$
所以源约束 `u ≤ v` 始终得到满足。
例如：

| Lean 参数 | 实际值 |
|---|---|
| `a` | `1` |
| `b` | `0` |
| `u ↦ a` | `1` |
| `v ↦ max(a,b)` | `1` |

此时 `u ≤ v` 对应 `1 ≤ 1`，约束成立。如果选择 `a = 1, b = 2`，则得到 `u = 1, v = 2`，仍然满足约束。因此，R2F 并不是将 `u` 和 `v` 强行合并成同一个 Universe，而是在保留不同层级可能性的同时，确保它们之间的关系成立。
###### 如果源约束是严格的 `u < v` 呢？
对于 $u < v$, 可以使用：
$$
u \mapsto a,\qquad v \mapsto \max(b,a+1)
$$
因为 $a < \max(b,a+1)$
实际 R2F 实现会根据整个 Block 的 Universe Facts 递归构建这些 Level Expressions，而不只是处理单个 `u ≤ v` 约束。
###### 实际翻译时，先尝试哪一种？
根据当前源码，普通 Non-template Inductive 通常优先尝试更简单的 `plain` 路径。如果失败，再尝试 Unification 或 R2F Constraint Interpretation 等处理。
因此，并不是所有 Non-template Inductive 都需要 `max` 或 `succ`，只有当源 Universe Constraints 或目标类型检查需要这些关系时，才引入更复杂的 Level Expressions。

| 处理方式 | Universe Mapping | 适用情况 |
|---|---|---|
| Plain | `u ↦ a, v ↦ b` | 独立参数已经足以完成翻译 |
| R2F（非严格） | `u ↦ a, v ↦ max(a,b)` | 需要保证 `u ≤ v` |
| R2F（严格） | `u ↦ a, v ↦ max(b,a+1)` | 需要保证 `u < v` |

核心区别是Plain 直接使用独立的 Lean Universe Parameters；R2F 则通过 `max` 和 `succ` 将 Rocq 的 Universe Constraints 转换为 Lean Level Expressions，从而保证这些约束对目标参数实例成立。
对应源码：
- [ownLevelInterp（R2F）](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Translate.lean#L3813-L3845)
- [Inductive Translation 重试路径](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L2799-L2832)
### 2.4 哪些 Universe Levels 会先成为 Metavariables？
前面介绍的两条主要路径，Level 通常都是参数：
```
Template:
    u → s
Non-template:
    u → a
    v → max(a,b)
```
但不是所有 Level 都能在这一步确定。
##### 情况 A：Template Block 中没有被 Metadata 绑定的额外 Levels
假设一个 Template Inductive 涉及：
```
u：由参数 A 绑定的 Template Level
m：额外的 Global Level
```
最初建立：

|源 Level|Lean 表示|原因|
|---|---|---|
|`u`|`s`|已由 Template Metadata 绑定|
|`m`|`?m`|不是 Template Level，需要进一步确定|

之后翻译 Arity 和 Constructor Types。
假设在检查 Constructor Types 时，Lean 的 Unification 确定：?m=s
那么 `m` 可以采用这个解，但翻译器还需要验证该解满足源 Universe Facts。
如果 `?m` 仍然完全自由，则可以将它泛化成额外的 Universe Parameter，例如：
```
m → u_m
```
如果只得到了部分解，例如：
```
?m = max(s, ?n)
```
其中 `?n` 仍未确定，源码目前会拒绝这种未完全求解的情况。
因此，Template 路径的原则是：Metadata 已绑定的 Levels 直接参数化；额外 Levels 先尝试 Unification，再决定是否可以合法地泛化或消去。

##### 情况 B：引用其他 Declaration 时产生的临时 Levels
假设 Inductive 的 Constructor Type 引用了一个之前已经翻译好的 Constant：
```
Rocq.someConst.{?k} ...
```
其中 `?k` 是被引用声明的 Universe Instance，目前还不知道应该选择什么值。
如果这个 Constant 的参数与当前 Inductive 的 `A : Type a` 发生类型约束，那么 Unification 可能得到：`?k=a`. 这种情况下，`?k` 只是一个用于确定引用实例的临时变量，并不是当前 Inductive 的新 Universe Parameter。
但如果 `?k` 始终自由，翻译器需要进一步决定：
- R3G 能否将它识别成有意义的隐式 Source Level，并把它加入整个 Block 的 Universe Parameters？
- 如果不能，R3″ 能否在不违反引用约束的前提下，将剩余实例 Level 取为最低值 `0`？
- 如果这两种处理都无法保证正确性，则拒绝该候选翻译。
这里也有一个关键区别：Constructor Types 中直接决定公开类型接口的 Levels，不能简单地按照 Constant 的 Body-only Levels 随意默认化。 但 Constructor Type 里面某个被引用 Constant 的自由实例参数，仍然可能在 R3 检查允许时选择最小实例。

### Step 3. `trans`：翻译 Arity 和所有 Constructor Types
现在已经获得：
- 完整 Arity AST；
- 所有 Constructor Type AST；
- 整个 Block 共用的 Universe 映射。
接下来使用 `trans`，递归构造 Lean Expressions。
##### 3.1 翻译 Arity AST
对 `list`，源 Arity 可以理解为：`∀ (A : Type@{u}), Type@{max(Set,u)}`
在前面选定的 `Sort` 表示下，翻译结果为：
```
(A : Sort s) → Sort (max 1 s)
```
翻译器将这个结果保存为：`ty : Expr`
`trans` 在这个过程中主要处理：

|源结构|处理方式|
|---|---|
|`prod`|创建局部变量，递归翻译后重新构造 `forallE`|
|`sort`|根据 Universe 映射生成 `Expr.sort`|
|`rel`|解析对应的局部绑定变量|
|`app`|翻译函数和参数，构造 application|
|已有声明的引用|构造目标引用及相应 Universe Instance|

此时，我们已经知道将来的 `list` 应当具有什么类型，但还没有正式创建它。[Arity 翻译](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L1430-L1469)
##### 3.2 创建临时 `self`
翻译 `cons` 时，需要表达：
```
A → list A → list A
```
但当前的 `list` 尚未加入 Lean Environment。
因此，翻译器先建立一个局部变量：
```
self : (A : Sort s) → Sort (max 1 s)
```
`self` 代表当前正在定义的类型构造子，所以：
- `self A` 表示它在参数 `A` 处的实例。
这里不需要为 `self` 提供实现；它只是构造当前归纳声明时使用的局部对象。
##### 3.3 将源递归引用对应到 `self`
源 Constructor Type AST 中，对当前归纳类型的引用已经表示成局部 `rel`。
例如，`nil` 的 AST 可以简写为：
```
Prod A (Sort Type@{u})
  (App (Rel 1) [Rel 0])
```
在这里：

|节点|指向什么|
|---|---|
|`Rel 0`|参数 `A`|
|`Rel 1`|当前归纳类型，对应目标中的 `self`|

翻译器将 `self` 放入初始局部上下文，再进入参数 `A` 的 Binder。这样，`trans` 就可以将这两个引用解析到正确的目标变量。
- 最终，`nil` 的临时类型是：`(A : Sort s) → self A`
- 同样，`cons` 的临时类型是：`(A : Sort s) → A → self A → self A`
所有构造器都在同一个 `self` 和同一套 Universe 映射下翻译。[`self` 与构造器翻译](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L1470-L1488)
##### 3.4 翻译过程中也会进行类型检查
得到某个 Constructor Type 后，翻译器会尝试：
```
Meta.check constructorType
```
类型检查不仅检查表达式结构，也会尽可能求解其中的 Universe Metavariables。
因此，表达式构建与 Universe 求解并不是完全分离的：某些层级在 `trans` 和应用检查过程中就已经得到确定，Step 4 再完成剩余处理。
##### 3.5 Step 3 的最终结果
现在得到的内容可以表示为：
```
Type Expr：
  (A : Sort s) → Sort (max 1 s)

nil 的临时 Constructor Type：
  (A : Sort s) → self A

cons 的临时 Constructor Type：
  (A : Sort s) → A → self A → self A
```
这些 Expressions 可能仍然包含未解决的 Universe Metavariables，而且构造器中的 `self` 还需要替换为最终目标引用。
## Step 4. 求解 Universe，并确定最终参数
Inductive 的这一阶段主要依靠：
- Constructor Types 和其中应用表达式的 Type Checking；
- Universe Unification；
- 额外层级的 Generalization；
- 残余引用层级的受检查处理。
并没有直接复用 Constant 的 `solveLevels` 流程。
##### 4.1 通过 Type Checking 与 Unification 求解引用层级
考虑一个 Constructor Field 使用 `list A` 的 Inductive：
```coq
Inductive ListBox (A : Type) : Type :=
| box : list A -> ListBox A.
```
假设翻译当前 Block 时，参数 `A` 已经表示为：
```lean
A : Sort r
```
Rocq.list.{?s} A` 到底是什么意思以及为什么要创建?s: 
- [[Rocq.List 实例化 (Inside Lean)]]
当翻译器遇到 `list A` 时，会先为这次引用创建一个新的 Universe Metavariable `?s`：
```lean
Rocq.list.{?s} A
```
之前已经翻译完成的 `Rocq.list` 接口要求：
```text
Rocq.list.{?s} 期望的参数类型：Sort ?s
实际传入的 A 的类型：          Sort r
```
因此，Lean Type Checking 需要统一这两个 Sort：
$$
\mathrm{Sort}\ ?s \equiv \mathrm{Sort}\ r
$$
Universe Unification 可以求得：
$$
\boxed{?s := r}
$$
于是，原来的字段类型 `Rocq.list.{?s} A`, 最终变成 `Rocq.list.{r} A`
这里需要区分两个 Universe Levels：
- `r`：当前 Inductive Block 已经确定的公开 Universe Parameter。
- `?s`：引用 `Rocq.list` 时临时创建的 Universe Metavariable，由 Unification 求解。
因此，Template Inductive 的引用在当前翻译路径中，主要通过创建 Universe Metavariables，再利用实际参数的 Type Checking 和 Unification 来确定正确的 Universe Instance，而不是为每次引用独立选择一个固定层级。
##### 4.2 将仍然自由的额外层级泛化为参数
对于 Step 2 创建的额外非模板层级，代码会区分：

|求解状态|后续处理|
|---|---|
|已求解为完整的 Level Expression|保留该表达式，并检查源 Universe Facts|
|仍然是完全自由的 Metavariable|转换为额外的公开 Universe Parameter|
|只得到包含未解变量的部分表达式|当前路径不能接受|

- 例如 `?m := max(a, b)` 可以保留为最终的符号表达式。
- 如果 `?m` 仍然完全自由，则可能泛化为 `?m → u_m`. 这样，最终声明增加一个公开 Universe Parameter，而不是任意固定它。
此外，某些需要保留的层级只通过其他声明的引用出现，没有直接写在当前 Arity 的 Sort 中。R3G 可以发现符合条件的这类隐含层级，将它们补入公开参数，并重新翻译当前 Block。[额外层级处理与隐含层级发现](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L1489-L1611)
##### 4.3 确定最终参数表，并替换 `self`
公开 Universe Parameters 确定后，翻译器形成最终的：
```
lparams
```
例如，`list` 的简化情况是 `lparams = [s]`
然后把构造器中的 `self` 统一替换成 `Rocq.list.{s}`
于是得到：
```
nil：
  (A : Sort s) → Rocq.list.{s} A

cons：
  (A : Sort s) →
  A →
  Rocq.list.{s} A →
  Rocq.list.{s} A
```
这里所有构造器内部的递归引用，都使用同一组最终 Universe Parameters。[替换 `self`](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L1507-L1525)
##### 4.4 处理剩余的引用 Metavariables
有些引用层级经过类型检查后仍然没有确定，也没有被保留为公开的隐含参数。
- 当前 Inductive 路径会按 R3″ 尝试将这些残余引用层级设置为最小层级 `0`，然后继续进行引用、接口与 Kernel 检查。
- 这不是把所有未解的源 Levels 都设为 `0`；前面需要公开的参数已经单独处理。
- 也不能因为一个赋值让表达式通过类型检查，就直接认为它保留了源声明的含义。
[残余层级处理](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L1612-L1648)
Step 4 完成后，主要得到：
- 翻译并处理了 Universe 的 Arity Expression；
- 已将 `self` 替换为目标引用的 Constructor Type Expressions；
- 最终公开的 Universe Parameters；
- 需要在下一步核对的层级解与引用实例。
### Step 5. Universe 与 Interface Checking
##### 5.1 检查整个 Block 的 Universe 关系
假设某个 Non-template Inductive 中，参数 `A` 位于 `Type@{u}`，构造器需要保存一个 `A` 类型的值，而 Inductive 的结果位于 `Type@{v}`，源 Universe Constraint 为：
$$
u \leq v
$$
如果直接将两个源 Levels 映射为独立的 Lean Universe Parameters：
$$
u \mapsto a,\qquad v \mapsto b
$$
那么目标构造器的类型检查可能要求 `a ≤ b`。但由于 `a`、`b` 是独立参数，Lean 无法保证这个关系始终成立。
因此，在适用的 R2F Interpretation 路径中，翻译器可以使用：
$$
\boxed{u \mapsto a,\qquad v \mapsto \max(a,b)}
$$
由于：

$$
a \leq \max(a,b)
$$
无论 `a`、`b` 如何实例化，原来的 Universe Constraint 都能得到满足。
同时，R2F 并没有强制 `u` 和 `v` 相等。当源实例满足 `u ≤ v` 时，可以选择 `a = u`、`b = v`，此时：
$$
\max(a,b)=b
$$
因此，R2F 既保留了 `u < v` 的可能性，也能表示 `u = v` 的情况，而不会不必要地限制源 Universe 的一般性。

需要注意，R2F 只是一种候选 Universe Interpretation，并不是所有 Non-template Inductive 都必须使用它。对于通过 Unification 求解的额外 Levels，在适用的检查路径中，还需要使用 `checkBodyLevel` 验证其解是否满足相关的源 Universe Facts。
对应源码：[ownLevelInterp（R2F）与 checkBodyLevel](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Translate.lean#L3780-L3839)
##### 5.2 检查 Arity 和 Constructor Types 中的引用
归纳声明的类型表达式也会引用其他类型和函数，因此需要检查这些引用的 Universe Instance。
这里区分不同机制：

|引用中的层级|检查方式|
|---|---|
|Non-template 的泛化 Global Levels|R3：检查源界限及共享层级的一致性|
|Template Levels|R5：根据 Template 绑定和实际参数的类型确定实例|
|显式多态参数|保留并核对源显式 Universe Instance 的对应关系|

例如，Step 4 中：
```
Rocq.list.{r} A
```
使用的是 Template 的实例机制。
如果引用的是一个 Non-template 声明，则不能只看参数类型能否匹配，还需要根据相应的源 Universe Facts 检查该实例是否允许。
`checkUniverseObligations` 会遍历 Arity 和所有 Constructor Types 中的引用，执行相应检查。[引用检查](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Translate.lean#L3851-L3875)
##### 5.3 检查是否缩小了公开接口
例如，原本需要保留：
```lean
Rocq.list.{s} (A : Sort s)
```
如果为了方便通过类型检查，把接口固定成：
```lean
Rocq.list (A : Type 0)
```
那么更高 Universe 中的类型就无法再按原接口使用。
- 对于受保护的 Inductive，项目会检查 Arity 和 Constructor Types 中的参数类型，防止自由层级被不当地固定，从而缩小量化范围。这里使用的机制包括 `freeLevelPin`。[公开接口检查](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L1649-L1656)
##### 5.4 如果检查失败怎么办？
对于适合重试的 Universe 或类型问题，外层可以重新选择表示，再翻译整个 Block。
主要包括：

|重试方式|解决什么问题|
|---|---|
|**普通参数／R2F Interpretation**|在独立参数与受约束的 `max` 表示之间选择合适形式|
|**逐引用位置的 Unification**|先让实际应用决定引用层级，再检查它们的一致性|
|**R3↓：较低引用实例**|在源约束允许的情况下，使用较低的 Universe Instance|
|**Template 的 Sort／Type 表示回退**|当较一般的 `Sort` 接口不适用时，尝试相应的 `Type` 表示|

这些重试仍然需要通过 Universe、Interface 和最终 Kernel 检查。[Inductive 重试策略](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L2802-L2870)
## Step 6. 生成最终 Lean Inductive Declaration
前面的处理完成后，翻译器已经拥有：

|字段|含义|
|---|---|
|`name`|目标 Inductive 的名字|
|`levelParams`|最终公开的 Universe Parameters|
|`numParams`|归纳类型的统一参数数量|
|`type`|翻译并处理了 Universe 的完整 Arity Expression|
|`ctors`|所有构造器的名称及完整类型|

##### 6.1 确定 Parameters 和 Indices 的划分
对于 `Rocq.list.{s} : Sort s → Sort (max 1 s)`
参数 `A` 是整个归纳类型的统一参数，因此：
```
numParams = 1
```
`cons` 的 `x`、`xs` 是构造器字段，不计入这个参数数量。
如果归纳类型还有 indices，它们保留在 Arity 中，但不计入统一参数数量。项目根据源端的 `nparams_rec` 等信息确定这一划分。[参数数量的处理](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L1657-L1675)
##### 6.2 构造声明并提交 Lean Kernel
翻译器构造的声明结构类似：
```
Declaration.inductDecl
  levelParams
  numParams
  [{
    name := typeName
    type := typeExpr
    ctors := constructors
  }]
  false
```
对 `list`，最终接口可以写成：
```
-- 将完整命名空间和 Universe 参数名简化
inductive Rocq.list.{s} (A : Sort s) : Sort (max 1 s) where
  | nil : Rocq.list A
  | cons : A → Rocq.list A → Rocq.list A
```
整个声明通过 `addChecked` 提交给 Lean Kernel。
Kernel 检查完整归纳结构，包括：
- Arity 与 Constructor Types 是否类型正确；
- 构造器是否返回当前定义的归纳类型；
- 参数使用与递归出现是否符合要求；
- Universe 和严格正性等条件是否满足。
接受之后，类型与构造器加入 Lean Environment，翻译器也记录它们的源到目标对应关系。随后还会进行独立 Audit／Validation，核对目标结构与源信息之间的对应。[声明生成](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Emit.lean#L1675-L1695)、[Kernel 提交](https://github.com/jackooo-dddd/rocq-core/blob/b3bf982ebb2b1cf18fb356688aabb46f63cb3578/translator/Rocq2Lean/Kernel.lean#L22-L34)
##### 6.3 同时得到后续计算需要的 Recursor
Lean 根据被接受的归纳声明生成对应的 recursor，例如：
```
Rocq.list.rec.{r, s}
```
- `s` 对应列表元素类型的 Sort Level；
- `r` 对应 motive 返回结果的 Sort Level。
后续翻译使用 `list` 的 `match` 或 `fix` 时，就可以调用这个 recursor，构造相应的 motive、构造器分支和递归结果。