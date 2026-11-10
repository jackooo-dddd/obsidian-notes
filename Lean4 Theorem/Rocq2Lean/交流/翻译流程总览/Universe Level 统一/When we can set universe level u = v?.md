| Case                                                                                              | Is `u = v` allowed?                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rocq itself forces `u = v` (constraints both ways)                                                | Always                                                                                                                                                                                                              |
| Both are input universes, e.g. `(A : Type u) (B : Type v)`, in a theorem or protected declaration | Never; this was the `respecting` case                                                                                                                                                                               |
| Only the result type, as in `promote`, unprotected declaration                                    | Yes. Lowering the result type is allowed for dependencies                                                                                                                                                           |
| Only the result type, as in `promote`, protected declaration                                      | Only through one rule, R2B-V, which the translator tries only after every other attempt fails. It must check that `u ≤ v` holds in Rocq, which it does here. The result is `promote.{u} (A : Type u) : Type u := A` |
| Theorem statements                                                                                | Never, unless Rocq forces it                                                                                                                                                                                        |

This isn’t counted as narrowing because every `A` you could pass in Rocq can still be passed. What’s lost is using `promote A` at a larger `Type v`, and Lean can’t do that for any result type without an explicit lift.

For a protected `promote`, though, an earlier attempt probably succeeds first: the existing type lift would give `promote.{u,v} (A : Type u) : Type (max u v) := PULift A`, which keeps `v` free. I haven’t run `promote` itself, so which of the two it gets is my reading of the code, not a measured result. I can add it as a test fixture to confirm.

在我们的翻译项目中，Lean Unification 可能将两个不同的 Rocq Universe Levels 解释为同一个 Lean Level。但是否允许，取决于它们在 Declaration 中的位置，以及原始 Rocq Universe Constraints。
首先区分两个概念：
- Constraint Preservation：例如源约束 `u ≤ v`，选择 `u = v` 仍然满足这个约束。
- Universe Generality：源声明可能允许 `u < v`，如果目标强制 `u = v`，就会丢失这部分合法情况。
因此，**满足源 Constraints 不代表完整保留源 Generality**。
### 1. 五种情况下，什么时候可以统一？

| 情况 | 是否允许 `u = v` | 原因 / 检查 |
|---|---|---|
| Rocq 本身要求 `u = v` | 可以 | 保留源 Universe Equality |
| `u`、`v` 都用于输入 Binder | 通常不应合并 | 可能缩小输入范围；C / P0 检查 |
| `u` 用于输入，`v` 只用于 Result Sort | 有条件允许 | 可能降低输出 Universe；R2B-V 等规则 |
| `v` 是其他 Constant 的 Universe Instance | 有条件允许 | Lean Unification + R3 检查 |
| `v` 只出现在 Body 内部 | 通常可以求解 | 不直接影响公开 Type；R2B 检查 |

### 2. 情况 A：两个 Levels 都用于输入 Binder （Both are input universes）

Rocq 中：

```coq
Definition f
    (A : Type@{u})
    (B : Type@{v}) := ...
```

假设源 Constraints 没有要求 `u = v`，那么 `A` 和 `B` 可以处于不同的 Universe Levels。

如果 Lean 翻译为：

```lean
def f.{w}
    (A : Type w)
    (B : Type w) := ...
```

那么两个输入必须属于同一个 `Type w`，这会限制原来允许不同 Levels 的输入。

因此，对于需要保留完整输入 Generality 的声明，不能无依据地合并 `u` 和 `v`。项目使用 `binderIndependence` 等机制检查 Statement 和 Protected Definition 的输入范围。不过，这种保护并不完全覆盖所有普通 Definition，所以普通 R2S Unification 仍可能产生较窄的候选翻译。

### 3. 情况 B：一个 Level 用于输入，另一个只用于 Result Sort

Rocq 中：

```coq
Universe u v.
Constraint u <= v.

Definition promote
    (A : Type@{u}) : Type@{v} := A.
```

这里 `u` 决定输入类型的 Universe，`v` 决定返回类型所在的 Universe。

Lean 可能通过 Unification 或受支持的 Result Sort Lowering 得到：

```lean
def promote.{u}
    (A : Type u) : Type u := A
```

即：

$$
I(u)=\alpha,\qquad I(v)=\alpha
$$

这样满足源约束 `u ≤ v`，也没有限制输入 `A`，但降低了输出 Universe，无法直接保留源声明允许的 `u < v` 情况。

如果希望保留较高的结果 Universe，可以考虑：

$$
I(u)=\alpha,\qquad I(v)=\max(\alpha,\beta)
$$

并在符合条件时使用 `PULift` 显式处理 Cumulativity。

需要注意，R2B-V 是有明确适用条件的 Result Sort Lowering；普通 R2S Unification 也可能较早得到 `u = v`，两者不是同一条规则。

### 4. 情况 C：`v` 是其他 Constant 的 Universe Instance

Rocq 中：

```coq
Universe u v.
Constraint u <= v.

Definition idAtV (A : Type@{v}) (x : A) : A := x.

Definition use (A : Type@{u}) (x : A) : A :=
  idAtV A x.
```

这里 `idAtV` 使用 Global Level `v`，但实际传入的 `A` 位于 `Type@{u}`。由于 Rocq 支持 Cumulativity，且 `u ≤ v`，所以调用合法。

假设 `idAtV` 已经被 Generalize：

```lean
def idAtV.{w} (A : Type w) (x : A) : A := x
```

翻译 `use` 时：

```lean
idAtV.{?w} A x
```

由于 `A : Type u`，Lean Unification 可以求得：

$$
?w=u
$$

最终得到：

```lean
idAtV.{u} A x
```

为什么允许？这里只是在确定被引用 Constant 的目标 Universe Instance，并没有强制 `use` 的其他输入使用同一个 Universe。

但 R3（Reference Instantiation）必须检查源 Facts 能否证明 `u ≤ v`，确认这次较低 Level 的实例化满足 No-Raising 条件。

这里讨论的是被 Generalize 的源 Monomorphic Constant；真正的 Rocq Polymorphic Constant 主要由 R6 翻译 Exporter 已确定的 Source Universe Instance。

### 5. 情况 D：`v` 只出现在 Body 内部

例如：

```coq
Universe u v.
Constraint u <= v.

Definition f (A : Type@{u}) (x : A) : A :=
  let B : Type@{v} := A in x.
```

这里 `u` 出现在公开 Type 中，而 `v` 只出现在 Body 中的局部定义 `B`。

由于 `f` 的公开接口始终是：

```coq
forall (A : Type@{u}), A -> A
```

翻译器可以尝试将内部 Level `v` 求解为 `u`：

$$
I(u)=\alpha,\qquad I(v)=\alpha
$$

得到：

```lean
def f.{u} (A : Type u) (x : A) : A :=
  let B : Type u := A
  x
```

为什么允许？因为 Body-only Level 不直接决定公开参数和返回值的类型，不一定需要作为独立的 Lean Universe Parameter。

不过，R2B 的 `checkBodyLevel` 仍必须验证 `v := u` 是否符合 Source Universe Facts。如果源要求 `u < v`，直接合并就会违反原始约束，不能接受。

### 总结

| 检查规则 | 主要判断 |
|---|---|
| R2S / Unification | Lean Typing 是否需要统一两个 Levels |
| R2B | Body-only Level 的 Solution 是否满足 Source Facts |
| R3 | 被引用 Constant 的 Universe Instance 是否合法 |
| R2F-c | 是否需要通过 `max` / `succ` 保留源 Universe Relations |
| R2B-V | 是否允许降低最终 Result Sort |
| C / P0 | 是否错误缩小公开输入范围或 Statement Generality |
| Lean Kernel | 目标 Declaration 是否类型正确 |

最重要的结论是：`u = v` 可以是一个合法的 Universe Solution，但其含义取决于具体位置。对于输入 Binder，合并可能限制 Generality；对于 Result Sort，合并可能降低输出 Universe；对于 Constant Reference，合并可能只是一次合法的目标实例化；对于 Body-only Level，合并可能只是内部求解。

因此，翻译器不能只判断 `u = v` 是否满足 Rocq Constraints，还需要判断它是否改变了公开接口、Constant References 或源声明允许的 Universe 使用范围。

相关实现：
- [Translate.lean — checkInstantiation / checkBodyLevel](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Translate.lean)
- [Emit.lean — binderIndependence / freeLevelPin](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean)
- [UNIVERSE_TRANSLATION.md — R2B / R3 / R2F-c](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_TRANSLATION.md)