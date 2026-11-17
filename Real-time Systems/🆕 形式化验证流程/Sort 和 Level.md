##### 区分清楚层级的编号（level）和由这一层级构造出来的类型 （Sort）
- Sort（也叫宇宙）是一种特殊的类型：它的元素本身都是类型。
- `A : Sort u` 表示 `A` 是第 `u` 层的类型；Sort 本身也有类型：`Sort u : Sort (u+1)`。

| Rocq                      | 是什么                   | Lean                      |
| ------------------------- | --------------------- | ------------------------- |
| `l`                       | level                 | 参数 `u_l`                  |
| `Type@{l}`                | 用 level `l` 做出来的 Sort | `Sort (u_l + 1)`          |
| `Set`                     | level                 | `0`                       |
| `Type@{Set}`，即 `Set` 这个宇宙 | Sort                  | `Sort (0 + 1)` = `Sort 1` |

### Sort（宇宙）：可以写在程序里的"类型的类型"
Sort 是**项**，可以出现在代码里，可以作为某个类型的类型：

```coq
Check nat.        (* nat : Set *)
Check True.       (* True : Prop *)
Check Set.        (* Set : Type@{Set+1} *)
Check Type@{l}.   (* Type@{l} : Type@{l+1} *)
```

Rocq 中的 Sort 有：`Prop`、`Set`、`Type@{…}`
### Level（层级）：宇宙层次中的"高度名字"
Level **不是项**，只能写在 `Type@{…}` 的花括号中。它表示宇宙层次里的一个位置。

| Level        | 含义                              |
| ------------ | ------------------------------- |
| `Set`        | 最底层                             |
| 全局 level `l` | 用 `Universe l.` 声明的，整个开发共用      |
| 多态变量 `var i` | 宇宙多态定义内部的参数，每次使用时会被具体的 level 替换 |

### level 表达式：由 level 算出来的高度
类型规则会**计算** level：
- `Type@{l}` 的类型是 `Type@{l+1}`：需要 **+1**
- `forall (x : T), U` 位于 max(T 的层, U 的层)：需要 **max**

所以只有单个 level 不够，还需要"若干个 level 加偏移再取 max"这样的表达式，比如 `max(l+1, m)`



