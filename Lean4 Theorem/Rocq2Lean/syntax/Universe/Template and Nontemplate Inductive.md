## Rocq Inductive 的三种 Universe 机制
在 Rocq 中，Inductive Declaration 的 Universe 机制主要分成三种：
```text
Inductive Universe
├── Template Polymorphic
└── Non-template
    ├── Monomorphic
    └── Fully Universe-Polymorphic
```
需要注意，Template 和 Fully Polymorphic 都可以根据实际参数推断 Universe Levels，区别不在于是否需要手动指定 Universe，而在于它们的 Kernel Representation 和 Universe Instantiation Mechanism 不同。

## Template vs Non-template：Universe Level 何时确定？

在 Rocq 中，每个 Type 都属于某个 Universe Level，可以简单理解为 Type 的“大小”。例如，`nat` 属于 `Set`，而一个包含其他类型的 Type 可能需要更高的 Universe Level。对于 `list A` 这样的容器类型，它的 Universe Level 必须足够容纳元素类型 `A`。

关键问题是：这个 Universe Level 是在定义时固定，还是每次使用时确定？

### 1. Template Polymorphic：每次使用时根据参数确定

例如 Rocq 中的 `list`：

```coq
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```

对于 Template Polymorphic Inductive，Rocq 可以根据实际传入参数 `A` 的 Universe Level，确定 `list A` 所在的 Universe。

可以把 `list` 理解成一个能够自动调整大小的容器：

- `list nat`：`nat : Set`，因此 `list nat : Set`。
- `list Type`：如果元素本身是类型，那么需要使用更高的 Universe Level 来容纳它们。

每次使用 `list` 时，Template Universe 都可以根据实际参数独立确定，因此不同的 `list` 实例不会相互限制 Universe Level。

这种机制只适用于符合特定条件的 Inductive Type。Template Universe 必须能够从指定参数的类型层级中确定，而不能任意出现在复杂的类型表达式中。

Corelib 中的 `list`、`option`、`prod`、`sum` 和 `sigT` 都是典型例子。

### 2. Non-template Monomorphic：定义时确定 Global Universe

例如 MathComp 中的结构，可以用以下简化形式表示：

```coq
Record type := Pack {
  sort : Type@{eqtype.58};
  ...
}.
```

这里的 `eqtype.58` 是 Global Universe Level，其身份在声明时已经确定，不会在每次使用 `Equality.type` 时重新实例化。

可以把它理解成一个大小固定的容器：

- 每次使用 `Equality.type`，引用的都是同一个 Global Universe Level。
- 由于 Rocq 支持 Universe Cumulativity，较低层级的类型也可以用于较高层级的位置。
- 但不能为某次特定使用单独生成一个不同的 `eqtype.58`。

需要注意，这里的“固定”是指 Universe Level 的身份固定，并不意味着它在定义时就必须被赋予具体数字。

由于这些 Global Universe Levels 可能在多个 Declaration 之间共享，Rocq 需要保存它们之间的 Universe Constraints。例如：

```text
choice.299 ≤ eqtype.58
```

这表示 `choice.299` 对应的层级不能高于 `eqtype.58`。MathComp 中的 `Equality.type`、`Choice.type` 和许多 HB Classes 都涉及类似的 Global Universe 关系。

### 3. 总结

| 比较 | Template Polymorphic | Non-template Monomorphic |
|---|---|---|
| Universe 何时确定 | 每次使用时根据参数确定 | 声明时确定 Global Level 身份 |
| 每次使用是否独立 | 是 | 否，共享 Global Levels |
| Universe Cumulativity | 支持 | 支持 |
| 直观理解 | 大小可以调整的容器 | 大小受共享层级约束的容器 |
| 典型例子 | `list`、`option`、`prod` | `Equality.type`、`Choice.type`、HB Classes |

### What the two words mean

Using the same “size” picture as before:

- **Monomorphic:** the declaration’s sizes are fixed once and shared by every use. This is the “rigid box” from before, like `Equality.type` with its single `eqtype.58`. It is Rocq’s default.
- **Polymorphic:** the declaration is marked `Polymorphic`, and its sizes are variables. Each use picks fresh sizes, like `foo@{u v}`. That makes it a stretchy box too, but unlike template, the stretching isn’t limited to “read it off one parameter”: any use can choose any sizes, as long as the declaration’s stated constraints hold.

Template is a special case in between. A template inductive is monomorphic, but Rocq lets its size follow its argument at each use.
### Why this matters for us

**Lean only has the polymorphic kind.** Every Lean declaration has universe parameters, and each use instantiates them fresh. Lean has neither shared global sizes nor cumulativity (the rule that a smaller thing fits in a bigger box).

So the two cases differ a lot:

|Rocq source|How common in our corpus|Translation to Lean|
|---|---|---|
|**Monomorphic** (MathComp, HB structures, Prosa)|almost everything|**Hard.** Shared fixed sizes become Lean parameters, which makes each use free to choose sizes Rocq never chose. The translator must pick sizes Rocq never fixed and check they agree with Rocq’s size facts. Most of our universe rules exist for this.|
|**Polymorphic** constants|rare|**Fairly direct.** Rocq’s size variables become Lean’s universe parameters, and each use’s sizes are translated one by one.|
|**Polymorphic** inductives|rare|Not supported yet (`UNSUPPORTED_FEATURE`).|
|**Template** inductives (`list`, `option`, `prod`)|a handful of Corelib types|Direct: Lean already reads the size off the argument.|

In short, the gap between Rocq’s monomorphic world (shared sizes plus cumulativity) and Lean’s polymorphic one (fresh sizes, no cumulativity) is what most of the project’s universe work is about.

### Monomorphic: one name, not a chosen value
A monomorphic level is not set to something concrete like `Set`. It is a **named level**, such as `eqtype.58`, whose exact value Rocq never decides. What Rocq does keep is a list of facts about it, for example:
- `choice.299 ≤ eqtype.58`
- `Set < eqtype.58`
“Fixed” means that the same name `eqtype.58` is used everywhere in the library. Every use of `Equality.type` refers to that one level. You can’t get a copy of `Equality.type` at a different level for one particular use.
A side note on your example: `nat` isn’t a universe level. `nat` is a type, and it lives at level `Set`. So `nat : Set`, and `Set` is the smallest level for data types.

So the picture is:

- **Monomorphic:** one unknown size `eqtype.58`, shared by everyone, with only some facts known about it.
- **Polymorphic / template:** a fresh size at every use.
