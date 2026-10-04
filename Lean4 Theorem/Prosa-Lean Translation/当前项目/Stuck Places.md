**Problem：** 在复现最终 statement 时，Lean declaration 实际接受的参数顺序与 Rocq declaration的参数不一致。即使源代码中 Rocq 和 Lean 看起来写了几乎相同的变量和参数，经过 elaboration 之后，两边 declaration 的类型仍然可能不同。
- declaration 并不只是源文件里的那段代码。Rocq 的 `Section` 结束后，每个 declaration 只会保留实际依赖的 section variables，这些参数的最终顺序由 Rocq 决定；Lean 的 `variable` / `include` 机制则采用不同的规则。例如，Lean 会自动把实际用到的 typeclass instance 参数带入 declaration，同时忽略那些只在 proof 内部使用、但没有出现在最终 statement 中的变量。因此，两边源码表面上看起来一致，最终编译完成后的type 却不同。
当前的处理方法是先用 `Check @decl` 打印 Rocq declaration 的完整 elaborated type，再手动调整每个 Lean signature，使最终参数集合和顺序与 Rocq 对齐。

**Problem：** Rocq 中的 MathComp structure 往往无法直接映射到 Lean。很多 MathComp structure 并不存在一个一一对应的 Lean counterpart，因此必须先决定在 Lean 中采用什么表示方式，确认这种设计是合适的，然后在整个翻译和验证过程中始终保持一致。
**Why it gets stuck：** 原因是 MathComp 和 Lean 对结构的组织方式本身不同。MathComp 通常会把一个 type 和它所支持的 operations 打包在同一个 structure 中，并依赖 canonical structures、Hierarchy Builder 等机制来组织和自动推导这些结构；而 Lean/Mathlib 通常把底层 type 单独保留，再通过 typeclass 给这个 type 附加 `DecidableEq`、order、algebraic operations 等能力。因此，一个 packed MathComp structure 翻译到 Lean 时通常需要被拆成多个部分，例如“一个普通 type + 若干 typeclass instances”。而且有些 MathComp structure 在 Mathlib 中根本没有完全自然、完全等价的现成 counterpart，这时就必须人为设计对应的 Lean representation，并保证之后所有 declaration 和 correspondence proof 都统一使用这套表示。

**Problem：** 第三个经常卡住的地方是，需要在 Lean 中重新构造原来的 proof。Rocq 里使用的 ssreflect tactics、MathComp lemmas 以及相关 proof idioms，在 Lean 中通常没有直接对应物，因此原来的 proof script 不能逐句照搬