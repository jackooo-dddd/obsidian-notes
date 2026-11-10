
除了当前 Constant 自己的源 Global Universe Levels，翻译过程中还可能创建一些额外的 Metavariables，例如引用已经 Generalize 的 Constant 时，为其 Universe Instance 创建的临时变量。

有些经过 Unification 后仍然自由，而且没有被前面的 `keepParams` 处理成公开参数。

这就是需要处理的 Residual Universe Metavariables。

### Step 8. 为什么不能直接 Default 为 0？

假设还有：

```
?m = 未确定
```

一种简单的做法是：

```
?m := 0
```

但这里有个风险：这个选择可能仅仅让某个特定 Universe Instance 下的表达式通过检查，却不能证明这种固定方式是合理的。

例如，某个函数的类型实际要求：

```
A : Type ?m
```

如果随意将 `?m` 设置成 `0`，就可能缩小它能接受的类型范围。

所以项目引入了额外的安全检查。

### Step 9. 先构造带 Residual Parameters 的通用版本

在 `solveLevels` 中：

```
let ps := (List.range ms.size).map fun i =>
  Name.mkSimple s!"u_residual_{i}"
```

它会为剩余的 Metavariables 创建临时 Universe Parameter 名称，例如：

```
u_residual_0
u_residual_1
```

然后将这些变量代入原本的 Type 和 Body：

```
let gty := ty.replaceLevel sub
let gval := val.replaceLevel sub
```

这里：

- `gty` 是残留 Levels 被泛化后的 Type。
    
- `gval` 是残留 Levels 被泛化后的 Body。
    

你可以想象有一个内部表达式使用了 `?m`：

```
Rocq.helper.{?m} ...
```

通用版本将它变为：

```
Rocq.helper.{u_residual_0} ...
```

这个版本的目的不是直接成为最终声明，而是检查原表达式是否能在不固定 Residual Levels 的情况下通过 Lean Kernel 检查。

### Step 10. 通过 `justifyResiduals` 检查通用版本

在 `Emit.lean` 中：

```
if let some msg ←
    justifyResiduals name kind lparams resid gty gval genv.reuseExisting then
  return { base with
    status := "UNIVERSE_REJECTED",
    message := msg }
```

而 `justifyResiduals` 的核心是：

```
checkOnly
  (← mkConstDecl name kind (lps ++ resid) gty gval)
```

假设最终需要保留的公开 Universe Parameter 是 `u`，还有一个 Residual Parameter `r`。

它就尝试检查类似这样的通用声明：

```
-- 示意：这里的 body 是实际翻译出的表达式
def generic_check.{u, r}
    (A : Type u) (x : A) : A :=
  body_using_r
```

Lean Kernel 会检查这个声明是否对于 `u` 和 `r` 的任意合法 Universe 实例都成立。

如果通用版本通过：

说明 Residual Level 并不需要某一个特殊数值才能保证目标声明的类型正确。

此时使用一个默认值，在 Lean 类型正确性方面就有了依据。

如果通用版本失败：

说明当前翻译器没有获得充分的通用性证明。

`justifyResiduals` 会返回错误，该翻译尝试不能据此被接受。

这个通用 Kernel 检查并不单独保证所有 Rocq 源语义；项目仍然需要 Source Universe Facts 和 R3 等约束检查。

### Step 11. 为 Residual Levels 应用 Default

有了通用版本的检查机制，`solveLevels` 还会通过：

```
let rawDefaults ← ms.mapM dflt
let ds ← closeUniverseDefaults ms rawDefaults
for m in ms, d in ds do
  assignLevelMVar m d
```

为剩余 Metavariables 选择默认值。

默认回调 `dflt` 在没有额外规则时返回 `0`；而 `Emit.lean` 为当前声明自己的相关 Levels 提供了基于 `minimalModelLevel` 的回调。

`closeUniverseDefaults` 还负责处理默认值之间的依赖，拒绝循环依赖，例如一个 Level 最终要求自己等于自己加一。

值得注意的是源码中的执行顺序：

`solveLevels` 先构造通用版本、记录并应用默认值；随后 `processConstantCore` 再调用 `justifyResiduals` 检查通用版本，最后才提交最终 Declaration。

所以不是运行时先检查再赋默认值，而是在最终接受该声明之前完成安全验证。