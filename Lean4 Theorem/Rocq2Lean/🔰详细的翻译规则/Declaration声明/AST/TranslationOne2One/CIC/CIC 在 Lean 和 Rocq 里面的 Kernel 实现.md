
# kernel 本质上是"把各自那一版 CIC 的规则写成代码"。
Rocq 的 `Prod` 和 Lean 的 `forallE`（Lean 里的名字是 `forallE`，不是 `forall`）都是 `Πx:A. B` 的实现。下面分三点细说。
## 1. 语法变成数据结构
理论里的项语法，在 kernel 里就是一个数据类型，每种项对应一个构造子。下面是简化后的两边定义：

**Rocq kernel**（OCaml，`kernel/constr.ml`）：

```ocaml
type constr =
  | Rel       of int                         (* 变量 x，用 de Bruijn 编号 *)
  | Sort      of Sorts.t                     (* s *)
  | Prod      of binder_annot * types * types   (* Πx:A. B *)
  | Lambda    of binder_annot * types * constr  (* λx:A. t *)
  | App       of constr * constr array          (* t u *)
  | LetIn     of ...
  | Const | Ind | Construct | Case | Fix | CoFix | Proj   (* CIC 的扩展部分 *)
  | Int | Float | String | Array                           (* 原语，工程上的扩展 *)
  | Evar | Meta | Cast | Var ...
```

**Lean kernel**（`Lean.Expr`，C++ kernel 里有对应的实现）：

```lean
inductive Expr where
  | bvar    (deBruijnIndex : Nat)                                      -- 变量 x
  | sort    (u : Level)                                                -- s
  | forallE (binderName : Name) (binderType : Expr) (body : Expr) (bi : BinderInfo)  -- Πx:A. B
  | lam     (binderName : Name) (binderType : Expr) (body : Expr) (bi : BinderInfo)  -- λx:A. t
  | app     (fn : Expr) (arg : Expr)                                   -- t u
  | letE | const | proj | lit
  | fvar | mvar | mdata                                                -- 给 elaborator 用的
```

两边的 Π 节点字段一样，都是"参数名、参数类型 A、body B"。参数名只用于打印。Lean 多出的 `BinderInfo` 记录参数是显式、隐式还是实例参数，那是给 elaborator 用的，**kernel 不看它**。
## 2. 规则变成检查函数
理论里的每条类型规则，在 kernel 里大致对应一段检查代码：

| 理论 | kernel 里做的事 | Rocq（`kernel/typeops.ml` 等） | Lean（C++ `type_checker`） |
|---|---|---|---|
| Π 的形成规则 | 检查 A 是 Sort；把 x:A 加进上下文；检查 B 是 Sort；按 universe 规则算出整个 Π 的 Sort | `Prod` 分支，`sort_of_product` | `infer_pi` |
| λ 的引入规则 | 检查 A 是类型；把 x:A 加进上下文；算出 t 的类型 B；返回 `Πx:A. B` | `Lambda` 分支 | `infer_lambda` |
| 应用的消去规则 | 把 f 的类型算到出现 Π 为止；检查参数类型对得上；返回 `B[x:=a]` | `App` 分支 | `infer_app` |
| β 归约与转换规则 | 把两个项算到底再比较 | `kernel/conversion.ml` | `is_def_eq`、`whnf` |

另外还有几块代码负责理论里的其他规则：
- 检查归纳类型合法（正性检查）；
- Rocq 的 guard checker（检查 Fix 是结构递归）；
- universe 约束求解；
- 把检查通过的声明加进全局环境（Rocq 是 `safe_typing.ml`）。

