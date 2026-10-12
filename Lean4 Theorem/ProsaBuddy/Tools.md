翻译到 Lean 之后，可以让 大模型在实际的运行里面，观察 Lean里面的工具和Rocq里面的工具，使用的时候，区别在哪里。

| 结构性问题                             | Rocq 当前做法                                                         | Lean 应该怎么做                                                                              | 主要涉及文件                                                                           |
| --------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Proof Region / Grammar         | 通过 `Proof.`、`Qed.`、`have`、`{ ... }`、句号等识别证明范围                     | 根据 Lean `:= by`、缩进及 syntax tree 识别完整 proof block，保留 region marker                       | `proof-workflow.ts`、`proof-edit-transaction.ts`、`coq-session.ts`                 |
| 2. Proof State / LSP              | Rocq LSP、Petanque、Coq batch replay 获取 goal、hypotheses、proof state | Lean LSP 获取目标信息；交互执行 tactic、snapshot、undo 可以考虑 Lean REPL                                | `lsp/index.ts`、`lsp/client.ts`、`proof-context.ts`、`coq-session.ts`、`petanque.ts` |
| 3. Compiler / Project Environment | `coqc`、`coqtop`、`_CoqProject`、Coq error parser                    | `lake env lean`、`lake build`、Lean diagnostics，使用 `lakefile.lean`、`lean-toolchain` 等项目配置 | `coq-project.ts`、`coqc.ts`、`coqtop.ts`、`coq-diagnostics.ts`                      |
| 4. Proof Validation / AST Audit   | 检查 `Admitted`、`Axiom`、theorem statement 修改，以及 Coq AST             | 检查 Lean 的 `sorry`、未授权 axioms、theorem statement、源码结构和证明依赖                                | `coq-ast-audit.ts`、`proof-workflow.ts`、`checkpoint.ts`                           |
| 5. Proof Plan / Lemma Checking    | `Check`、`eapply` 检查候选引理及剩余 premises，结合 MathComp/Prosa             | 用 Lean elaboration、`#check`、`apply`/`refine` 等验证候选引理；适配 Lean Prosa 和 Mathlib            | `proof-plan.ts`、`proof-premise-audit.ts`、`proof-schema.ts`                       |
Lean 4 和 Rocq 都支持 LSP（Language Server Protocol），都可以实时查看 proof goal、local hypotheses、编译错误和证明进度。Rocq 里面用到的功能，全部能找到，把接口换成 Lean 里面的就可以啦. LSP 的对应文件是 coqSession.ts
LSP 里面最主要的就是Step，提交 tactic → 返回新 proof state → 继续提交 tactic”的交互方式，Lean 里面的 LSP 是有支持的
Lean REPL 已经能做你说的 `step`

`leanprover-community/repl` 的文档直接给出了“提交 tactic → 返回新 proof state → 继续提交 tactic”的交互方式，不过目前将 tactic mode 标记为 **experimental（实验性）**。[GitHub](https://github.com/leanprover-community/repl)

下面用一个简单命题示意，状态编号以实际返回值为准：

```
初始状态 0：
⊢ ∀ n : Nat, n + 0 = n

提交：
{"proofState": 0, "tactic": "intro n"}

得到新状态 1：
n : Nat
⊢ n + 0 = n

继续提交：
{"proofState": 1, "tactic": "exact Nat.add_zero n"}

得到新状态 2：
没有剩余 goals
```