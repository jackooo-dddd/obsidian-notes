## 怎么证明两个节点"确实对应"
每个节点都从三个层面检查：
1. **类型论层面**：这个节点在类型论里应该遵守什么规则；
2. **Rocq 内核**：Rocq 的内核代码是不是按这条规则检查的；
3. **Lean 内核**：Lean 的内核代码是不是也按这条规则检查的。

如果两边内核都按同一条规则检查，就说明两个节点表示的是同一个东西。

下面用 `Definition lt (n m : nat) := S n <= m.` 作例子。它的类型是 `nat → nat → Prop`，值是 `fun n m => le (S n) m`。三种节点在它里面都出现了。

---
# 一、Prod → forallE
## 1. 类型论层面：Π 类型要遵守什么规则
Π 类型表达的是"**对每一个 x : T，都有一个 B**"。要写出这样一个类型，规则要求三件事：

|第几步|要求|为什么|
|---|---|---|
|①|T 必须是一个类型|"对每个 x : T"，T 得是一类东西，不能是 3 这样的值|
|②|假设已经有了一个 x : T，在这个前提下，B 也必须是一个类型|B 里可能用到 x，所以要在"有 x"的情况下检查|
|③|满足以上两条，整个 Π 就是一个类型，而且要算出它落在哪一层|每个类型都必须属于某一层|

第 ③ 步中"哪一层"的规则：
- **B 是命题时，整个 Π 也是命题**。例如 `forall n : nat, n + 0 = n` 是命题；
- **否则，整个 Π 落在 T 和 B 中较高的那一层**。
## 2. Rocq 内核
**节点定义**（`kernel/constr.mli`）：

```ocaml
| Prod of (Name.t,'r) Context.pbinder_annot * 'types * 'types
(** Concrete syntax ["forall A:B,C"] is represented as [Prod (A,B,C)]. *)
```

意思是：`forall A : B, C` 在内核里存为 `Prod (A, B, C)`，三个字段依次是变量名、变量类型、body。

**检查代码**（`kernel/typeops.ml`，内核检查函数 `execute` 中的 Prod 分支）：

```ocaml
| Prod (name,c1,c2) ->
  let vars = execute_is_type tbl env c1 in                (* ① *)
  let () = check_assum_annot env vars name (self c1) in   (* 附加检查 *)
  let env1 = push_rel (LocalAssum (name,self c1)) env in  (* ② 的前半 *)
  let vars' = execute_is_type tbl env1 c2 in              (* ② 的后半 *)
  type_of_product env name vars vars'                     (* ③ *)
```

逐行解释：

|代码|做什么|对应规则|
|---|---|---|
|`execute_is_type … c1`|算出 T（代码里叫 c1）的类型，并要求它是一个层（`Prop`、`Set`、`Type`）；不是就报错"not a type"。返回值 `vars` 就是 T 所在的层|① T 是类型|
|`check_assum_annot`|检查变量上的 relevance 标记是否和 T 所在的层一致|附加检查，不属于 Π 规则|
|`push_rel … env`|把"x : T"加入已知变量列表，得到新环境 `env1`|② 假设有 x : T|
|`execute_is_type tbl env1 c2`|在新环境里，要求 B（c2）也是类型，返回它所在的层 `vars'`|② B 是类型|
|`type_of_product … vars vars'`|由 T 的层和 B 的层，算出整个 Π 的层|③|

第 ③ 步用到的函数：

```ocaml
let sort_of_product env domsort rangsort =
  if is_impredicative_sort env rangsort then rangsort    (* B 是命题：结果就是命题 *)
  else match domsort with
    | SProp | Prop -> rangsort                           (* T 是命题：结果取 B 的层 *)
    | _ ->
    let u1 = univ_of_sort domsort and u2 = univ_of_sort rangsort in
    Sorts.make (quality rangsort) (Universe.sup u1 u2)   (* 否则：取较高的层 *)
```

`is_impredicative_sort` 对 Prop 和 SProp 返回真，所以第一行就是"B 是命题时，整个 Π 也是命题"。
## 3. Lean 内核
**节点定义**（`src/Lean/Expr.lean`）：

```lean
/-- A dependent arrow `(a : α) → β)` (aka forall-expression) where `β` may depend
on `a`. Note that this constructor is also used to represent non-dependent arrows
where `β` does not depend on `a`. -/
| forallE (binderName : Name) (binderType : Expr) (body : Expr) (binderInfo : BinderInfo)
```

意思是：`(a : α) → β` 存为 `forallE`，字段依次是变量名、变量类型、body，再加一个 binderInfo（显式还是隐式参数）。普通箭头 `α → β` 也用这个节点。

**检查代码**（`src/kernel/type_checker.cpp`）：

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

逐行解释：

|代码|做什么|对应规则|
|---|---|---|
|`ensure_sort_core(infer_type_core(d))`|算出 T 的类型，并要求它是一个层（`Sort u`）；不是就报错|① T 是类型|
|`mk_local_decl(…, d, …)`|把"x : T"加入已知变量列表|② 假设有 x : T|
|`ensure_sort_core(infer_type_core(e))`|在加了 x 的情况下，要求 B 也是类型|② B 是类型|
|`mk_imax(us[i], r)`|由 T 的层 u 和 B 的层 v，算出 `imax u v`|③|

`imax u v` 的定义（Lean 手册）：v 为 0（B 是命题）时结果是 0（命题），否则取 u、v 中较大的。
## 4. 两边对照

|规则|Rocq `execute`（Prod 分支）|Lean `infer_pi`|相同吗|
|---|---|---|---|
|① T 是类型|`execute_is_type c1`|`ensure_sort_core(…d…)`||
|② 加入 x : T|`push_rel`|`mk_local_decl`||
|② B 是类型|`execute_is_type env1 c2`|`ensure_sort_core(…e…)`||
|③ B 是命题 → 结果是命题|`sort_of_product` 第一行|`imax u 0 = 0`||
|③ 否则取较高的层|`Universe.sup u1 u2`|`max u v`||

**两边做的是同样的三步检查。** 唯一的差别是层的命名：Rocq 叫 `Prop / Set / Type(i)`，Lean 叫 `Sort 0 / Sort 1 / Sort (i+1)`，翻译时按这个对应关系换名即可。
## 5. 用 lt 验证
类型 `forall (n : nat) (m : nat), Prop`，两边都按同样的步骤检查：
- 外层：① nat 是类型 → ② 加入 n : nat → 检查里面那一层；
- 内层：① nat 是类型 → ② 加入 m : nat → Prop 是类型；
- ③ 得出它是一个合法的类型。
## 6. 不影响对应的差别

|差别|为什么不影响|
|---|---|
|Rocq 节点多一个 relevance 标记|只用于附加检查（`check_assum_annot`），不改变 Π 规则|
|Lean 节点多一个 binderInfo|Lean 手册："does not affect type checking or definitional equality in the core theory"|

---
# 二、Lambda → lam
## 1. 类型论层面：λ 要遵守什么规则
λ 的作用是**造出一个函数**：`λ x : T, b` 意思是"给我一个 x : T，我就算出 b"。

|第几步|要求|
|---|---|
|①|T 必须是一个类型|
|②|假设已经有 x : T，在这个前提下算出 b 的类型，记作 B|
|③|那么整个 λ 的类型就是 **Π x : T, B**，即"输入 T，输出 B"|

另外还有一条**计算规则 β**：把 λ 用在一个实际参数上时，结果就是把 b 里的 x 换成这个参数，即 `(λ x, b) a` 化简为 `b[x := a]`。
## 2. Rocq 内核
**节点定义**（`kernel/constr.mli`）：

```ocaml
| Lambda of (Name.t,'r) Context.pbinder_annot * 'types * 'constr
(** Concrete syntax ["fun A:B => C"] is represented as [Lambda (A,B,C)]. *)
```

**检查代码**（`kernel/typeops.ml`）：

```ocaml
| Lambda (name,c1,c2) ->
  let s = execute_is_type tbl env c1 in                   (* ① *)
  let () = check_assum_annot env s name (self c1) in      (* 附加检查 *)
  let env1 = push_rel (LocalAssum (name,self c1)) env in  (* ② 的前半 *)
  let c2t = execute tbl env1 c2 in                        (* ② 的后半 *)
  type_of_abstraction env name (self c1) c2t              (* ③ *)
```

第 ③ 步用到的函数只有一行：

```ocaml
let type_of_abstraction _env name var ty =
  mkProd (name, var, ty)
```

|代码|做什么|对应规则|
|---|---|---|
|`execute_is_type … c1`|要求 T 是类型|①|
|`push_rel`|加入 x : T|② 前半|
|`execute tbl env1 c2`|在有 x 的情况下，算出 body b 的类型 `c2t`，也就是 B|② 后半|
|`mkProd (name, var, ty)`|**造出一个 Prod**：变量 x、类型 T、body B|③ λ 的类型是 Π|

## 3. Lean 内核
**节点定义**（`src/Lean/Expr.lean`）：

```lean
/-- A lambda abstraction (aka anonymous functions). It introduces a new binder for
variable `x` in scope for the lambda body. -/
| lam (binderName : Name) (binderType : Expr) (body : Expr) (binderInfo : BinderInfo)
```

**检查代码**（`src/kernel/type_checker.cpp`）：

```cpp
expr type_checker::infer_lambda(expr const & _e, bool infer_only) {
    ...
    while (is_lambda(e)) {
        expr d = instantiate_rev(binding_domain(e), ...);                 // 取出 T
        if (!infer_only) {
            ensure_sort_core(infer_type_core(d, infer_only), d);          // ①
        }
        expr fvar = m_lctx.mk_local_decl(..., binding_name(e), d, ...);   // ② 的前半
        fvars.push_back(fvar);
        e = binding_body(e);
    }
    expr r = infer_type_core(instantiate_rev(e, ...), infer_only);        // ② 的后半
    ...
    return m_lctx.mk_pi(fvars, r);                                        // ③
}
```

|代码|做什么|对应规则|
|---|---|---|
|`ensure_sort_core(…d…)`|要求 T 是类型|①|
|`mk_local_decl`|加入 x : T|② 前半|
|`infer_type_core(…e…)`|算出 body 的类型 r，也就是 B|② 后半|
|`mk_pi(fvars, r)`|**造出一个 forall**：变量 x、类型 T、body B|③ λ 的类型是 Π|

## 4. 两边对照

|规则|Rocq|Lean|相同吗|
|---|---|---|---|
|① T 是类型|`execute_is_type c1`|`ensure_sort_core`||
|② 加入 x : T|`push_rel`|`mk_local_decl`||
|② 算出 b 的类型 B|`execute env1 c2`|`infer_type_core`||
|③ λ 的类型是 Π x : T, B|`mkProd (name, var, ty)`|`mk_pi(fvars, r)`||
|β|手册转换规则 β|手册："the result is found by β-reduction: substituting the argument for the bound variable"||

最关键的是第 ③ 行：**Rocq 用 `mkProd` 造出 λ 的类型，Lean 用 `mk_pi`。** 两边都明确规定"λ 的类型是 Π"。上一节已经说明 Prod 对应 forallE，所以 Lambda 对应 lam 也随之成立。
## 5. 用 lt 验证
值 `fun (n : nat) (m : nat) => le (S n) m`：
- ① nat 是类型 → ② 加入 n : nat；
- ① nat 是类型 → ② 加入 m : nat → 算出 body `le (S n) m` 的类型是 Prop；
- ③ 所以整个值的类型是 `forall n m : nat, Prop`，也就是 `nat → nat → Prop`；
- 和声明的类型一致。

---
# 三、App → app
## 1. 类型论层面：App 要遵守什么规则
App 的作用是**使用一个函数**：`f a` 意思是"把 a 交给 f，拿回结果"。

|第几步|要求|
|---|---|
|①|f 必须是一个函数，它的类型是 Π x : T, B|
|②|a 的类型必须符合 T，也就是 f 要求的输入类型|
|③|那么 `f a` 的类型是 B，并且把 B 里的 x 换成 a|

## 2. Rocq 内核
**节点定义**（`kernel/constr.mli`）：

```ocaml
| App of 'constr * 'constr array
(** Concrete syntax ["(F P1 P2 ...  Pn)"] is represented as [App (F, [|P1; P2; ...; Pn|])].
    The {!mkApp} constructor also enforces the following invariant:
    - [F] itself is not {!App}
    - and [[|P1;..;Pn|]] is not empty. *)
```

意思是：Rocq 把 `F P1 P2 … Pn` 存成**一个**节点，一个函数加一组参数。

**检查代码**（`kernel/typeops.ml`）。`execute` 先算出函数和每个参数的类型，再交给 `type_of_apply`：

```ocaml
let rec apply_rec i typ =
  if Int.equal i len then term_of_fconstr typ               (* 参数用完：返回结果类型 *)
  else
    let typ, stk = whd_stack infos tab typ [] in
    match fterm_of typ with
    | FProd (_, c1, c2, e) ->                                (* ① 当前类型必须是 Prod *)
      let arg = argsv.(i) in
      let argt = argstv.(i) in
      begin match conv_leq env argt c1 with                  (* ② 第 i 个参数的类型要符合 T *)
      | Result.Ok () -> apply_rec (i+1) (… c2 …)             (* ③ 得到 B[x := 参数]，处理下一个 *)
      | Result.Error () -> error_cant_apply_bad_type …       (* 不符合：报错 *)
      end
    | _ -> error_cant_apply_not_functional …                 (* 不是函数：报错 *)
```

|代码|做什么|对应规则|
|---|---|---|
|`match … FProd (_, c1, c2, e)`|当前的函数类型必须是一个 Prod；否则报错"不是函数"|①|
|`conv_leq env argt c1`|参数的类型 `argt` 要符合 T（`c1`）|②|
|`apply_rec (i+1) (… c2 …)`|结果类型是 B（`c2`）里的 x 换成这个参数；然后**处理下一个参数**|③|

关键点：**虽然 Rocq 把多个参数存在一个节点里，检查时却是一个一个地处理**，每处理一个参数，就完整地套用一次 ①②③。
## 3. Lean 内核
**节点定义**（`src/Lean/Expr.lean`）：

```lean
/-- A function application.
...
Note that multiple arguments are represented using partial application.
For example, the two argument application `f x y` is represented as
`Expr.app (.app f x) y`. -/
| app (fn : Expr) (arg : Expr)
```

意思是：Lean 的 app 只装**一个**参数；多个参数就嵌套成多层 app。

**检查代码**（`src/kernel/type_checker.cpp`）：

```cpp
expr type_checker::infer_app(expr const & e, bool infer_only) {
    expr f_type = ensure_pi_core(infer_type_core(app_fn(e), infer_only), e); // ①
    expr a_type = infer_type_core(app_arg(e), infer_only);                  // 参数的类型
    expr d_type = binding_domain(f_type);                                   // 取出 T
    ...
    if (!is_def_eq(a_type, d_type))                                         // ②
        throw app_type_mismatch_exception(...);
    return instantiate(binding_body(f_type), app_arg(e));                   // ③
}
```

|代码|做什么|对应规则|
|---|---|---|
|`ensure_pi_core(…)`|f 的类型必须是 forall；否则报错|①|
|`is_def_eq(a_type, d_type)`|参数类型必须和 T 相等；否则报错|②|
|`instantiate(binding_body(f_type), app_arg(e))`|结果类型是 B 里的 x 换成参数|③|

## 4. 两边对照

|规则|Rocq `type_of_apply`|Lean `infer_app`|相同吗|
|---|---|---|---|
|① f 的类型是 Π|`FProd (_, c1, c2, e)`|`ensure_pi_core`||
|② 参数符合 T|`conv_leq argt c1`|`is_def_eq(a_type, d_type)`| 见下|
|③ 结果是 B[x := a]|`apply_rec (i+1) (… c2 …)`|`instantiate(binding_body(…), …)`||
|多个参数|一个节点存一组参数，**检查时逐个处理**|嵌套多层 app，**每层一个参数**| 处理方式相同|

**关于多个参数：** Rocq 的 `apply_rec` 每次只处理一个参数，用的正是 ①②③。这和 Lean 逐层检查嵌套的 app 完全一样。所以 `App (f, [a₁, a₂])` 翻成 `app (app f a₁) a₂` 不改变含义，只是换了存储方式。

**关于 那一行**，看两个函数名：
- Rocq 用 `conv_leq`，leq 是"小于等于"：参数类型可以**小一层**，比如要求 Type 时给一个命题也行；
- Lean 用 `is_def_eq`，eq 是"等于"：参数类型必须**相等**。

这是 Rocq 的累积性带来的唯一实质差别。规则的形状还是一样的，只是 Rocq 在第 ② 步更宽松。所以：
- **参数类型正好相等时**（绝大多数情况）：App 直接对应 app；
- **Rocq 用到"小一层也行"时**（少数情况）：节点仍然对应 app，但翻译器要在参数外加一层 `PULift`，把它显式提升到要求的那一层。
## 5. 用 lt 验证
body `le (S n) m`。在 Rocq 里它是 `App(le, [App(S, [n]), m])`，在 Lean 里是 `app (app le (app S n)) m`。两边的检查过程：

|步骤|① 函数类型是 Π 吗|② 参数符合要求吗|③ 结果|
|---|---|---|---|
|`S n`|S : nat → nat |要求 nat，n 是 nat |nat|
|`le (S n)`|le : nat → nat → Prop |要求 nat，`S n` 是 nat |nat → Prop|
|`… m`|nat → Prop |要求 nat，m 是 nat |Prop|

每个参数的类型都**正好等于**要求的类型，没有用到"小一层"，所以 `conv_leq` 和 `is_def_eq` 给出相同的结果，不需要 `PULift`。

---
# 总结

|对应|类型论规则|Rocq 内核|Lean 内核|结论|
|---|---|---|---|---|
|**Prod → forallE**|T 是类型；有 x : T 时 B 是类型；结果是类型（B 是命题则为命题，否则取较高层）|`execute` 的 Prod 分支 + `sort_of_product`|`infer_pi` + `imax`|三步检查相同；层的名字按 `Prop↦Sort 0`、`Type(i)↦Sort(i+1)` 换算|
|**Lambda → lam**|T 是类型；有 x : T 时算出 b 的类型 B；λ 的类型是 Π x : T, B|`execute` 的 Lambda 分支，结果用 `mkProd` 造出|`infer_lambda`，结果用 `mk_pi` 造出|三步检查相同，且两边都规定"λ 的类型是 Π"|
|**App → app**|f 的类型是 Π x : T, B；a 符合 T；结果是 B[x := a]|`type_of_apply`，**逐个参数**检查|`infer_app`，每层一个参数|三步检查相同；第 ② 步 Rocq 允许小一层（`conv_leq`），Lean 要求相等（`is_def_eq`），用到时需要 `PULift`|

**结论：** 对这三种节点，Rocq 内核和 Lean 内核做的是同样的检查，而且和类型论对 Π、λ、App 的规定一致。因此三组对应都有依据。需要额外处理的只有两处：
- 层的命名不同，翻译 sort 时换名；
- Rocq 在 App 处允许参数类型小一层，翻译时用 `PULift` 显式补上。

说明：Rocq 的代码取自官方仓库当前的 master 分支，项目固定的是 Rocq 9.3.0；Lean 的代码取自 v4.33.1，和项目一致。

Sources:
- [Rocq `kernel/constr.mli`](https://github.com/rocq-prover/rocq/blob/master/kernel/constr.mli)
- [Rocq `kernel/typeops.ml`](https://github.com/rocq-prover/rocq/blob/master/kernel/typeops.ml)
- [Rocq `kernel/environ.ml`](https://github.com/rocq-prover/rocq/blob/master/kernel/environ.ml)
- [Rocq Reference Manual source `cic.rst`](https://github.com/rocq-prover/rocq/blob/master/doc/sphinx/language/cic.rst)
- [Lean `src/Lean/Expr.lean` (v4.33.1)](https://github.com/leanprover/lean4/blob/v4.33.1/src/Lean/Expr.lean)
- [Lean `src/kernel/type_checker.cpp` (v4.33.1)](https://github.com/leanprover/lean4/blob/v4.33.1/src/kernel/type_checker.cpp)
- [Lean reference manual source](https://github.com/leanprover/reference-manual)