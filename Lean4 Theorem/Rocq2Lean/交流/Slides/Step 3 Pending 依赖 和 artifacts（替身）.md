#### 什么是 Pending 依赖
有些依赖在 Lean 中**还没有一个真正的常量可以直接引用**。原因是它需要的东西还没有：

|依赖的种类|缺什么|最终的 `Rocq.<name>` 什么时候才有|
|---|---|---|
|定理（`statement_only`）|Proof|证明 agent 证明之后，由 assembly 生成|
|Obligation（`…__rocq2lean_obligation_k`）|Proof|同上|
|终止性 Obligation（`…__rocq2lean_termination_k`）|良基性的 Proof|同上|
|Pending 定义（自己依赖上面这些）|它的前提的 Proof|前提都证明之后，由 assembly 生成|

这类依赖就叫 **Pending**：它们不是“失败”了，只是还在等证明。所以引用它们的声明不能写成“引用 `Rocq.<name>`”，只能把它们变成**假设**。

#### 什么是 Artifact

Artifact 指的是：**本次运行中已经被 Lean Kernel 接受、可以代替这个 Pending 依赖出现在 Lean 代码里的那个声明**。

- **依赖是定理或 Obligation**：Artifact 是它的 Statement 定义，`def Rocq.<name>.statement : Prop := …`。引用它的声明会得到一个假设 `{h : Rocq.<name>.statement}`。所以要写出这个假设，**必须先有这个 `.statement`**，因为它就是假设的类型。
- **依赖是 Pending 定义**：Artifact 是它的 `RocqPending.<name>`。引用时用这个 artifact，并传入它需要的假设。

“经过验证”的意思是：这个 Artifact 自己在前面已经走完了 Step 3–8，被 Kernel 接受，结果行的状态是成功的。

#### `OBLIGATIONS_PENDING` 是什么情况

依赖是 Pending 的，**但是它的 Artifact 不存在**。最典型的原因是这个 Artifact 自己的翻译失败了：定理的 Statement 在翻译时被拒绝（比如 `UNIVERSE_REJECTED`），所以没有 `Rocq.<name>.statement`。这时连假设的类型都写不出来，引用它的声明也就无法翻译，只能停下。

以 `pack` 为例：

正常情况：
  Rocq.pack__rocq2lean_obligation_1.statement 已被 Kernel 接受   ← Artifact 存在
  → pack 通过 Gates，得到假设 {h : …obligation_1.statement}
  → RocqPending.pack，PENDING_KERNEL_CHECKED

如果这个 Obligation 的 Statement 翻译失败：
  没有 Rocq.pack__rocq2lean_obligation_1.statement              ← Artifact 不存在
  → 假设 h 的类型无从写起
  → pack 在 Gates 处停下：OBLIGATIONS_PENDING

#### 和 `BLOCKED_DEPENDENCY` 的区别

|状态|依赖是什么|出了什么问题|
|---|---|---|
|`BLOCKED_DEPENDENCY`|普通依赖：本来应该有一个可以直接引用的 `Rocq.<name>`（如普通 Definition、Inductive）|它翻译失败了|
|`OBLIGATIONS_PENDING`|Pending 依赖：本来就只能以假设或 `RocqPending` 的形式引用|用来代替它的 Artifact（`.statement` 或 `RocqPending.<name>`）不存在|

两者的结果都是这个声明不能翻译，区别在于依赖本来应该以什么形式出现在 Lean 中。




|Step 1（Rocq 中）|Step 2–8 之后（Lean 中）|是不是替身|
|---|---|---|
|`Parameter pack__rocq2lean_obligation_1 : ∀ n, n = n`|`def Rocq.pack__rocq2lean_obligation_1.statement : Prop := ∀ n, n = n`|**这个 `.statement` 是替身**：它代替还没证明的 Obligation，作为假设的类型|
|改写后的 `Definition pack … := exist _ n (pack__rocq2lean_obligation_1 n)`|`def RocqPending.pack {h : Rocq.pack__rocq2lean_obligation_1.statement} (n : nat) := ⟨n, h n⟩`|对 `pack` 自己来说，它是**翻译结果**，不是替身|

翻译 `pack` 时的过程是：

1. `pack` 的 Body 引用了 `pack__rocq2lean_obligation_1`，这个 Obligation 还没有证明，是 Pending 依赖。
2. Gates 检查它的替身 `Rocq.pack__rocq2lean_obligation_1.statement` 是否已被 Lean Kernel 接受。
3. 已接受，所以 `pack` 继续翻译，得到假设 `{h : …statement}`，原来对 Obligation 的引用变成 `h n`。
4. 结果是 `RocqPending.pack`。

还有一层：如果后面有一个声明 `use_pack` 引用了 `pack`，那么对 `use_pack` 来说，`pack` 是一个 Pending 定义。这时 `RocqPending.pack` 就成了 `pack` 的替身，`use_pack` 会引用 `RocqPending.pack h`，并继承同一个假设 `h`。