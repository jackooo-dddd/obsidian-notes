我看的是 RTS 仓库固定使用的 `rocq-lean-import`，commit `546979b`，来自 `rocq-community/rocq-lean-import`。我把它 clone 到了 `~/CityuHK/Research/Lean/.rts-inspect/rocq-lean-import`。

它的方向和我们相反：把 Lean 的 Kernel 项（`Expr`）翻成 Rocq 的 Kernel 项（`constr`）。Lean 的项一共有这几种节点，定义在 `src/leanExpr.mli`：

```ocaml
type expr =
  | Bound of int | Sort of U.t | Const of LeanName.t * U.t list
  | App of expr * expr | Let of {...} | Lam of ... | Pi of ...
  | Proj of LeanName.t * int * expr | Nat of Z.t | String of string
```

逐个节点的转换在 `src/lean.ml` 的 `to_constr` 函数里（第 1088 行左右）。
### 对照我们那张表

|我们的表（Rocq → Lean）|rocq-lean-import 有没有（Lean → Rocq）|它怎么做|
|---|---|---|
|**Rel n → bvar n**|有：`Bound i`|`mkRel (i + 1)`。Rocq Kernel 的 `Rel` 从 1 开始数，Lean 的 `bvar` 从 0 开始，所以加 1。（我们的 IR 用的是 MetaRocq 的 `rel`，也从 0 开始，所以不用换。）|
|**Sort → sort**|有：`Sort univ`|经过 `to_univ_level'` 把 Lean 的 Level 换成 Rocq 的 sort，就是之前看过的 `imax` 和 Prop→SProp 那段代码|
|**Prod → forallE**|有：`Pi`|`mkProd`|
|**Lambda → lam**|有：`Lam`|`mkLambda`|
|**LetIn → letE**|有：`Let`|`mkLetIn`|
|**App → app**|有：`App`|方向正好相反：Lean 的 `App` 一次只带一个参数，它逐个转成 `mkApp (a, [|
|**Const / Ind / Construct → const**|有，但只有一种：`Const (name, levels)`|Lean 里类型、构造器、recursor、定义都是 `Const`。它要用 `instantiate` 去查：这个名字在 Rocq 里对应的是归纳类型、构造器、recursor 还是普通常量，然后再填 Universe 实参。我们是把 Rocq 的三种合并成 Lean 的一种，它是把一种拆回三种|
|**Case → 没有**|没有|Lean 里本来就没有 `match`，所以它不会产生 Rocq 的 `match` 节点|
|**Fix → 没有**|没有|Lean 里也没有 `fix`。递归在 Lean 里都是对 recursor（`I.rec`）的调用|
|**Cast → 没有**|没有|Lean 里没有 cast 节点|

### 两个方向在 recursor 上正好镜像
- **我们**：Rocq 的 `match` / `fix` → 改写成 Lean 的 `I.rec`。
- **它**：Lean 的 `I.rec`（只是一个 `Const`）→ 指向 Rocq 里专门生成的消去常量。具体是在导入一个归纳类型时，用 Rocq 的 scheme 生成器生成 `I_recl`（消去到 Type）和 `I_indl`（消去到 SProp），再把 `I.rec` 登记成指向它们（第 1620 行左右）。这些 scheme 的 Body 里才有 Rocq 的 `fix` 和 `match`。

所以它完全不用处理“把 `match` / `fix` 降级”这件事：从 Lean 到 Rocq，recursor 是更受限的形式，Rocq 天然能表达。这也是 Lean → Rocq 比 Rocq → Lean 容易的一个原因。
### 它有、我们的表里没有的节点

|它的节点|怎么处理|我们这边对应的|
|---|---|---|
|`Proj`|重新推一遍类型，找到对应的 Rocq 归纳类型：primitive record 用 Rocq 的 `Proj`；普通 record 展开成一个 `match`；如果类型根本不是归纳类型（比如 `ULift`），投影就当作恒等|我们的 `proj`，只用于参数个数一致的 primitive record|
|`Nat` 字面量|用 `Nat` 的“乘二”构造出 Rocq 的数|没有：Rocq 的 `nat` 字面量在 Kernel 里就是 `S (S …)`|
|`String` 字面量|拼成 `String.mk` 加字符列表|我们的 `prim`（int63、float、string 等），方向相反|

### 还有一点相同
它把 Lean binder 上的隐式信息丢掉了：`Lam (_bk, …)`、`Pi (_bk, …)` 里的 `_bk` 被忽略。我们也一样，Rocq 的隐式参数信息不进入 IR。两个方向都只翻译 Kernel 能看到的东西。

**一句话：**表里能“直接对应”的那 7 种（Rel、Sort、Prod、Lambda、LetIn、App、Const），它都有，而且是一对一的反向转换。我们标成“不能”的 Case、Fix、Cast，它都没有，因为 Lean 里本来就没有这些节点。递归在它那边以 recursor 常量的形式出现，被映射到 Rocq 生成的消去 scheme 上。