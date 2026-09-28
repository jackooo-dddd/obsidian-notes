

原始 Rocq 定义：

```coq
Definition instant := nat.
```

对应的 Lean 定义：

```lean
abbrev instant := Nat
```

**验证目标：确认原始 Rocq `instant` 与实际编译后的 Lean `instant`，在规定的表示转换下具有双向对应关系。**

这里区分三个对象：原始 Rocq 声明、实际编译的 Lean 声明，以及将后者导入 Rocq 后得到的声明。对应证明在 Rocq 中完成，比较的是原始声明与导入声明。

## 1. 固定验证对象：确保检查的是正确的 declaration

### Rocq 端：固定源代码版本

本例固定的 source 为官方 Prosa v0.6，commit：

```text
414e66760333eaa4ef78c685bcf53291c527a548
```

这样可以明确证书对应哪一版原始声明。

### Lean 端：使用实际编译产物

验证流程包括：

1. 对 `Time.lean` 进行 fresh compile，生成新的 `Time.olean`。
2. 从实际编译产物中 export 目标声明。
3. 将导出结果 import 到 Rocq，供后续证书引用。

本例导出的声明包括：

```text
Prosa.Behavior.Time.duration
Prosa.Behavior.Time.instant
```

因此，后续证明必须绑定到这些实际导入的声明，而不能只检查 Lean 源代码字符串，或另写一个看起来相同的替代定义。

## 2. 建立 Rocq nat 与 imported Lean Nat 的转换

Rocq 的 `nat` 与导入后的 Lean `Nat` 是不同的 datatype，需要显式建立转换。

下面只展示函数结构；其中 `Nat` 指导入到 Rocq 中的 Lean 自然数类型：

```coq
Fixpoint rocq_nat_to_imported (n : nat) : Nat := ...

Fixpoint imported_nat_to_rocq (n : Nat) : nat := ...
```

为方便后文，记：

$$
f = \operatorname{rocq\_nat\_to\_imported},
\qquad
g = \operatorname{imported\_nat\_to\_rocq}.
$$

| 转换 | 方向 |
| --- | --- |
| $f$ | Rocq `nat` → imported Lean `Nat` |
| $g$ | imported Lean `Nat` → Rocq `nat` |

这里证明的是两种表示之间的对应关系，无须直接断言两个 datatype 相等。

## 3. 证明双向 roundtrip：来回转换保持原值

### Rocq → imported Lean → Rocq

对任意 Rocq 自然数 $r$，证明：

$$
g(f(r)) = r.
$$

对应的等式为：

```coq
imported_nat_to_rocq (rocq_nat_to_imported r) = r
```

### Imported Lean → Rocq → imported Lean

对任意导入的 Lean 自然数 $l$，证明：

$$
f(g(l)) = l.
$$

对应的等式为：

```coq
rocq_nat_to_imported (imported_nat_to_rocq l) = l
```

**两个方向都成立，说明 $f$ 和 $g$ 互为逆转换：转换不会丢失信息，两边的每个值都能找到对应值。**

## 4. 将对应关系绑定到 instant / duration

自然数表示之间的对应建立后，还需要将它应用到实际的 `instant` 和 `duration` 声明。

以 `instant` 为例，令 $r$ 的类型为原始 Rocq `instant`，$l$ 的类型为实际导入的 Lean `instant`。关系可以示意为：

$$
\operatorname{InstantRel}(r,l)
\;\Longleftrightarrow\;
\operatorname{ImportedLeanEq}(f(r),l).
$$

其中，`ImportedLeanEq` 表示导入后的 Lean 相等关系。

这个关系的含义是：**把 Rocq 值 $r$ 转成导入的 Lean 表示后，它与 $l$ 相等。**

证书需要落实以下性质：

1. 每个 Rocq `instant` 都有对应的 imported Lean `instant`。
2. 每个 imported Lean `instant` 都有对应的 Rocq `instant`。
3. Rocq 值经双向转换后回到原值。
4. Imported Lean 值经双向转换后回到原值。

对于这个简单的类型别名，双向 roundtrip 提供了类型和值的表示对应证据。`duration` 可以采用同样的思路。

> [!important] 证书必须引用实际声明
> 仅证明两个自然数类型之间存在转换还不够；还需要确认这些转换与性质确实适用于固定版本的 Rocq 声明，以及从实际 Lean 编译产物导入的目标声明。

## 5. Assumption audit：检查证书依赖了什么

证书通过 Rocq 编译后，还需要检查其依赖，避免把待证明的结论当作前提，或引入未批准的假设。

检查命令的形式为：

```coq
Print Assumptions certificate_name.
```

其中 `certificate_name` 替换为实际证书名称。

本例记录的审计结果为：

| 检查项 | 结果 | 含义 |
| --- | --- | --- |
| `semantic premises` | `none` | 未将待验证的语义对应作为额外前提 |
| `Prop/SProp foundation` | `none` | 本例没有使用该类额外基础依赖 |
| `unexpected assumptions` | `none` | 未发现未批准的假设 |
| `target self-dependency` | `false` | 未把目标自身作为证明依赖 |

同时，本例记录了 importer 的已知基础依赖：

```text
Lean.eq relies on definitional UIP
```

它被显式归类为：

```text
ALLOWED_IMPORTER_FOUNDATION
```

因此，准确的表述是：**没有额外的语义前提或未批准假设，但仍有明确记录并允许的 importer foundation。**

## 6. ACCEPTED_V06_TRANSLATION 表示什么

本例的接受条件包括：

| 条件 | 所需证据 |
| --- | --- |
| Source identity verified | 固定并确认原始 Prosa 版本及声明 |
| Actual Lean artifact verified | 使用 fresh compile 的实际 Lean 产物 |
| Bidirectional correspondence proved | 两边的值在规定关系下双向对应 |
| Roundtrip proved | 两个方向来回转换均恢复原值 |
| Rocq kernel accepted certificate | 证书通过 Rocq 内核检查 |
| Assumption audit passed | 无未批准假设，并记录允许的基础依赖 |

满足这些条件后，本例将 `instant` 标记为：

```text
ACCEPTED_V06_TRANSLATION
```

这表示：**在该验证流程采用的可信边界与基础依赖下，原始 Rocq `instant` 和导入后的实际 Lean `instant` 已建立双向表示对应。**

> [!note] 结论的范围
> Rocq 内核直接检查的是原始声明与导入声明之间的证书。将结论用于原始 Lean 产物，还依赖 export/import 忠实保留其含义。`Print Assumptions` 检查证书依赖，并不单独证明 export/import 工具本身正确。

## 7. 不同 declaration 需要不同的对应条件

`instant := nat` 是简单类型别名，适合通过双向表示转换和 roundtrip 验证。更复杂的声明需要检查其操作、结果或约束。

| Declaration | 主要验证目标 |
| --- | --- |
| `instant` / `duration` | 类型和值的表示双向对应，转换可逆 |
| `scheduled_in` | 对应输入下，两边返回 `true` 的条件等价 |
| `service_in` | 对应输入下，两边有限求和的结果经表示转换后相等 |
| `ProcessorState` | State、Core、各字段操作及全部 laws 按规定条件对应 |

对于 `scheduled_in`，可以证明如下形式的条件；$x_R$ 与 $x_L$ 表示两边的一组对应参数：

$$
\operatorname{InputRel}(x_R,x_L)
\;\Longrightarrow\;
\left(
\operatorname{scheduled\_in}_R(x_R)=\mathrm{true}_R
\;\Longleftrightarrow\;
\operatorname{scheduledIn}_L(x_L)=\mathrm{true}_L
\right).
$$

对于 `service_in`，若结果使用不同的自然数表示，则应通过转换比较：

$$
\operatorname{InputRel}(x_R,x_L)
\;\Longrightarrow\;
f\!\left(\operatorname{service\_in}_R(x_R)\right)
=
\operatorname{serviceIn}_L(x_L).
$$

这里的 $L$ 表示导入 Rocq 后的 Lean 版本，相等关系也需要采用证书中明确规定的形式。

对于 `ProcessorState`，至少需要覆盖：

- State relation。
- Core relation。
- `scheduled_on` correspondence。
- `supply_on` correspondence。
- `service_on` correspondence。
- 原始声明包含的全部 laws 的保留与对应。

**统一的目标是证明两边的可观察语义对应；具体 certificate 应根据 declaration 的结构选择。**