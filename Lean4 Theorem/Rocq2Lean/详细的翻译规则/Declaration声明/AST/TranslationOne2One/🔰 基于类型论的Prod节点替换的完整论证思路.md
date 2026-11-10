> 1. **类型论**：要表示函数，就需要函数类型的构造器 Π 和函数的构造器 λ，并配有形成规则和引入规则。一个构造器的身份，由它的形状、规则以及和其他构造器的关系决定。
> 2. **两边都有**：Rocq 和 Lean 都实现了这套类型论。源码注释表明，Rocq 的 `Prod`/`Lambda` 和 Lean 的 `forallE`/`lam` 就是 Π 和 λ，形状都是"参数名、参数类型、body"。
> 3. **规则相同**：两边 kernel 检查这两个节点的代码，逐步对应类型论的形成规则和引入规则：`Prod` 分支与 `infer_pi` 相同，`Lambda` 分支与 `infer_lambda` 相同，并且两边都规定"λ 的类型是 Π"。
> 4. **所以可以互换**：既然每一步规则都相同，"先在 Rocq 里检查再翻译"和"先翻译再在 Lean 里检查"得到同样的结论。因此把 `Prod` 换成 `forallE`、把 `Lambda` 换成 `lam`，可以保持项的合法性和类型。

---
## 第一步：类型论要表示函数，就需要两种构造器
> 出处：`CIC/CIC（Calculus of Inductive Constructions）.md`、` 形成，引入，消去，计算 四条规则.md`

类型论里有"函数"这个概念，所以必须能写出两样东西：

| 要表达什么 | 类型论的构造器 | 造出来的是什么 |
|---|---|---|
| 函数类型："给我一个 A 里的 x，还你一个 B" | `Πx:A. B` | 一个**类型** |
| 函数本身："拿到 x 后，返回 t" | `λx:A. t` | 一个**值** |

光有构造器还不够，因为构造器只负责"拼"，拼出来的东西不一定合法（例如 `Πx:O. nat`）。所以类型论给每个构造器配了一条规则，说明**什么时候拼出来的项是合法的，以及它的类型是什么**：

```
Γ ⊢ A : s₁     Γ, x:A ⊢ B : s₂
──────────────────────────────── (Π 形成)
Γ ⊢ Πx:A. B : s₃

Γ, x:A ⊢ t : B
──────────────────────────────── (λ 引入)
Γ ⊢ λx:A. t : Πx:A. B
```

这样，一个构造器在类型论里的"身份"，就由三样东西决定：
1. **形状**：它带哪些输入（参数名、参数类型、body）；
2. **规则**：它的项什么时候合法、类型是什么；
3. **和其他构造器的关系**：λ 的类型是 Π；App 用掉一层 Π；λ 碰到 App 时做 β 归约。

**后面判断"Rocq 和 Lean 里哪个节点是 Π"，就看这三样是不是都对得上。**

---
## 第二步：Rocq 和 Lean 都基于这套类型论，所以都有对应的节点
> 出处：`CIC/CIC 在 Lean 和 Rocq 里面的 Kernel 实现.md`、` 类型论 + Lean 和 Coq 内核 说明 Prod' Lambda' App 对应.md`

两个系统都实现 CIC 的一个变体，所以按设计，它们的 kernel 里必然各有一个节点来承担 Π、一个节点来承担 λ。我们在源码里也确实找到了，而且源码注释直接说明了它们的身份。

**Π：**

```ocaml
(* Rocq：kernel/constr.mli *)
| Prod of (Name.t,'r) Context.pbinder_annot * 'types * 'types
(** Concrete syntax ["forall A:B,C"] is represented as [Prod (A,B,C)]. *)
```

```lean
-- Lean：src/Lean/Expr.lean
/-- A dependent arrow `(a : α) → β)` (aka forall-expression) where `β` may depend
on `a`. ... also used to represent non-dependent arrows ... -/
| forallE (binderName : Name) (binderType : Expr) (body : Expr) (binderInfo : BinderInfo)
```

**λ：**

```ocaml
(* Rocq *)
| Lambda of (Name.t,'r) Context.pbinder_annot * 'types * 'constr
(** Concrete syntax ["fun A:B => C"] is represented as [Lambda (A,B,C)]. *)
```

```lean
-- Lean
/-- A lambda abstraction (aka anonymous functions). ... -/
| lam (binderName : Name) (binderType : Expr) (body : Expr) (binderInfo : BinderInfo)
```

**对照第一步的"身份"第 1 条（形状）**：

| | 类型论 | Rocq | Lean |
|---|---|---|---|
| 函数类型 | `Πx:A. B` | `Prod(x, A, B)` | `forallE x A B` |
| 函数 | `λx:A. t` | `Lambda(x, A, t)` | `lam x A t` |

三边都是"参数名、参数类型、body"三个字段。各自多出的字段（Rocq 的相关性标注，Lean 的 `BinderInfo`）不影响类型检查，第四步会说明。

---
## 第三步：这两个节点都遵守类型论的规则，而且规则写在 kernel 代码里
> 出处：` 类型论 + Lean 和 Coq 内核 …md`（第一、二节）、` _看到形成，引入等节点套规则_在代码里是怎么做的.md`、`CIC/CIC～Rocq～Lean 项的构造.md`

形状一样还不够，还要看**规则**是否一样。kernel 检查一个项时，看到哪种节点就套用哪条规则，所以只要把检查代码和类型论规则逐步对照即可。
### Π 形成规则

| 规则的步骤 | Rocq（`typeops.ml` 的 `Prod` 分支） | Lean（`infer_pi`） |
|---|---|---|
| ① A 是类型 | `execute_is_type … c1` | `ensure_sort_core(infer_type_core(d))` |
| ② 把 x:A 加进上下文 | `push_rel` | `mk_local_decl` |
| ② B 是类型 | `execute_is_type env1 c2` | `ensure_sort_core(…e…)` |
| ③ 算出整个 Π 的 Sort | `sort_of_product` | `imax` |

第 ③ 步两边的公式也对得上：

| 情形 | Rocq `sort_of_product` | Lean `imax` |
|---|---|---|
| B 是命题 | 结果是 Prop | `imax(u, 0) = 0`，即 Prop |
| 否则 | 取较高的一层（`Universe.sup`） | 取较大的 `max(u, v)` |

只有 Sort 的**名字**不一样：Rocq 的 `Prop / Set / Type` 对应 Lean 的 `Sort 0 / Sort 1 / Sort (i+1)`。
### λ 引入规则

| 规则的步骤 | Rocq（`Lambda` 分支） | Lean（`infer_lambda`） |
|---|---|---|
| ① A 是类型 | `execute_is_type … c1` | `ensure_sort_core(…d…)` |
| ② 把 x:A 加进上下文 | `push_rel` | `mk_local_decl` |
| ② 算出 t 的类型 B | `execute tbl env1 c2` | `infer_type_core(…e…)` |
| ③ λ 的类型是 `Πx:A. B` | `mkProd (name, var, ty)` | `mk_pi(fvars, r)` |

第 ③ 行最关键：两边都明确规定"**λ 的类型是一个 Π**"，Rocq 用 `mkProd` 造出这个 Π，Lean 用 `mk_pi` 造出这个 Π。这就是第一步"身份"第 3 条里的那层关系，两边也对得上。

计算方面，两边都有 β 归约：`(λx. t) a` 化简为 `t[x:=a]`。

**结论**：无论是形状、规则，还是和其他构造器的关系，`Prod`/`forallE` 都满足 Π 的身份，`Lambda`/`lam` 都满足 λ 的身份。

---
## 第四步：为什么"规则相同"就能推出"可以互换"
这一步是整个论证的关键，你原来的思路里只是隐含着它。

翻译做的事情是：把 `Prod` 换成 `forallE`，把 `Lambda` 换成 `lam`，子项递归翻译，Sort 按对照表换名。

"可以互换"的准确含义是：**先在 Rocq 里检查再翻译，和先翻译再在 Lean 里检查，得到的结论一样**。用 `lt` 的类型画出来就是：

```
Rocq:  Prod(n, nat, Prod(m, nat, Prop))   ── Rocq 的 Prod 规则 ──▶  合法，属于某个 Sort s
            │                                                          │
          翻译                                                     Sort 换名
            ▼                                                          ▼
Lean:  forallE n nat (forallE m nat Prop) ── Lean 的 forallE 规则 ─▶  合法，属于 Sort I(s)
```

这个图为什么能"转得通"？因为两条规则**每一步都相同**（第三步的两张表）：
- Rocq 检查"A 是类型"成立，那么 Lean 检查"⟦A⟧ 是类型"也成立，因为子项本身就是这样一层层翻译过来的；
- 两边都把 x 加进上下文，所以 B 在同一个上下文里被检查；
- 两边算 Sort 的公式在换名后一致。

所以，Rocq 认为合法的 Prod，翻译后 Lean 也认为合法，并且落在对应的那一层。

Lambda 也是一样：Rocq 算出 `Lambda(x, A, t)` 的类型是 `Prod(x, A, B)`，翻译后 Lean 算出 `lam x ⟦A⟧ ⟦t⟧` 的类型是 `forallE x ⟦A⟧ ⟦B⟧`，**恰好是 Rocq 结论的翻译**。这一步要用到前面已经确立的 Prod ↔ forallE 对应，所以 Lambda 的对应建立在 Prod 的对应之上。

用 `lt` 的 body 走一遍（`AST 翻译 完整的例子.md` 第 6 节 (b)）：

| Rocq | Lean |
|---|---|
| `le (S n) m : Prop` | `le (S n) m : Prop` |
| 包上 `fun m`：`nat → Prop` | 包上 `fun m`：`nat → Prop` |
| 包上 `fun n`：`nat → nat → Prop`，**等于声明的类型** | 包上 `fun n`：`nat → nat → Prop`，**等于翻译后的类型** |

每一层两边都同步，所以最后 Lean kernel 接受了翻译结果（`TRANSLATED_AND_CHECKED`）。
