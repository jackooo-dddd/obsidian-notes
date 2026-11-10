## 1. Primitive Translation 的核心问题

在我们的 `rocq-core` 项目中，Primitive Translation 需要解决的问题是：Rocq 和 Lean 都提供高效的内置类型，但它们在 Kernel 中的表示、计算规则和语义不一定相同，因此不能简单地把 Rocq Primitive 替换成名字相似的 Lean 类型。

根据项目中的 N01–N06 Primitive Translation Rules，主要处理以下四类 Primitive：

| Rocq Primitive | Lean 对应方案 | 主要原因 |
|---|---|---|
| `int63` | `BitVec 63` | 都表示模 2⁶³ 的整数，核心语义可以对应 |
| `float` | 自定义 Binary64 Model | 需要明确保留浮点表示、特殊值和计算语义 |
| `array` | 自定义 Bounded Array Model | 默认值、越界访问和最大长度语义不同 |
| `string` | 自定义 Byte String Model | Rocq 允许任意字节，而 Lean String 表示 Unicode 文本 |

解决思路是：能够直接对应 Lean Native Types 的，就尽量使用；如果两边存在语义差异，则构造保留 Rocq 行为、并且能通过 Lean Kernel 检查的计算模型。

## 2. 为什么 Rocq 和 Lean 存在 Primitive Gap？

### 2.1 Primitive 与普通 Inductive 的区别

普通 Inductive 的结构由 Constructors 定义，例如：

```coq
Inductive nat : Set :=
| O : nat
| S : nat -> nat.
```

翻译器可以根据 `O`、`S` 生成对应的 Lean Inductive。

但是 Primitive 不同。例如 Rocq 的 `int63`：

```coq
Primitive int := #int63_type.
Primitive add := #int63_add.
```

这里并不是利用 Constructors 定义整数类型，而是直接使用 Rocq Kernel 认识的特殊类型与运算：

- `int` 是 Kernel 内置的 Primitive Type。
- `add` 是 Kernel 内置的 Primitive Operation。
- Kernel 可以通过专门的 Primitive Reduction 计算加法，而不需要展开普通递归函数。

因此，Primitive 的语义不仅包含 AST 中的类型和函数名称，还包括 Kernel 为其定义的计算行为。

### 2.2 两个 Kernel 的计算表示不同

Rocq 的 Primitive 通常具有专门的 Kernel Reduction Rules，而 Lean 经常通过可检查的 Logical Model 表达运算，同时使用更高效的 Runtime Implementation 执行。

```text
Rocq Primitive
    │
    ▼
Kernel Primitive Reduction
    │
    ▼
Definitional Equality / Type Checking
```

```text
Lean Primitive Model
    │
    ▼
Logical Definitions / Recursors
    │
    ▼
Kernel Checking
    │
    └── Runtime 可以使用优化实现
```

例如：

```coq
Definition x := add 1 2.
```

Rocq Kernel 能通过 Primitive Reduction 将 `add 1 2` 归约为 `3`。

如果在 Lean 中只是把 `add` 改名为某个没有对应计算规则的函数：

```lean
def x := primitiveAdd 1 2
```

即使整个 Definition 通过类型检查，也不代表 `primitiveAdd 1 2` 可以在 Lean Kernel 中归约为 `3`。

这里影响的不是执行速度，而是 Definitional Equality（定义相等）。如果源 Rocq Declaration 依赖 Primitive Reduction 完成类型检查或证明，那么翻译后的 Lean 表达式也必须提供相应的可检查计算行为。

因此，Primitive Translation 需要关注两个目标：
1. Semantic Preservation：保留源 Primitive 的类型、运算和语义。
2. Computational Preservation：提供 Lean Kernel 能检查的对应计算实现。

## 3. int63：使用 Lean BitVec 63

对应源码：`PrimInt63.lean`

### 3.1 为什么可以使用 BitVec 63？

Rocq `int63` 是一个 63-bit Word，其无符号值范围为：

$$
0 \leq x < 2^{63}
$$

算术运算采用模 $2^{63}$ 的行为，例如：

$$
(2^{63}-1)+1\equiv 0\pmod{2^{63}}
$$

Lean 中的 `BitVec 63` 也能表达这种固定宽度整数语义。因此，翻译器可以直接将 Primitive Type 映射为：

```lean
| .prim "int63_type" _ =>
    return mkApp (mkConst ``BitVec) (mkRawNatLit 63)
```

即：

```text
Rocq int63 → Lean BitVec 63
```

部分基本运算也可以直接对应：

```text
int63_add → BitVec.add
int63_sub → BitVec.sub
int63_mul → BitVec.mul
```

### 3.2 为什么部分运算仍然需要重新实现？

虽然 `int63` 与 `BitVec 63` 的表示可以对应，但并不意味着所有 Primitive Operations 都具有相同的语义。

例如，项目定义了：

```lean
def udiv (w : Nat) (x y : BitVec w) : BitVec w :=
  BitVec.ofNat w (x.toNat / y.toNat)
```

这里先将 `BitVec` 转换为 `Nat`，使用 Lean 自然数除法，再转换回固定宽度的 `BitVec`。

这样可以明确处理：
- 除数为 `0` 时，商返回 `0`。
- 除数为 `0` 时，余数返回被除数。
- 运算结果始终限制在对应 Bit Width 内。

项目还对 Signed Division、Shifts、Bitwise Operations 等进行专门处理，以确保运算语义与所需的证明依赖一致。

因此，`int63` 的核心策略是：保留 Lean Native Type，仅对语义或依赖存在差异的 Operations 提供专门实现。

## 4. Array：为什么不能直接使用 Lean Array？

对应源码：`PrimArray.lean`

### 4.1 主要区别：Rocq Array 保存 Default Value

Rocq Primitive Array 可以理解为包含三个部分：

```text
Rocq Array
    ├── length
    ├── elements
    └── default value
```

例如，创建一个长度为 `3`、默认值为 `7` 的数组：

```coq
make 3 7
```

得到的行为包括：

```text
get a 0   = 7
get a 1   = 7
get a 2   = 7
get a 100 = 7
```

最后一个例子最重要：即使 Index 超出数组长度，也会返回这个数组自己保存的 Default Value。

但 Lean 原生的：

```lean
Array Nat
```

并不在 Array 内部保存这样一个独立的 Default Field。

例如：
- `a[i]!`：越界时会触发 Panic。
- `a.getD i d`：可以指定默认值，但需要在读取时额外传入 `d`。
- Lean Native Array：没有直接携带 Rocq Primitive Array 的相同长度上限语义。

因此，直接使用 Lean Array 无法保留 Rocq Array 的完整表示和操作语义。

### 4.2 项目中的 Array Model

项目使用自定义结构：

```lean
structure Rep (A : Type u) : Type u where
  size     : Fin (maxLength + 1)
  value    : Fin size.val → A
  fallback : A
```

| Field | 作用 |
|---|---|
| `size` | 数组长度，最大为 4,194,303 |
| `value` | 将合法 Index 映射到对应元素 |
| `fallback` | 越界访问时返回的 Default Value |

这里的 `value` 并不是 Lean Native Array，而是一个函数：

```lean
Fin size.val → A
```

这表示每个合法 Index 都对应一个元素，使数组可以用普通的 Lean Definitions 表示。

对应的 `get` 操作为：

```lean
def get (A : Type u) (t : Rep A) (i : BitVec 63) : A :=
  if h : i.toNat < t.size.val then
    t.value ⟨i.toNat, h⟩
  else
    t.fallback
```

它的逻辑是：

```text
get array i
    │
    ▼
i < array.size ?
    │
    ├── Yes → array.value[i]
    │
    └── No  → array.fallback
```

此外，项目通过 `boundedSize` 限制数组大小：

$$
\operatorname{size}=\min(n,4194303)
$$

这样可以保证 `make` 在长度过大时仍然遵循 Rocq 的约定。

### 4.3 为什么 Array 的语义必须保留？

考虑一个示意性的 Rocq 定理：

```coq
forall n d i,
  n <= i ->
  get (make n d) i = d.
```

例如：

```text
a := make 3 7
get a 100 = 7
```

在项目的 `Rep` Model 中，这个性质直接来自：

```lean
fallback = d
```

但如果将 Rocq Array 直接翻译成 Lean Array，并使用 `a[i]!` 进行读取，那么越界访问将触发 Panic，无法保留同样的行为。

因此，Array 的主要 Gap 是 Representation Gap 和 Operation Semantics Gap：两边的数据结构保存的信息不同，越界操作的含义也不同。

## 5. String：Rocq Byte String 与 Lean Unicode String

对应源码：`PrimString.lean`

### 5.1 为什么不能直接映射为 Lean String？

Rocq Primitive String 本质上是 Byte Sequence，而不是 Unicode Text。

例如，以下字节序列可以作为 Rocq Primitive String：

```text
[0x48, 0x69, 0xFF, 0x00]
```

其中：
- `0x48`、`0x69`：普通 ASCII 字节。
- `0xFF`：单独出现时不是有效 UTF-8 编码。
- `0x00`：NUL 字节。

但 Lean `String` 表示 Unicode 文本，不能直接覆盖所有任意 Byte Sequences。

此外，Rocq Primitive String 还有最大长度限制：

$$
\mathrm{maxLength}=16,777,211
$$

因此，仅仅将 Rocq `string` 映射为 Lean `String`，无法直接保留原始的表示域和长度约束。

### 5.2 项目的 Byte String Model

项目使用一个带长度限制的 Byte Sequence：

```lean
structure Rep where
  size  : Fin (maxLength + 1)
  value : Fin size.val → BitVec 8
```

其中：
- `size`：字符串包含的字节数量。
- `value`：将合法 Index 映射为对应 Byte。
- `BitVec 8`：表示 `0` 到 `255` 的任意字节。

因此：

```text
[0x48, 0x69, 0xFF, 0x00]
```

在这个模型中可以完整表示。

项目进一步使用普通 Lean Definitions 实现：

```lean
PrimString.make
PrimString.length
PrimString.get
PrimString.sub
PrimString.cat
PrimString.compare
```

例如，`get` 会将读取的 Byte 转换为 Rocq 使用的 63-bit `char63` 表示，而不是直接使用 Lean Unicode `Char`。

因此，String 的主要问题是 Representation Domain 不一致：Rocq Primitive String 可以包含任意 Bytes，而 Lean String 的表示与有效 Unicode 文本有关。

## 6. Float：最复杂的 Primitive

对应源码：`PrimFloat.lean`

Float Translation 不仅需要处理类型表示，还需要处理 IEEE 754 浮点运算的完整语义，包括：
1. Binary64 浮点数的表示。
2. 算术运算和精确舍入。
3. NaN、Infinity、Positive Zero 和 Negative Zero。
4. Kernel 是否能够检查对应的计算行为。

### 6.1 项目如何表示 Float？

项目没有直接使用 Lean Native Float，而是定义了：

```lean
inductive Rep where
  | finite
      (sign : Bool)
      (exponent : Fin 2047)
      (fraction : BitVec 52)
  | infinity (sign : Bool)
  | nan
```

| Constructor | 表示的值 |
|---|---|
| `finite` | 有限数，包括普通数、次正规数、正零和负零 |
| `infinity` | 正无穷或负无穷 |
| `nan` | 规范化的 NaN |

Binary64 使用 64-bit 编码：

| Field | Bit Width |
|---|---|
| Sign | 1 bit |
| Exponent | 11 bits |
| Fraction | 52 bits |

项目将有限数的 Exponent 限制在 `0–2046`，并单独表示 Infinity 和 NaN。

这样可以保留特殊值的区别。例如：

```text
+0.0 ≠ -0.0       （作为位表示）
+0.0 == -0.0      （IEEE 数值比较）

NaN == NaN → false
```

因此，项目区分了不同的相等判断：

```lean
def eqb   (x y : Rep) : Bool := ...
def equal (x y : Rep) : Bool := ...
```

其中 `eqb` 表示浮点数值比较，而 `equal` 用于比较规范化的位表示。

### 6.2 Float Operations 如何实现？

Float Translation 还需要保留 `add`、`mul`、`div`、`sqrt` 等计算行为。

项目采用：

精确整数 / 有理数计算 + IEEE 754 Round-to-Nearest-Even（最近偶数舍入）。

例如，核心的舍入商函数：

```lean
def roundQuotient (n d : Nat) : Nat :=
  let q := n / d
  let r := n % d
  if 2*r > d || (2*r == d && q % 2 == 1) then
    q + 1
  else
    q
```

计算过程是：
1. 先使用精确整数运算得到商 `q` 和余数 `r`。
2. 如果余数超过一半，则向上舍入。
3. 如果恰好位于两个值之间，则选择偶数结果。
4. 通过后续的 `round` 和 `pack` 生成 Binary64 表示。

这种方法没有直接依赖机器浮点指令，而是通过普通 Lean Definitions 实现能够被 Kernel 检查的计算。

### 6.3 Lean 4.33 的 Float.Model 更新

需要注意，旧版 Lean Float 的限制已经发生变化。

根据原始材料，Lean 4.33.0 开始引入可检查的 `Float.Model`，项目使用的是 Lean 4.33.1。

主要变化包括：
- Lean Float 不再是完全不透明的类型。
- `Float.Model` 基于 `UInt64`，并对 NaN 进行规范化。
- 部分基本浮点运算已经能够在 Kernel 中计算。
- 部分操作，例如三角函数，仍然是不透明的。

因此，不能再笼统地说 Lean Float 完全没有逻辑模型。

那么为什么项目仍然使用 `PrimFloat.Rep`？

因为项目已经建立了明确保留 Rocq Float 语义的模型。如果希望直接改用 Lean 的新版 Float，还需要建立表示与运算之间的 Correspondence Proof。

例如：

$$
\operatorname{bridge}(\operatorname{RocqAdd}(x,y))
=
\operatorname{LeanAdd}(\operatorname{bridge}(x),\operatorname{bridge}(y))
$$

这里不能仅因为 Lean 已经提供 `Float.Model`，就假设所有 Rocq Primitive Float Operations 都与它语义相同。

原始材料记录项目已经完成 PrimFloat 的 `37/37` 根声明对应证书，但尚未完成与 Lean Runtime Float API 的完整运算对应证明。这两项结果需要区分。

## 7. Primitive 在整体 Translation Pipeline 中如何处理？

前面讨论的是 Primitive Types 和它们的计算模型。实际的 Mechanical Translation 还需要处理 Primitive AST，并生成 Lean Expressions。

整体流程：

```text
Rocq Source Declaration
Primitive Types / Operations / Literals
        │
        ▼
MetaRocq + Native Exporter
Primitive IR Nodes
operator / literal / metadata / universe
        │
        ▼
trans：根据 Primitive Kind 分发
        │
        ├── int63  → BitVec 63
        ├── array  → PrimArray.Rep
        ├── string → PrimString.Rep
        └── float  → PrimFloat.Rep
        │
        ▼
Lean Expressions + Declarations
        │
        ▼
Lean Kernel Checking
        │
        ▼
Independent Audit / Correspondence Proofs
```

### 7.1 Primitive Type、Operation 和 Literal 都需要翻译

Primitive Translation 不只是转换 Primitive Type，还要处理对应的 Operations 和 Literals。

| AST 类别 | 例子 | 翻译动作 |
|---|---|---|
| Primitive Type | `int63_type` | 转换为 `BitVec 63` |
| Primitive Operation | `int63_add` | 转换为 `BitVec.add` |
| Primitive Literal | 具体的 int63 / Float 值 | 转换为模型中的构造表达式 |

例如，`Translate.lean` 中的 `trans` 会处理：

```lean
| .prim "int63_type" _ => ...
| .prim "float64_type" _ => ...
| .prim "array_type" j => ...
| .prim "string_type" j => ...
| .prim "int" j => ...
| .prim "float" j => ...
| .prim "array" j => ...
| .prim "string" j => ...
```

对于 Primitive Array 和 String，翻译器还需要检查 Source Exporter 导出的最大长度 Metadata 是否与目标模型一致。

如果这些约束不一致，则返回 `UNSUPPORTED_FEATURE`，而不是接受可能改变源语义的表示。

### 7.2 N05：Primitive Operation 的返回类型适配

即使 Primitive Operation 的计算语义已经得到保留，返回值也不能随意使用 Lean Native Type。

例如，Rocq 的 Primitive `eqb` 返回源语言中的 `bool`，但 `PrimInt63.eqb` 的计算结果是 Lean `Bool`。

如果源 `bool` 被翻译为独立的 Lean Inductive，那么：

```text
Lean Bool ≠ Rocq.bool
```

虽然两个类型都表示真假值，但它们不是同一个 Lean Type。

因此，翻译器需要使用源 `bool` 的 `true` / `false` Constructors，并通过 `Bool.rec` 将 Lean 的计算结果转换成对应的 Rocq 构造器。

同样的情况也包括：
- `comparison`：转换为源 Comparison Type 的 Constructors。
- `addc`、`mulc`：构造对应的 Carry / Pair 类型。
- Float `classify`：返回源 Float Classification Constructors。

这就是 N05 Structural Result Adaptation 的作用：Primitive 的计算可以使用 Lean Native Operations，但最终的结果必须符合翻译后的 Rocq Type Interface。

### 7.3 N06：不能直接引入 Primitive Axioms

Rocq Primitive 声明在源 Kernel 中具有特殊的内置计算语义。

如果简单翻译成：

```lean
axiom Rocq.int63_add :
  BitVec 63 → BitVec 63 → BitVec 63
```

就只是引入了一个未知函数，并没有保留原来的加法计算规则。

因此，更合适的方式是构造有实际计算定义的 Lean Declaration：

```lean
def Rocq.int63_add :
    BitVec 63 → BitVec 63 → BitVec 63 :=
  BitVec.add
```

这样 Lean Kernel 能够检查运算的定义，也不需要为源 Primitive Operation 额外引入一个无实现的 Axiom。

但必须区分：Lean Kernel 接受这个 Definition，并不自动证明它与 Rocq Primitive 的语义完全相同。跨语言的正确性仍然需要通过源规范、表示关系以及 Correspondence Proofs 建立。

## 8. Primitive Gap 的分类总结

| Gap | 具体问题 | 项目中的解决方案 |
|---|---|---|
| Representation Gap | 两边类型的取值范围、保存的信息不同 | 为 array、string、float 构造专门的 Model |
| Operation Semantics Gap | 越界、溢出、舍入等操作规则不同 | 重新定义与 Rocq 对应的 Operations |
| Kernel Computation Gap | 两边 Kernel 支持的计算与归约不同 | 使用 Lean Kernel 可检查的 Definitions |
| Result Type Gap | Primitive Operation 的 Lean 返回类型与 Rocq 返回类型不一致 | N05：Structural Result Adaptation |
| Trust / Correspondence Gap | Lean Kernel 检查通过不等于跨语言语义一致 | N06 检查与独立 Correspondence Proofs |

Primitive Translation 的基本原则是：
- 当 Rocq Primitive 与 Lean Native Type 的语义一致时，可以直接映射，例如 `int63 → BitVec 63`。
- 当表示或运算语义存在差异时，需要构造显式、可检查的目标计算模型，例如 Array、String 和 Float。
- 当 Primitive Operations 返回的目标类型与翻译后的源类型不一致时，需要进行 Structural Result Adaptation。
- 当 Lean Kernel 接受目标 Definition 后，仍需要独立建立 Rocq 与 Lean 之间的 Semantic Correspondence，而不能仅凭目标类型检查成功就假设翻译完全正确。

因此，Primitive Translation 不只是将 AST 中的 Primitive Nodes 替换成 Lean Expressions，而是需要处理 Representation、Operation Semantics、Kernel Computation 和 Cross-language Correspondence 等问题。

> Unlike ordinary inductive types, Rocq primitives rely on kernel-recognized representations and computation rules that do not necessarily coincide with Lean's native types and operations. Our translator therefore maps primitives directly where the semantics match, and otherwise introduces explicit, kernel-checkable models that preserve Rocq's value domains and computational behavior. Correspondence with Lean's native libraries is established separately through proofs, rather than assumed by the translation.