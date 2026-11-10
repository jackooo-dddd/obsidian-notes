Lean 可以在全局声明 Universe Variables，但没有 Rocq 那种跨 Declarations 共享的 Monomorphic Global Universe Levels 和 Global Universe Constraint Graph。
- Rocq 的 Global Universe Level 是全局共享的 Level 标识，而 Lean 的 `universe u` 只是声明一个可复用的 Universe Parameter 名字。不同 Lean Definitions 中的 `u` 仍然可以独立实例化。
### 1. Lean 的 `universe u`
```lean
universe u

def f (A : Type u) (x : A) := x
def g (A : Type u) (x : A) := x
```
虽然两个 Definitions 都使用 `u`，但它们实际上分别拥有自己的 Universe Parameter：
```lean
def f.{u} (A : Type u) (x : A) := x
def g.{u} (A : Type u) (x : A) := x
```
因此，可以同时使用：
```lean
#check f.{0} Nat
#check g.{1} (Type 0)
```
- 这里 `f` 的 Universe Instance 是 `0`，而 `g` 的是 `1`，彼此没有约束关系。
### 2. Rocq 的 Global Universe Level
假设 Rocq 中：
```coq
Universe g.

Definition f (A : Type@{g}) (x : A) := x.
Definition h (A : Type@{g}) (x : A) := x.
```

两个 Definitions 使用的是同一个 Global Universe Level `g`。它属于 Rocq 的 Global Universe Environment，不会因为每次调用 `f` 或 `h` 而重新实例化。

| 特性 | Rocq Global Level `g` | Lean `universe u` |
|---|---|---|
| 多个 Definitions 可以使用 | 是 | 是 |
| 跨 Definitions 共享同一个 Level 身份 | 是 | 否 |
| 每次调用可以独立实例化 | 否（Monomorphic） | 是 |
| 支持全局约束图 | 是 | 否 |

### 3. 对 Rocq → Lean Translation 的影响
假设 Rocq 存在 Global Universe Constraint：
$$
g_1\leq g_2
$$
即使在 Lean 中声明：
```lean
universe u1 u2
```
也不会自动建立：
$$
u_1\leq u_2
$$
因此，我们的翻译器不能仅仅通过声明相同名字的 Universe Parameters 来保留 Rocq 的 Global Universe Relations。
项目主要通过以下机制处理：
- R2S：将 Rocq Global Levels 转换为 Lean Metavariables，并根据 Type Checking 决定是否 Generalize 为 Universe Parameters。
- R2F-c：必要时使用 `max` / `succ` Expressions 编码 Global Universe Constraints。例如：
$$
I(g_1)=u_1,\qquad I(g_2)=\max(u_1,u_2)
$$
这样无论 Lean Parameters 如何实例化，都满足 $I(g_1)\leq I(g_2)$。
- R3：检查跨 Declaration 的 Constant References，确保源代码中共享的 Global Levels 在目标中保持合法的 Coherence，或采用源 Facts 支持的实例化。
- Universe / Interface Audit：验证原始 Universe Constraints、Generality 和目标映射是否一致。
## 总结
Rocq 的 Global Universe Level 是跨声明共享的固定 Level 标识，而 Lean 的 `universe u` 只是可复用的参数名称，每个 Declaration 都有独立的 Universe Instantiation。
因此，在我们的项目中，将 Rocq Global Levels Generalize 为 Lean Universe Parameters 后，必须额外通过 R2F-c、R3 和 Universe / Interface Checking 保留源 Global Universe 的必要关系，不能认为使用相同的参数名字就自动保留了 Rocq 的全局语义。