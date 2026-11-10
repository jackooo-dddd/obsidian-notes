除了 Universe Interpretation + `PULift`，项目还支持 R2B-V（Result Sort Inheritance）。它的核心思想是：当 Definition 的 Body 实际处于较低 Universe，而声明要求较高 Universe 时，在满足特定条件的情况下，直接将最终 Result Sort 降低到 Body 的实际 Sort。
与 `PULift` 不同，R2B-V 不保留原来的较高 Result Universe，而是修改 Declaration 的最终返回 Sort，使 Lean 能够直接通过 Type Checking。

### Step 1. 判断是否满足 R2B-V 的适用条件

考虑 Rocq 中的 Monomorphic Definition：

```coq
Universe u w.
Constraint u <= w.

Definition wrapType
    (A : Type@{u}) : Type@{w} :=
  A.
```

这里 `A : Type@{u}`，但 Declaration 要求返回 `Type@{w}`。由于 Rocq 支持 Cumulativity，只要满足：

$$
u \leq w
$$

Body `A` 就可以被用作 `Type@{w}` 中的类型。

但直接翻译到 Lean：

```lean
def wrapType.{u, w}
    (A : Type u) : Type w :=
  A
```

通常无法通过 Type Checking，因为 Body 的实际类型是 `Type u`，而声明要求 `Type w`。

R2B-V 可以尝试处理这种情况，但需要满足：
- Declaration 必须是 Type-valued Definition，最终返回类型是一个 Sort，例如 `Type@{w}`。
- 待降低的 Global Level `w` 只能出现在最终 Result Sort 中，不能同时出现在 Binder Types。
- Source Universe Facts 必须支持这次降低，例如 `u ≤ w`。
- 不能用于 Theorem、Proof Statement 或 Opaque Interface，也不能改变输入参数的 Universe Requirements。

### Step 2. 使用 Lean Type Checking 确定 Body Sort

对于上面的 `wrapType`：

```coq
Body = A
```

Lean 推断：

```lean
A : Type u
```

因此：

```text
Declared Result Sort : Type w
Actual Body Sort     : Type u
```

R2B-V 不再强制使用原来的较高 Result Sort，而是直接采用 Body 的实际 Sort：

$$
\boxed{\mathrm{Type}(w)\longrightarrow\mathrm{Type}(u)}
$$

这里不是任意合并 Universe Levels，而是因为源 Facts 已经保证 `u ≤ w`，所以 Body 的实际 Sort 是源声明允许的较低层级。

### Step 3. 重新构造 Lean Declaration

应用 R2B-V 后：

```lean
def wrapType.{u}
    (A : Type u) : Type u :=
  A
```

这里有三个特点：

1. 不需要 `PULift`，因为 Body 的实际 Sort 与 Declared Result Sort 已经一致。
2. 不修改原始 Body，仍然直接返回 `A`，只改变最终 Result Sort。
3. 不一定保留完整的 Universe Generality。原本 Rocq 可以将结果放在更高的 `Type@{w}` 中，但降低后，Lean 的下游引用不能自动利用这种 Cumulativity。

因此，R2B-V 是一种受限制的 Result Sort Lowering，而不是与 `PULift` 完全等价的解决方案。

### Step 4. 验证 Result Sort Lowering

由于 R2B-V 修改了最终 Result Sort，项目还需要进行以下检查：

- Source Universe Facts：确认原始约束支持降低，例如 `u ≤ w`。
- Result-Sort-Only Checking：确认被降低的 Level 只出现在最终 Result Sort，而不是 Binder Types。
- Body Correspondence：确认 Body 没有被错误修改，新的 Result Sort 等于 Body 的实际 Sort。
- Kernel / Interface Checking：确认 Lean Declaration 合法，并检查相关下游引用。

翻译结果会记录类似：

```text
result_sort_inherited: true
sort_lowered_levels: ...
```

其中 `sort_lowered_levels` 记录被降低的源 Global Levels 及其对应解。

### Step 5. 项目中的真实例子：`CompSpecT`

Corelib 中的 Rocq Definition：

```coq
Definition CompSpecT {A}
    (eq lt : A -> A -> Prop)
    (x y : A) : comparison -> Type :=
  CompareSpecT (eq x y) (lt x y) (lt y x).
```

Exporter 中涉及两个 Global Levels：
- `g258`：输入类型 `A` 的 Universe Level。
- `g259`：最终 Result Sort 的 Universe Level。

源声明要求返回 `Type@{g259}`，但翻译后的 Body 实际返回 `Type 0` 中的类型，因此 R2B-V 可以让最终 Result Sort 采用 `Type 0`。

实际 Lean 输出简化为：

```lean
def CompSpecT.{u}
    (A : Type u)
    (eq lt : A → A → Prop)
    (x y : A) :
    comparison → Type :=
  CompareSpecT (eq x y) (lt x y) (lt y x)
```

可以看到：
- `A : Type u` 保留了输入类型的 Universe Parameter。
- 最终结果使用 `Type`，即 `Type 0`。
- Body 没有使用 `PULift`，原来的计算结构被保留。

项目报告显示该 Declaration 通过 `c[rv]` 重试路径，记录了：

```text
result_sort_inherited: true
status: TRANSLATED_AND_CHECKED
```

对应源码：
- [Datatypes.v — CompSpecT](https://github.com/jackooo-dddd/rocq-core/blob/main/results/corelib-complete/Corelib/Init/Datatypes.v)
- [Datatypes.txt — Lean Output](https://github.com/jackooo-dddd/rocq-core/blob/main/results/corelib-complete/Corelib/Init/Datatypes.txt)
- [Datatypes.md — Translation Report](https://github.com/jackooo-dddd/rocq-core/blob/main/results/corelib-complete/Corelib/Init/Datatypes.md)

## R2B-V 与 `PULift` 的区别

| | `PULift` | R2B-V |
|---|---|---|
| 核心方法 | 显式提升 Body 的表示 | 降低最终 Result Sort |
| 是否保留较高 Universe | 是，在支持的情况下 | 不一定 |
| 是否修改 Body 表示 | 增加 Wrapper / Conversion | 不改变原始计算结构 |
| Universe Generality | 尝试保留合法源实例 | 可能限制高 Universe 的使用 |
| 适用情况 | 需要显式处理 Cumulativity | Result Sort 可以合法降低 |

## 总结

R2B-V 的完整流程可以概括为：

```text
Rocq Type-valued Definition
  Body : Type@{u}
  Declared Result : Type@{w}
  Constraint : u ≤ w
          │
          ▼
Step 1. Applicability Check
  确认 w 只出现在最终 Result Sort
          │
          ▼
Step 2. Infer Body Sort
  Body : Type u
          │
          ▼
Step 3. Result Sort Inheritance
  Type w → Type u
  不添加 PULift
          │
          ▼
Step 4. Audit + Lean Kernel
  检查 Source Facts、Body 和 Interface
```

最重要的区别是：`PULift` 通过显式包装保留原本较高的 Result Universe，而 R2B-V 直接让目标 Declaration 的返回 Sort 与 Body 的实际 Sort 一致。

因此，R2B-V 只适用于满足特定条件的 Type-valued Definitions，并且通常作为其他翻译策略失败后的特殊 Retry Path。

对应实现：[UNIVERSE_FAMILY_C.md — R2B-V](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/docs/UNIVERSE_FAMILY_C.md)、[Emit.lean](https://github.com/jackooo-dddd/rocq-core/blob/main/translator/Rocq2Lean/Emit.lean)。