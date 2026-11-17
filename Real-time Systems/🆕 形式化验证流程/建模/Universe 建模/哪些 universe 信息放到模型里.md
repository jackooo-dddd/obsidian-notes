
``` coq
Universe l. # id 是单态的，固定在全局 level l。

Definition id : forall (A : Type@{l}) (x : A), A :=
  fun (A : Type@{l}) (x : A) => x.
Definition idNat : forall (x : nat), nat := fun (x : nat) => id nat x.
```
### 第一类：代码里写出来的 level
凡是出现 `Type@{…}` 的地方都要提取
- 出现在声明的类型里的全局 level： 翻译成声明的 universe 参数 `u_l`
- **只**出现在函数体里、不在类型里：变成一个待定的 level，由 Lean 的 unifier 和整条声明一起解出来
### 第二类：由类型规则推导出来的 level （不需要提取，也不需要存）
这些 level 在代码里看不到，是 Rocq 检查类型时算出来的。模型里只把算它们的规则写进去：
- `RTyping` 的 `sort` 规则（`succ`）和 `prod` 规则（`prodSort`）；
- Lean 一侧对应 `Sort u : Sort (u+1)` 和 `imax`。

| 规则          | 内容                                                                                      | 本例                                                                        |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 类型的类型       | `Type@{l}` 的类型是 `Type@{l+1}`                                                            | `A : Type@{l}` 中，`Type@{l}` 本身在 `l+1` 层                                   |
| forall 所在的层 | `forall (x : T), U` 所在的层 = max(T 的层, U 的层)。 如果 U 是 `Prop`，整个 forall 就是 `Prop`，不管 T 在哪一层 | `forall (A : Type@{l}) (x : A), A` 的类型位于 `Type@{l+1}`。`l+1` 代码里没有，但模型里得有。 |
| 具体类型的层      | `nat`、`bool` 这类普通数据类型在 `Set` 层                                                          | `nat : Set`                                                               |

### 第三类：使用时产生的对 level 的约束
调用 `f a` 时，如果 `f` 的参数要求类型 `T`，而 `a` 的实际类型是 `T'`，就会产生"T' 的层 ≤ T 的层"这样一个约束。对 `idNat` 中的两次调用：
```text
id nat     id 的第一个参数要求：Type@{l}；传入的 nat，它的类型是：Set → 产生约束：Set ≤ l
id nat x   第二个参数要求：A，此时 A 已经代入为 nat；传入的 x，类型是 nat → 类型一致，不产生新约束
```
除了函数调用，**定义**时也会产生约束。比如：
```coq
Universe m.
Definition T : Type@{m} := Type@{l}.
(* Type@{l} 的类型是 Type@{l+1}，要放进 Type@{m}，产生约束 l+1 ≤ m，即 l < m *)
```

- 项目里提取的**不是**"哪次调用产生了哪条约束"，而是一张**全局约束表**：R0 的 `universe_facts`。对导出中出现的每一对 level，记录 Rocq 原生约束图给出的关系（`lt`、`le` 或没有关系）

### 翻译到 Lean
声明里一般化：全局 level `l` 变成 `id` 的 universe 参数 `u_l`：
```lean
def id.{u_l} : (A : Sort (u_l+1)) → A → A := fun A x => x
```
调用时实例化 `u_l`：`u_l` 是 `id` 自己的参数，`idNat` 使用 `id` 时必须给 `u_l` 填一个值。
- `id.{u_l} : (A : Sort (u_l+1)) → A → A`，所以 `id` 的第一个参数的类型为 `Sort (u_l+1)`。
- 我们给第一个参数 `A` 填的是 `Nat`，而 `Nat` 的类型是 `Sort 1`。
- 因此参数 `A` 的类型 `Sort (u_l+1)` 和 `Sort 1` 必须相等，所以 `u_l + 1 = 1`，即 `u_l = 0`：
```lean
def idNat : Nat → Nat := fun x => id.{0} Nat x
```

