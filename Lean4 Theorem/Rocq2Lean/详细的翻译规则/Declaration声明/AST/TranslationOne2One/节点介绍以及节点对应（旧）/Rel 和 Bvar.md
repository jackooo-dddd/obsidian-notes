`Rel` 和 `bvar` 不是通过变量名字，而是通过 **De Bruijn Index（变量索引）** 来建立 Rocq 和 Lean 之间的变量对应关系。它们记录的是变量由哪一层 Lambda 绑定，而不是变量叫什么名字。
**`Rel → bvar` 解决的是“变量引用的是谁”，而不是“两个变量代表的值在语义上是否相同”。** 前者属于机械的 Structural Translation，后者还需要 Type / Value Correspondence 和相应的验证机制。
## 1. Rel 和 bvar 如何对应？

例如 Rocq：
```coq
fun (f : nat -> nat) =>
  fun (x : nat) =>
    f x
```

对应的 MetaRocq Source IR 可以简化为：
```text
Lambda f
  Lambda x
    App(Rel 1, Rel 0)
```

这里 `Rel 0` 表示距离当前位置最近的绑定变量 `x`，而 `Rel 1` 表示再往外一层的变量 `f`。翻译到 Lean 后：
```text
lam f
  lam x
    app(bvar 1, bvar 0)
```

| Rocq Source IR | Lean Expr | 对应变量 |
|---|---|---|
| `Rel 0` | `bvar 0` | `x` |
| `Rel 1` | `bvar 1` | `f` |

因此，只要翻译器正确保留 Lambda 的嵌套结构和 Binding Relation，就能确保 Rocq 和 Lean 引用的是对应的局部变量。

## 2. 为什么不需要变量名字相同？

例如 Rocq 使用 `f`、`x`，而 Lean 使用 `g`、`y`：
```coq
(* Rocq *)
fun (f : nat -> nat) =>
  fun (x : nat) => f x
```
```lean
-- Lean
fun (g : Nat → Nat) =>
  fun (y : Nat) => g y
```
虽然变量名字不同，但它们的 AST 绑定关系完全相同：
```text
Rocq: App(Rel 1, Rel 0)
Lean: app(bvar 1, bvar 0)
```
因为两边都是引用外层 Lambda 的函数参数，再应用到内层 Lambda 的参数上。因此，**只要 De Bruijn Index 和 Scope 对应，变量名字不同也不会影响 Structural Correspondence。**

## 3. Rocq2Lean 如何实现变量对应？

翻译器在递归处理 Lambda 时，会维护一个局部变量环境。概念上，进入两个 Lambda 后：
```text
locals = [fL, xL]

Rel 0 → 查找 locals → xL
Rel 1 → 查找 locals → fL
```
然后在构造 Lean Lambda Expression 时，将局部变量重新抽象为对应的 `bvar`。这样可以保证嵌套 Lambda、Dependent Function 等复杂结构中的 Scope 和 Binding Relation 正确，而不是简单进行字符串替换。
