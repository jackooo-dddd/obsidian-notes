## Equality Correspondence：从 Rocq 相等推出 Lean 相等

假设已经建立 Rocq 和 Lean 两边自然数的 Representation Relation，现在需要证明：**如果 Rocq 中的两个自然数相等，那么它们在 Lean 中对应的两个自然数也相等。** 项目中的 Lemma 定义如下：

```coq
Lemma sub_nat_eq_correspondence aR aL bR bL :
  SubNatRel aR aL ->
  SubNatRel bR bL ->
  PropSPropRel
    (Logic.eq aR bR)
    (Lean.eq aL bL).
```

这里有两个输入条件 `Ha : SubNatRel aR aL` 和 `Hb : SubNatRel bR bL`，而 `SubNatRel` 的定义是：

```coq
Definition SubNatRel (nR : nat) (nL : Lean.Nat) :=
  Lean.eq (sub_nat_to_imported nR) nL.
```

为了方便，将 `sub_nat_to_imported` 简写为 `to`。展开后，两个输入条件分别表示 $Ha:to(a_R)=a_L$ 和 $Hb:to(b_R)=b_L$，也就是 `aR` 与 `aL` 对应，`bR` 与 `bL` 对应。

**正方向的证明：** 假设 Rocq 中 $a_R=b_R$，目标是证明 Lean 中 $a_L=b_L$。由于 `to` 是一个函数，相等的输入经过相同函数转换后仍然相等，因此 $to(a_R)=to(b_R)$。再结合 `Ha` 和 `Hb`，通过相等的对称性和传递性，就能得到：

$$
\boxed{
a_L\overset{Ha}{=}to(a_R)
\overset{a_R=b_R}{=}to(b_R)
\overset{Hb}{=}b_L
}
$$

项目中对应的 Rocq Proof：
```coq
- intro Heq.
  destruct Heq.
  exact (sub_imported_eq_trans _ _ _
    (sub_imported_eq_sym _ _ Ha) Hb).
```

其中 `intro Heq` 引入假设 `Heq : Logic.eq aR bR`；`destruct Heq` 利用 Rocq 的 Equality Elimination 将 `bR` 替换成 `aR`，此时 `Ha` 和 `Hb` 分别表示 `to(aR) = aL` 和 `to(aR) = bL`；`sub_imported_eq_sym` 将 `Ha` 反转成 `aL = to(aR)`，最后 `sub_imported_eq_trans` 利用传递性得到 `aL = bL`，完成证明。

**关键区别：正方向不需要 Roundtrip，因为任何函数都保持 Equality；反方向则需要证明 `to` 不会将两个不同的 Rocq 值映射成相同的 Lean 值，因此需要利用 `from` 和 Roundtrip 来建立 `to` 的单射性。** 所以正方向可以总结为：假设 $a_R=b_R$，利用 `to` 保持相等，再通过 `Ha`、`Hb` 两个 Representation Relations，最终推出 $a_L=b_L$。

## 1. Equality Correspondence：从 Nat 推广到任意 Type

`nat` 的 Equality Correspondence 证明方法可以推广到其他 Datatype，因为它本质上不依赖 Natural Number 的特殊性质。假设 Rocq 中有类型 $A_R$，Lean 中有对应类型 $A_L$，并且存在转换函数 $to:A_R\rightarrow A_L$，我们可以定义 Representation Relation：

$$
R_A(x_R,x_L)\iff to(x_R)=x_L
$$

对于任意两个值 `aR`、`bR` 及其 Lean 对应值 `aL`、`bL`，假设已经满足 $H_a:to(a_R)=a_L$ 和 $H_b:to(b_R)=b_L$，那么 Equality Correspondence 的正方向可以直接证明：

$$
\boxed{a_R=b_R\implies a_L=b_L}
$$

证明过程就是利用函数保持 Equality 的性质，再通过两个 Representation Relations 替换：

$$
a_L\overset{H_a}{=}to(a_R)
\overset{a_R=b_R}{=}to(b_R)
\overset{H_b}{=}b_L
$$

这里完全没有使用 Nat 的特殊性质。**只要 `to` 是一个函数，并且两组输入值满足上述 Representation Relation，这个正方向证明就适用于 Nat、List、Job 等任意 Datatype。**

## 2. 反方向也可以通用化

如果还需要证明 $a_L=b_L\implies a_R=b_R$，则要求转换函数 `to` 是 Injective（单射），即不会把两个不同的 Rocq Values 转换成相同的 Lean Value。如果已经有反向转换函数 `from`，并证明了 Roundtrip：

$$
from(to(x))=x
$$

那么就可以通过以下等式推导：

$$
\boxed{
a_R=from(to(a_R))=from(a_L)=from(b_L)=from(to(b_R))=b_R
}
$$

因此，**只要 `to` 是 Injective，Equality Correspondence 的两个方向都能证明。** 严格来说，不一定需要完整的 Isomorphism，只需要 `to` 的单射性；但如果已经建立了 `Iso` 和双向 Roundtrip，那么自然可以得到这个性质。

## 3. 哪些 Datatype 可以复用这个规则？

| Type | Equality Correspondence |
|---|---|
| `nat ↔ Nat` | 可以，利用 Nat Conversion 和 Roundtrip |
| `bool ↔ Bool` | 可以，使用相同机制 |
| `list ↔ List` | 可以，先建立 List Conversion 和 Injectivity |
| `option ↔ Option` | 可以，使用相同机制 |
| `Job ↔ Job` | 可以，前提是已经建立满足要求的 Job Representation Relation |
| Record / Structure | 可以，先证明整体 Conversion 的 Injectivity |
| Function Type | 可以，但建立函数类型同构时可能涉及 Function Extensionality |

这里需要区分两个步骤：第一步是 **Type / Value Correspondence**，例如先建立 Rocq Job 和 Lean Job 之间的 Conversion、`JobRel` 及必要的 Roundtrip；第二步是 **Equality Correspondence**，在已有 Representation Relation 和 Injectivity 的基础上，直接应用通用 Equality Lemma，而不需要重新针对 Job 的内部结构证明 Equality。

## 4. 对 Rocq2Lean Translation 的意义

在 Rocq → Lean Translation 项目中，可以把 Equality Correspondence 设计成一条通用的机械翻译和验证规则，而不是每遇到一个新的 Datatype 就重新设计证明：

```text
Generic Equality Correspondence

Input:
  A_R, A_L
  to : A_R → A_L
  R(xR, xL) := to(xR) = xL

Requirements:
  Forward: to is a function
  Backward: to is injective

Output:
  R(aR, aL) →
  R(bR, bL) →
  (aR = bR ↔ aL = bL)
```

这里的 `↔` 表示逻辑等价；在实际的 Rocq / Lean Import Verification 中，由于两边的 Equality Proposition 可能位于不同 Sort（例如 `Prop` 和 `SProp`），因此还需要使用相应的 `PropSPropRel` 来表达这个 Correspondence。

这样，翻译器只需要针对每种新的 Datatype 建立 Conversion、Representation Relation 和必要的 Injectivity / Roundtrip Proof，然后就能复用同一套 Equality Correspondence 机制。需要注意，这条规则假设 Relation 由单一转换函数 `to` 定义；如果使用更一般的 Relation，允许一个 Rocq Value 对应多个 Lean Values，那么 Equality Correspondence 不一定自动成立，需要额外证明 Relation 的相关性质。

**总结：对于 Nat、List、Job 等普通 Datatype，只要它们的 Representation Relation 由转换函数定义，并且 `to` 具有 Injectivity，就能用同一套通用机制证明 Equality Correspondence。真正需要针对每个 Type 单独处理的是 Conversion、Representation Relation 和 Roundtrip，而不是 Equality Correspondence 的证明结构本身。**