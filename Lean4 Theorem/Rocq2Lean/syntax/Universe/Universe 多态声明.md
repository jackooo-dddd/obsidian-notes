## Explicit Universe Polymorphism（显式 Universe 多态）
显式 Universe-Polymorphic Declaration 是指在定义 Function、Type 或 Theorem 时，明确声明它使用的 Universe Parameters，并允许这些 Parameters 在每次引用时分别实例化。例如：
```coq
Polymorphic Definition myId@{u}
  (A : Type@{u}) (x : A) : A := x.
```
- 这里 `Polymorphic` 表示声明是 Universe-Polymorphic 的
- `@{u}` 显式声明 Universe Parameter `u`
- `Type@{u}` 表示输入 `A` 是位于 Universe Level `u` 的类型。函数本身只是接收类型 `A` 和一个元素 `x : A`，然后返回 `x`。数学形式为：
$$
\operatorname{myId}:\forall(A:\operatorname{Type}_u),A\to A
$$
关键在于，`u` 不是固定的 Universe Level。同一个 `myId` 可以在不同引用处分别实例化为 `u=0`、`u=1`、`u=2` 等，只要满足相应的 Universe Constraints。
##  Monomorphic vs Polymorphic
Rocq 默认的普通 Definition 通常是 Universe-Monomorphic 的，例如：
```coq
Definition myId (A : Type) (x : A) : A := x.
```
- 虽然这里没有显式写出 Universe Level，但 Rocq 会为声明分配全局 Universe Level。这个 Level 不能在每次引用时被独立实例化。
```coq
Polymorphic Definition myId@{u}
  (A : Type@{u}) (x : A) : A := x.
```
- 这里的 `u` 是可实例化的 Universe Parameter，每次引用 `myId` 时可以选择不同的合法 Universe Instance。

| 比较 | Monomorphic | Polymorphic |
|---|---|---|
| Universe Level | 声明时确定全局 Level | 每次引用可分别实例化 |
| 不同 Universe 层级 | 受固定 Level 限制 | 可用于不同合法 Level |
| 是否必须显式写 `@{u}` | 否 | 否，可以自动推断 |
| 主要用途 | 固定 Universe 的声明 | 跨 Universe 的通用声明 |

需要注意，`Polymorphic` 不要求手写 `@{u}`，Rocq 也可以自动推断 Universe Parameters；只有显式写出 `@{u}` 才属于 Explicit Universe Polymorphism。

## 多个 Universe Parameters 与 Constraints
```coq
Polymorphic Definition myLift@{u v}
  (A : Type@{u}) : Type@{v} := A.
```
- 这个 Declaration 包含两个 Universe Parameters：`u` 和 `v`。输入 `A` 的类型是 `Type@{u}`，但声明要求返回值的类型是 `Type@{v}`，实际返回的仍然是 `A`。

由于 Rocq 支持 Universe Cumulativity，Kernel 要求：
$$
\boxed{u\leq v}
$$

| u | v | 是否合法 |
|---|---|---|
| 0 | 0 | Yes |
| 0 | 2 | Yes |
| 1 | 3 | Yes |
| 3 | 1 | No |

- 因此，Universe Polymorphism 并不意味着各个 Level 可以任意赋值，而是每次实例化都必须满足原始 Universe Constraints。
##  Lean 中的 Universe Polymorphism
Lean 同样支持 Universe Polymorphism，例如：
```lean
universe u
def myId.{u} (A : Type u) (x : A) : A := x
```
- 其中 `universe u` 声明 Universe Variable，`myId.{u}` 声明函数的 Universe Parameter，`Type u` 表示对应层级的类型。因此，普通的 Universe-Polymorphic Function 通常可以直接翻译。

但是，对于 Rocq 的：
```coq
Polymorphic Definition myLift@{u v}
  (A : Type@{u}) : Type@{v} := A.
```
不能简单翻译为：
```lean
universe u v
def myLift.{u, v}
  (A : Type u) : Type v := A
```
- 因为 Lean 不具有 Rocq 那样的一般 Universe Cumulativity。Rocq 允许的 `u ≤ v` 并不能直接让 Lean 接受这个定义。
- 因此，Rocq2Lean 需要通过 Universe Solving、Result Sort Lowering，或者在合适情况下使用 `ULift` 等方式处理这种差异，同时保证转换符合原始 Universe Constraints。

## Rocq2Lean 需要导出哪些 Universe Information？
当 MetaRocq Exporter 遇到 Universe-Polymorphic Declaration 时，除了导出 Type AST 和 Body AST，还必须导出完整的 Universe Information。例如对于 `myLift`：
```text
Universe Polymorphism: true

Universe Parameters:
  u
  v

Universe Constraints:
  u ≤ v

Type AST:
  Π (A : Type@{u}), Type@{v}

Body AST:
  λ (A : Type@{u}) => A
```
其中 `u ≤ v` 是 Rocq Kernel 类型检查所要求的 Universe 关系，仅扫描 AST 中的 `Type@{u}` 和 `Type@{v}`，无法直接恢复这个约束。此外，当其他 Declaration 引用 `myLift` 时，还需要记录对应的 Universe Instance，说明这次引用具体使用了哪些 Universe Levels。


| Universe Information | 含义 | 例子 |
|---|---|---|
| Universe Parameters | Declaration 有哪些可实例化的 Universe Levels | `u, v` |
| Universe Constraints | 不同 Level 必须满足的关系 | `u ≤ v` |
| Universe Instances | 某次引用 Declaration 时实际使用的 Level | `u := 0, v := 2` |

总结：Explicit Universe Polymorphism 允许声明显式指定可实例化的 Universe Parameters，但每次实例化必须满足相应的 Constraints。对于 Rocq2Lean，**Universe Parameters、Universe Constraints 和 Universe Instances 必须一起处理**，才能在 Lean 中尽可能正确地重建 Rocq 的 Universe-Polymorphic Declaration。