### Terms
 - `Iso(A_R, A_L)`（Isomorphism）：用于证明 Rocq 和 Lean 中的两个 Type 同构，即存在互为逆函数的双向转换，可以让两个类型中的 Value 一一对应。
- `rel_iso(I, aR, aL)`（Representation Relation）：用于证明两个对应 Type 中的具体 Value 满足对应关系，即通过同构关系 `I` 的转换函数，将 `aR` 转换后得到的值等于 `aL`。
- `R_nat(xR, xL)`：是 `rel_iso` 在自然数类型上的简写，即 `R_nat(xR, xL) = rel_iso(I_nat, xR, xL)`，用于表示 Rocq 和 Lean 中两个自然数 Value 对应。
## 规则 1：Datatype  的对应使用同构（Isomorphism）
例子：`nat`、`list`
Rocq 中有类型 `A_R`，Lean 中有对应类型 `A_L`，证明它们之间存在同构关系 $\operatorname{Iso}(A_R,A_L)$, 需要：
1. 存在两个转换函数 $to:A_R\to A_L$ 和 $from:A_L\to A_R$，
2. 它们互为逆函数，满足 $to(from(y))=y$ 和 $from(to(x))=x$。
这意味着两边的 Datatype 可以一一对应，来回转换也不会丢失信息。
 `Iso` record 定义这一关系：
```coq
Record Iso (A B : Type) := {
  to : A -> B;
  from : B -> A;
  to_from : forall y, to (from y) = y;
  from_to : forall x, from (to x) = x;
}.
```

## 规则 2：普通 Value  的对应使用 Representation Relation
例子：`0`、`true`、列表值
假设已经建立了 Rocq 和 Lean 两个 Datatype 之间的同构关系 $I:\operatorname{Iso}(A_R,A_L)$，那么对于两个具体的值 `aR : A_R` 和 `aL : A_L`，可以通过构建 **Representation Relation `rel_iso`** 来证明它们的 correspondence。因为同构关系提供了转换函数 `I.to`，我们可以先将 Rocq 中的 `aR` 转换成 Lean 对应类型的值 `I.to(aR)`，然后与 `aL` 进行比较。只要满足 $I.to(a_R)=a_L$，就说明两个值是对应的。

例如，Rocq 返回自然数 `5`，Lean 也返回对应的自然数 `5`。虽然它们属于不同的 Datatype，不能直接比较，但可以先通过 `I.to` 将 Rocq 的 `5` 转换成 Lean 的表示，再证明转换后的结果等于 Lean 返回的 `5`。这就是 `rel_iso` record 定义的 correspondence 关系。
```coq
Record rel_iso {A B}
    (i : Iso A B) (x : A) (y : B) :=
{
  proj_rel_iso : i.(to) x = y
}.
```

## 规则 3：Function 的对应要递归检查所有输入和输出
对于 Rocq 中的函数 `fR : A_R → B_R` 和 Lean 中的对应函数 `fL : A_L → B_L`，如果已经建立了输入类型和输出类型的同构关系 `IsoA` 和 `IsoB`，那么对于任意 Rocq 输入值 `aR : A_R`，都可以通过转换函数 `I_A.to` 得到对应的 Lean 输入值 `aL : A_L`，并且它们满足 `rel_iso(I_A, aR, aL)`。
- Function Correspondence 要求：只要两边的输入值满足 Representation Relation，就必须进一步证明两个函数产生的输出值也满足对应的 Representation Relation
$$
\forall a_R,a_L,\quad
\operatorname{rel\_iso}(I_A,a_R,a_L)
\rightarrow
\operatorname{rel\_iso}(I_B,f_R(a_R),f_L(a_L))
$$
- 为了简化表示，我们定义 $R_{nat}$ 为 `rel_iso` 在自然数类型上的具体应用，即 $R_{nat}(x_R,x_L)=\operatorname{rel\_iso}(I_{nat},x_R,x_L)$。
对于多参数函数，例如 `add : nat → nat → nat`，规则会递归检查每一个参数的 correspondence，最后再比较输出：
$$
\begin{aligned}
\forall x_R,x_L,y_R,y_L,\quad
&R_{nat}(x_R,x_L)
\land R_{nat}(y_R,y_L)\\
{}\implies{}&R_{nat}(add_R(x_R,y_R),add_L(x_L,y_L))
\end{aligned}
$$

## 规则 4：Type-level Function
- 对于 Type-level Function，例如 `list : Type → Type`，它的输入是一个 Datatype，输出也是一个新的 Datatype，不是普通的 Value。
假设 Rocq 中有 `list_R : Type → Type`，Lean 中有 `list_L : Type → Type`，并且已经建立了输入类型 `A_R` 和 `A_L` 之间的同构关系 `I_A : Iso(A_R, A_L)`，那么我们需要进一步证明：将两个对应的类型分别传入 `list_R` 和 `list_L` 后，得到的新类型仍然同构。
$$
\forall A_R,A_L,\quad
\operatorname{Iso}(A_R,A_L)
\rightarrow
\operatorname{Iso}(\mathrm{list}_R(A_R),\mathrm{list}_L(A_L))
$$
- 例如，如果已经知道 Rocq 的 `nat` 和 Lean 的 `Nat` 同构，那么就需要进一步证明 Rocq 的 `list nat` 和 Lean 的 `List Nat` 也同构。与普通 Function 不同，这里的输出关系使用 `Iso` 而不是 `rel_iso`，因为 Type-level Function 返回的是 Datatype，需要证明两个输出类型同构，而不是比较两个具体 Value。

## 规则 5：Dependent Function / Forall（依赖函数）
依赖函数与普通 Function 的区别在于返回值的类型本身依赖于输入参数。核心特点是返回值的类型会随着输入值的变化而变化。 Rocq 中的依赖函数 `fR : forall x : A_R, B_R x`：
- $A_R$：Rocq 中的输入类型。
- $x : A_R$：一个具体输入值。
- $B_R$：一个类型族（Type Family），根据输入 `x` 决定返回类型。
- $B_R(x)$：给定输入 `x` 后确定的具体返回类型。
- $f_R(x)$：函数返回的具体 Value，其类型为 $B_R(x)$。
- 例如 Rocq 中 `f : forall x : nat, Vector.t nat x` 这里 `nat` 是输入类型 $A_R$，`x` 是一个类型为 `nat` 的具体输入值，而 `Vector.t nat x` 是返回类型 $B_R(x)$，表示一个**长度为 `x`、元素类型为 `nat` 的向量**。因此，当 `x = 3` 时，函数必须返回长度为 3 的自然数向量；当 `x = 5` 时，必须返回长度为 5 的自然数向量。
证明依赖函数之间的 Correspondence 
1. 首先需要证明 Rocq 输入 `xR : A_R` 和 Lean 输入 `xL : A_L` 满足 Representation Relation $R_A(x_R,x_L)$
2. 根据这两个对应的输入，建立对应的输出类型之间的同构关系 $I_B(x_R,x_L):\operatorname{Iso}(B_R(x_R),B_L(x_L))$
3. 最后，再利用这个输出类型的同构关系，证明两个函数返回的具体 Value 也满足 Representation Relation $R_{I_B(x_R,x_L)}(f_R(x_R),f_L(x_L))$
完整的 Function Correspondence 要求：对于所有满足输入 Representation Relation 的 `xR` 和 `xL`，都能建立对应输出类型的 `Iso`，并进一步证明返回值的 correspondence。
- 相比普通 Function，这里多了一步：需要根据输入值确定输出类型之间使用哪个 `Iso`，而不是始终使用一个固定的输出类型同构关系。

## 规则 6：Inductive Constructor（归纳类型构造器）
对于 Inductive Datatype，除了需要证明 Rocq 和 Lean 两边的 Datatype 同构之外，还需要进一步证明每个 Constructor 的 correspondence。例如 Rocq 中的 `list`：
```coq
Inductive list (A : Type) :=
| nil : list A
| cons : A -> list A -> list A.
```
这里 `nil` 表示空列表，而 `cons` 接收一个 Head（类型为 `A`）和一个 Tail（类型为 `list A`），构造出一个新的 List。假设 Rocq 的 `A_R` 和 Lean 的 `A_L` 已经同构，系统会分别生成以下一致性证明目标
- `list_iso`：证明当元素类型 `A_R` 和 `A_L` 同构时，两边的 `list A_R` 和 `List A_L` 也同构。
- `nil_iso`：证明 Rocq 的 `nil` 和 Lean 的 `nil` 满足 Representation Relation。`nil` 不是一个 Type，而是 `list A` 类型中的一个具体 Value，即空列表。整个证明目标是 `rel_iso`。 
- `cons_iso`：证明当 Head 和 Tail 分别满足 Representation Relation 时，两边通过 `cons` 构造出的新 List 也满足 Representation Relation。比较 Function 输出的 Value，使用 `rel_iso`
Constructor Correspondence 本质上也是 Function Correspondence：只要 Constructor 的所有输入参数对应，就必须证明构造出的输出 Value 也对应。区别在于 Inductive Datatype 还需要额外证明整个类型的 `Iso`，而每个 Constructor 都有自己独立的一致性证明目标。

## 规则 7：Proposition 的对应使用结构对应 + $P\leftrightarrow Q$ 
对于 Rocq 中的 `P : Prop` 和 Lean 中的 `Q : Prop`，仅仅证明 $P\leftrightarrow Q$ 是不够的，系统要求先验证命题内部的 Datatype、Value 和 Operator 的 correspondence，再建立整个 Proposition 的对应关系。
- 例如，Rocq 中的 Proposition 是 $a_R=b_R$，Lean 中对应的是 $a_L=b_L$。首先建立两边 Datatype 的同构关系 $I_A:\operatorname{Iso}(A_R,A_L)$，然后证明两个操作数分别满足 $R_A(a_R,a_L)$ 和 $R_A(b_R,b_L)$，最后利用已经验证的 `eq_iso`，建立整个命题的同构关系 $\operatorname{Iso}(a_R=b_R,\;a_L=b_L)$
```coq
# Rocq 中的 theorem 
Theorem plus_O_n :
  forall n : nat, 0 + n = n.
```
系统会根据 theorem statement 的结构，逐步建立以下 correspondence：
1. `nat_iso`：Rocq 的 `nat` 和 Lean 的 `Nat` 类型同构。
2. `_0_iso`：两边的常量 `0` 对应。
3. `Nat_add_iso`：对于对应输入，两边的 `add` 运算结果对应。
4. `eq_iso`：利用 `0 + n` 和 `n` 两侧的 Value Correspondence，建立整个 Equality Proposition 的 Iso。
这里有两个层次的 Correspondence：
- **Statement Correspondence**：先利用 `nat_iso`、`_0_iso`、`Nat_add_iso` 和 `eq_iso`，从内部结构逐步建立 Rocq 和 Lean 两边 Theorem Statement 的 Iso
- **Proof Correspondence**：在已经建立的 Statement Iso 基础上，进一步使用 `rel_iso`，要求 `Original.plus_O_n x1` 和 `Imported.plus_O_n x2` 这两个 Proof Terms 在对应的 Proposition 类型下满足 Representation Relation。

## 根据 Sort 选择不同的 Correspondence Relation
在 Rocq 和 Lean 的 Correspondence Verification 中，系统不能对所有对象都使用相同的 Equality 或 `Iso`，而是需要根据对象所属的 Sort（Prop、SProp、Type）选择对应的关系。仓库中的 `IsoOrSortAndRelIso` 就负责区分这些情况：

| 情况 | 使用的 Correspondence Relation |
|---|---|
| 普通 Value | `rel_iso` |
| 两个普通 Datatype | `Iso` |
| `Prop` / `Prop` | Proposition 之间的 `Iso` |
| `SProp` / `SProp` | Strict Proposition 之间的 `Iso` |
| `Type` / `SProp` 等跨 Sort 情况 | 对应的 Mixed-Sort Isomorphism |
| `∀` / Function Type | 根据输入类型和输出 Sort 递归构造 Correspondence |
