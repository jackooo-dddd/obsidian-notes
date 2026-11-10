Carrier Level 指的是一个 Structure 内部所封装的 Carrier Type（底层元素类型）所在的 Universe Level。这个概念在 Rocq 和 Lean 中都适用，并不是 Lean 独有的。
### 什么是 Carrier Level？
以 MathComp 的 `eqType` 为例，可以简化理解为：
```coq
Record eqType := {
  sort : Type@{51};
  eq_op : sort -> sort -> bool;
}.
```

| 字段 | 含义 |
|---|---|
| `sort` | Carrier Type，即这个结构所封装的底层类型 |
| `eq_op` | 比较 Carrier 中两个元素的函数 |
| `51` | Carrier Universe Level，即 `sort` 被声明所在的 Universe |

例如，`nat_eqType` 的 Carrier 是：
```coq
nat : Set
```

而 Prosa 中：
```coq
Job : eqType
```
可以通过 Projection 得到其 Carrier Type：
```coq
Equality.sort Job : Type@{51}
```
因此，`eqtype.51` 就是 Job 的 Carrier 所对应的源 Universe Level。
- 这里需要区分：`51` 是 Structure 对 Carrier 声明的 Universe Level。由于 Rocq 支持 Cumulativity，实际放入结构中的类型也可能位于更低的 Universe。例如，`nat : Set` 可以在允许的情况下被用作这个 Carrier。
另外，`eqType` 结构自身所在的 Universe，不一定与它内部 Carrier 的 Universe 相同。
###  翻译到 Lean 后
假设源 Global Level `51` 被映射为 Lean Parameter `u51`：
```lean
Equality.sort Job : Type u51
```
那么目标 Carrier Level 就是：
$$
\boxed{u_{51}}
$$
但如果 R2F 根据 Source Universe Facts 构造了更复杂的 Interpretation：
$$
I(51)=\max(u_{51},u_{101})
$$
则目标可能是：
```lean
Equality.sort Job : Type (max u51 u101)
```
此时 Carrier Level 为：
$$
\boxed{\max(u_{51},u_{101})}
$$
因此，Carrier Level 本质上仍然是普通的 Universe Level，只是它专门描述 Structure 内部 Carrier Type 所在的 Universe。
### 项目中的例子：`JobArrival`
项目中有以下情况：
- `JobArrival` mentions a task-related level (`task.43`). The translator solved it as `max(u51, u21)`, combining Job's carrier level (51) with the arrival curve's level (21).
这里涉及三个源 Universe Levels：

| Source Level | 含义 |
|---|---|
| `eqtype.51` | Job 的 Carrier 对应的 Universe Level |
| `21` | Arrival Curve 相关的 Universe Level |
| `task.43` | `JobArrival` 中需要求解的另一个 Universe Level |

翻译器为 `task.43` 求得：
$$
\boxed{I(task.43)=\max(u_{51},u_{21})}
$$
这表示目标 Level Expression 同时不低于 `u51` 和 `u21`，从而能够满足涉及这两个 Levels 的类型要求。
但这不意味着：
$$
u_{51}=u_{21}
$$
也不意味着 `task.43` 本身就是 Job 的 Carrier Level。它是 `JobArrival` 中另一个需要求解的源 Global Level。
### 总结
- Carrier Type：Structure 内部封装的底层元素类型，例如 `Equality.sort Job`。
- Carrier Level：这个类型对应的 Universe Level，例如源 `eqtype.51` 或目标 `u51`。
- Universe Interpretation：翻译器可能使用 `max` 等表达式表示 Carrier Level 或其他相关 Levels。
- 不同 Levels 的组合：`max(u51,u21)` 表示一个同时不低于两者的 Level，不代表两者相等。
因此，在 `JobArrival` 的例子中，`u51` 对应 Job 的 Carrier Level，而 `max(u51,u21)` 是翻译器为 `task.43` 求得的 Universe Expression，二者不能混为一谈。

## Universe Interpretation：$I$ 的含义
在 Rocq → Lean Translation 中，$I$ 表示 Universe Interpretation（Universe 映射函数），用于将 Rocq 的 Universe Level 映射为 Lean Level Expression。
$$
I(l)=\text{源 Universe Level }l\text{ 对应的 Lean Level Expression}
$$
例如：
$$
\boxed{I(51)=\max(u_{51},u_{101})}
$$
其中：
- `51`：Rocq 中的 Global Universe Level。
- $I$：Universe Interpretation。
- `max(u51,u101)`：翻译后的 Lean Universe Level Expression。
### 与 Carrier Level 的关系
假设 Rocq 中：
```coq
Equality.sort Job : Type@{51}
```
经过 Universe Interpretation：
```lean
Equality.sort Job : Type (max u51 u101)
```
此时，`max(u51,u101)` 就是目标中 Job 的 Carrier Level。
因此，**$I$ 本身不是 Carrier Level，而是通用的 Universe 映射函数**。只有当源 Level 对应某个 Carrier Type 时，其 Interpretation 才表示目标中的 Carrier Level。
### 项目源码中的记法
项目的 R2F Interpretation 通常使用希腊字母 $\iota$（iota）表示：
$$
\boxed{\iota(51)=\max(u_{51},u_{101})}
$$
这里的 $\iota$ 与 $I$ 含义相同，都是从 Source Universe Levels 到 Lean Level Expressions 的映射。

总结：$I$ / $\iota$ 是映射函数，$I(51)$ 是映射结果；当 `51` 是源 Carrier Level 时，$I(51)$ 才是对应的目标 Carrier Level。