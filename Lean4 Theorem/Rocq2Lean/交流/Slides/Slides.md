要加什么
- 为什么要有 Prod 和 Lam？声明里没有"参数"这一栏
- 引入变量只是这些节点的共同点。kernel 之所以把它们分成不同的节点，是因为每个节点各自带着一套不同的规则，而 kernel 要靠这些规则完成两件工作：
	- 类型检查：这个项的类型是什么？
	- 计算：这个项能不能化简？化简成什么？kernel 判断两个类型是否相等时，要先把它们算到底再比较。
## 1. 其他证明助手翻译的论文，怎么说明翻译是正确的
大致有三种做法：

1. 目标端合法：翻译得到的类型、定义和命题，符合目标语言的规则；如果还生成了证明，这个证明必须确实证明了目标命题，并通过目标 Kernel 的检查。
2. 逐规则保持对应：先确定最基本的东西表达相同的意思，再证明每一种组合方式不会改变原来的意思，最后就能保证由这些规则构成的整个表达式，在翻译后仍然保持原来的含义。
3. 放进同一个逻辑框架比较：把 HOL、Coq、Lean 中的类型、命题、证明等翻译到 Dedukti，使它们可以在同一个逻辑框架中表示，再说明两边翻译后的对象怎样对应。例如，HOL 中的自然数和 Coq 中的自然数是否表示同样的数学对象。

> [!warning] 第 3 种做法的问题：机制不同或缺失
> - Rocq 的 Universe Cumulativity 不能直接变成 Dedukti 的普通类型规则；
> - Lean 的某些 Definitional Equality 也无法直接搬过去。
>
> Dedukti 提供了一个共同的比较环境，但它本身不保证 Rocq → Dedukti 的翻译完全无损。

---
## 2. 我们的翻译器：怎么定义「翻译正确」
翻译后可以保证这五条：

1. 目标端直接合法：翻译过去的东西，不需要任何额外转化，在 Lean 里就是合法的。
2. 计算保持：Rocq 里成立的计算，翻译后在 Lean 里也成立。比如 Rocq 里 `2 + 3 = 5` 成立，在 Lean 里也成立。
3. 可证性保持：Rocq 能证明 T，Lean 就能证明 ⟦T⟧。
4. 依赖已就绪：对每个翻译的声明，它引用的声明、依赖的常量的类型，都已经翻译好了。
5. 结构对应：翻译器生成的 Lean 声明，编译（构建模块，并经 Kernel 检查）以后，环境里的 `Expr` 等于 Rocq 导出的 AST 经过节点翻译后得到的结果。
翻译器正确性需要依赖的地方：1）Rocq 内核是原意的来源 2）metarocq 从 rocq声明导出到rocq AST，这个导出是无损的（这里的无损怎么定义） 3）Lean kernel 把 Lean declaration compile 成 Lean expr，expr表达的意思就是声明的意思 4）**依赖翻译规则。** 翻译器按一套固定的规则，把 Rocq AST 逐个节点转换为 Lean Expr。这套规则的正确性依赖于：每一条节点对应都有依据。这里的依据可以是通过节点在类型论里表示一样的类型，也可以是这个节点指代了同一个常量/已经翻译好的声明。之后，我们可以从「每个节点对应」推出「整棵树对应」。
### 依赖链
Rocq 源文件 ──① Rocq 内核──► Rocq 内核里的项 ──② MetaRocq + 导出器──► IR
     ──③ 翻译器（按规则）──► Lean Expr ──④ Lean 内核──► 被接受的 Lean 声明

---
## 3. 列出 AST：叶子和组合节点
**例子：`lt`**

Rocq 源码，`Corelib/Init/Peano.v:181`：
```coq
Definition lt (n m:nat) := S n <= m.
```
`<=` 是 `le` 的记号（`Peano.v:169-174`），所以它的意思是 `lt n m := le (S n) m`，也就是「n < m 定义为 n+1 ≤ m」。
**声明类型的 AST**
```text
prod(n, ind nat, prod(m, ind nat, sort prop))
```
这表示一个函数的类型：

- 最外层的 `prod`：接受一个类型为 `nat` 的参数 n，返回的结果是内层 `prod` 所描述的东西；
- 内层的 `prod`：又是一个函数类型，接受一个类型为 `nat` 的参数 m，返回一个命题（类型为 `Prop`）。

合起来就是 `nat → nat → Prop`，即「输入两个自然数，得到一个命题」。
```text
类型：forall (n : nat) (m : nat), Prop      也就是 nat → nat → Prop
值：  fun (n : nat) (m : nat) => le (S n) m
```

- **类型**说明 lt 是什么样的东西：输入两个 nat，输出一个命题。
- **值**说明 lt 具体是什么：拿到 n 和 m，返回命题 `le (S n) m`

**源树和目标树**
Type 树
```text
源树 S                                   目标树 T

prod n                 ── 节点 T02 ──►   forall n
├─ ind nat             ── 叶子 T03 ──►   ├─ const Rocq.…nat
└─ prod m              ── 节点 T02 ──►   └─ forall m
   ├─ ind nat          ── 叶子 T03 ──►      ├─ const Rocq.…nat
   └─ sort prop        ── 叶子 U02 ──►      └─ sort 0
```



body 树

```
源树 S                                   目标树 T

lam n                  ── 节点 T02 ──►   lam n
├─ ind nat             ── 叶子 T03 ──►   ├─ const Rocq.…nat
└─ lam m               ── 节点 T02 ──►   └─ lam m
   ├─ ind nat          ── 叶子 T03 ──►      ├─ const Rocq.…nat
   └─ app              ── 节点 T02 ──►      └─ app
      ├─ ind le        ── 叶子 T03 ──►         ├─ const Rocq.…Peano.le
      ├─ app           ── 节点 T02 ──►         ├─ app
      │  ├─ construct nat 1 (S) ─ T03 ►        │  ├─ const Rocq.…nat.S
      │  └─ rel 1 (n)  ── 叶子 T01 ──►         │  └─ bvar 1 (n)
      └─ rel 0 (m)     ── 叶子 T01 ──►         └─ bvar 0 (m)
```


节点对应分两类：

- 组合节点：照搬的节点，即 Π（`Prod`）、λ （lam）、app。组合节点可以继续往下展开。
- 叶子：变量按编号对应；sort 按映射 I 对应；常量按注册表，对应到被引用的声明。

---
## 4. Rocq 和 Lean 的组合节点为什么能对应：以 Prod → forallE 为例
### 理论基础：两边都必须有 Π
Lean 和 Rocq 都基于类型论。类型论要求语言能表达一些特殊的东西，比如 Π 类型，表示「对每一个 x，都有……」。没有 Π，就既写不出函数的类型，也写不出「对所有 n」这样的定理。所以任何基于类型论、又想写程序和证明的语言，都必须有 Π 类型。

Rocq 和 Lean 都有它，并且各自在 AST 里设了一个节点来表示：

| | Rocq | Lean |
|---|---|---|
| 节点名 | `Prod` | `forallE` |
| 装的东西 | 变量名 x、类型 T、body B | 变量名 x、类型 T、body B |
| 规则 | T 是类型，B 是类型，那么 Π 也是类型 | 一样 |
| 用法 | 用 λ 造函数，用 App 调用 | 一样 |

名字不同，但表示的是同一个概念，遵守的是同一套规则。下面要拿出依据，说明它们确实是同一个东西。
### 怎么证明两个节点「确实对应」
每个节点都从三个层面检查：

1. 类型论层面：这个节点在类型论里应该遵守什么规则；
2. Rocq 内核：Rocq 的内核代码是不是按这条规则检查的；
3. Lean 内核：Lean 的内核代码是不是也按这条规则检查的。

如果两边内核都按同一条规则检查，就说明两个节点表示的是同一个东西。

继续用 `lt` 作例子：它的类型是 `nat → nat → Prop`，值是 `fun n m => le (S n) m`，三种组合节点都在里面出现了。代码出处：

- Rocq：`kernel/constr.mli`（节点定义）、`kernel/typeops.ml`（类型检查）；
- Lean：`src/Lean/Expr.lean`（节点定义）、`src/kernel/type_checker.cpp`（类型检查）。
### 4.1 类型论层面：Π 类型要遵守什么规则
Π 类型表达的是「对每一个 x : T，都有一个 B」。要写出这样一个类型，规则要求三件事：

| 步骤 | 要求 | 为什么 |
|---|---|---|
| ① | T 必须是一个类型 | 「对每个 x : T」，T 得是一类东西，不能是 3 这样的值 |
| ② | 假设已经有了 x : T，在这个前提下，B 也必须是一个类型 | B 里可能用到 x，所以要在「有 x」的情况下检查 |
| ③ | 满足以上两条，整个 Π 就是一个类型，并且要算出它落在哪一层 | 每个类型都必须属于某一层 |

第 ③ 步中「哪一层」的规则：

- B 是命题时，整个 Π 也是命题。例如 `forall n : nat, n + 0 = n` 是命题；
- 否则，整个 Π 落在 T 和 B 中较高的那一层。
### 4.2 Rocq 内核
**节点定义**（`kernel/constr.mli`）
```ocaml
| Prod of (Name.t,'r) Context.pbinder_annot * 'types * 'types
(** Concrete syntax ["forall A:B,C"] is represented as [Prod (A,B,C)]. *)
```
`forall A : B, C` 在内核里存为 `Prod (A, B, C)`，三个字段依次是变量名、变量类型、body。

**检查代码**（`kernel/typeops.ml`，内核检查函数 `execute` 中的 Prod 分支）
```ocaml
| Prod (name,c1,c2) ->
  let vars = execute_is_type tbl env c1 in                (* ① *)
  let () = check_assum_annot env vars name (self c1) in   (* 附加检查 *)
  let env1 = push_rel (LocalAssum (name,self c1)) env in  (* ② 的前半 *)
  let vars' = execute_is_type tbl env1 c2 in              (* ② 的后半 *)
  type_of_product env name vars vars'                     (* ③ *)
```

| 代码                             | 做什么                                                                                   | 对应规则          |
| ------------------------------ | ------------------------------------------------------------------------------------- | ------------- |
| `execute_is_type … c1`         | 算出 T（代码里叫 c1）的类型，并要求它是一个层（`Prop`、`Set`、`Type`）；不是就报错「not a type」。返回值 `vars` 就是 T 所在的层 | ① T 是类型       |
| `check_assum_annot`            | 检查变量上的 relevance 标记是否和 T 所在的层一致                                                       | 附加检查，不属于 Π 规则 |
| `push_rel … env`               | 把「x : T」加入已知变量列表，得到新环境 `env1`                                                         | ② 假设有 x : T   |
| `execute_is_type tbl env1 c2`  | 在新环境里，要求 B（c2）也是类型，返回它所在的层 `vars'`                                                    | ② B 是类型       |
| `type_of_product … vars vars'` | 由 T 的层和 B 的层，算出整个 Π 的层                                                                | ③             |
### 4.3 Lean 内核
**节点定义**（`src/Lean/Expr.lean`）
```lean4
/-- A dependent arrow `(a : α) → β)` (aka forall-expression) where `β` may depend
on `a`. Note that this constructor is also used to represent non-dependent arrows
where `β` does not depend on `a`. -/
| forallE (binderName : Name) (binderType : Expr) (body : Expr) (binderInfo : BinderInfo)
```
`(a : α) → β` 存为 `forallE`，字段依次是变量名、变量类型、body，再加一个 binderInfo（显式还是隐式参数）。普通箭头 `α → β` 也用这个节点。

**检查代码**（`src/kernel/type_checker.cpp`）
```cpp
expr type_checker::infer_pi(expr const & _e, bool infer_only) {
    ...
    while (is_pi(e)) {                                                  // 连续的 forall 一层层处理
        expr d  = instantiate_rev(binding_domain(e), ...);             // 取出 T
        expr t1 = ensure_sort_core(infer_type_core(d, infer_only), d); // ①
        us.push_back(sort_level(t1));                                  // 记下 T 的层
        expr fvar = m_lctx.mk_local_decl(..., binding_name(e), d, ...);// ② 的前半
        fvars.push_back(fvar);
        e = binding_body(e);
    }
    e = instantiate_rev(e, fvars.size(), fvars.data());
    expr s  = ensure_sort_core(infer_type_core(e, infer_only), e);     // ② 的后半
    level r = sort_level(s);                                           // B 的层
    ...
        r = mk_imax(us[i], r);                                         // ③
    return mk_sort(r);
}
```

| 代码                                     | 做什么                               | 对应规则        |
| -------------------------------------- | --------------------------------- | ----------- |
| `ensure_sort_core(infer_type_core(d))` | 算出 T 的类型，并要求它是一个层（`Sort u`）；不是就报错 | ① T 是类型     |
| `mk_local_decl(…, d, …)`               | 把「x : T」加入已知变量列表                  | ② 假设有 x : T |
| `ensure_sort_core(infer_type_core(e))` | 在加了 x 的情况下，要求 B 也是类型              | ② B 是类型     |
| `mk_imax(us[i], r)`                    | 由 T 的层 u 和 B 的层 v，算出 `imax u v`   | ③           |

`imax u v` 的定义（Lean 手册）：v 为 0（B 是命题）时结果是 0（命题），否则取 u、v 中较大的。
### 4.4 两边对照

| 规则 | Rocq `execute`（Prod 分支） | Lean `infer_pi` | 相同吗 |
|---|---|---|---|
| ① T 是类型 | `execute_is_type c1` | `ensure_sort_core(…d…)` | 相同 |
| ② 加入 x : T | `push_rel` | `mk_local_decl` | 相同 |
| ② B 是类型 | `execute_is_type env1 c2` | `ensure_sort_core(…e…)` | 相同 |
| ③ B 是命题 → 结果是命题 | `sort_of_product` 第一行 | `imax u 0 = 0` | 相同 |
| ③ 否则取较高的层 | `Universe.sup u1 u2` | `max u v` | 相同 |

> [!summary] 两边做的是同样的三步检查
> 唯一的差别是层的命名：Rocq 叫 `Prop / Set / Type(i)`，Lean 叫 `Sort 0 / Sort 1 / Sort (i+1)`，翻译时按这个对应关系换名即可。
### 4.5 用 `lt` 验证
类型 `forall (n : nat) (m : nat), Prop`，两边都按同样的步骤检查：

- 外层：① `nat` 是类型 → ② 加入 `n : nat` → 检查里面那一层；
- 内层：① `nat` 是类型 → ② 加入 `m : nat` → `Prop` 是类型；
- ③ 得出它是一个合法的类型。

---
## 5. 翻译的对应性论证
先证明每种节点在两边是同一个东西；再通过两层归纳，从「每个节点对应」推出「整棵树对应」。所以 Lean 表达式和 Rocq AST 是同一棵树：形状相同、位置一一对应，只是每个节点和叶子换成了它在 Lean 里的对应物。

论证分三层：

| 层         | 回答的问题                 | 依据                            |
| --------- | --------------------- | ----------------------------- |
| ① 节点对应    | 每种节点在两边是不是同一个东西       | 类型论规则 + 两边内核代码（第 4 部分）        |
| ② 整棵树对应   | 为什么「每个节点对应」能推出「整棵树对应」 | 两层归纳                          |


下面用 `lt` 的类型树（`nat → nat → Prop`）把这几层串起来。
### ① 每种节点都有固定的对应物
节点只有两类。

**组合节点（有子节点）：** 前面已经证明它们是同一个类型论概念。

| Rocq   | Lean      | 依据         |
| ------ | --------- | ---------- |
| `prod` | `forallE` | 都是 Π 的形成规则 |
| `lam`  | `lam`     | 都是 Π 的引入规则 |
| `app`  | `app`     | 都是 Π 的消去规则 |

**叶子（没有子节点）：** 分三种，每种都有固定的换法。

| 叶子 | 怎么换 | 为什么对 |
|---|---|---|
| 变量 `rel i` | `bvar i` | 两边编号方式相同 |
| sort | `Prop ↦ Sort 0`，`Type(i) ↦ Sort (i+1)` | 固定的换算表 |
| 引用 `ind nat`、`const le` 等 | 换成之前翻译好的 Lean 名字 | 外层归纳：被引用的声明更早翻译，已经对应好了 |
### ② 两层归纳：从「每个节点对应」推出「整棵树对应」
**外层：按声明顺序**

导出器保证依赖在前：
```text
nat  →  le  →  lt
```
翻 `lt` 时，`nat` 和 `le` 已经翻好并通过检查，所以 `lt` 里出现的叶子 `ind nat`、`ind le` 都有了确定的对应物。

**内层：在 `lt` 内部，从树根往下检查**

用第 3 部分的那棵树。每到一个位置，只会遇到两种情况：

- 是组合节点：换成对应的 Lean 节点，然后对它的每个子节点重复同样的检查；
- 是叶子：按上面的表换掉，这条分支到此结束。

因为每次往下走，子树都比原来小，所以一定会走到叶子为止。

> [!summary] 结论
> 目标树 T 和源树 S 形状相同、每个位置一一对应：组合节点换成同一个概念的 Lean 节点，叶子换成它在 Lean 里的对应物。
