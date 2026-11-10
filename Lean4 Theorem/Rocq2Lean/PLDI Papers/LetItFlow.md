### Let It Flow: A Formally Verified Compilation Framework for Asynchronous Dataflow

它研究什么？
作者构建了一个叫 Wavelet 的编译框架，并使用 Lean 对两个核心 Compiler Pass 进行了形式化验证。
其证明重点是：
- Forward Simulation：源程序执行能够由翻译后的程序正确模拟。
- Determinacy：编译出的 Dataflow Program 的结果不依赖执行调度。
- Modularity：将不同编译阶段的正确性保证组合起来。

这两个方法可以简单理解为：

|方法|核心思想|对我们的帮助|
|---|---|---|
|1. Simulation Relation|翻译前后不一定要用相同的计算方式，只要能证明执行过程和最终行为对应即可|对复杂的 Recursor、递归或状态变换，不必强行要求两边结构一样|
|2. Compositional Correspondence|先证明基本 Type 和 Operation 的 Correspondence，之后复杂 Definition 的证明可以由这些已有证明组合出来|减少重复证明，让 Correspondence 更容易自动化、理解和审核|

我的判断： 第二点可能直接简化我们当前的项目；第一点可能增强复杂翻译规则的语义保证，但也可能引入更多证明工作。因此，我们应该让 Agent 做一个实际实验，而不是直接采用它们。

## 给 Agent 的 Prompt

We are considering two ideas from the Wavelet paper ([https://arxiv.org/pdf/2608.05451](https://arxiv.org/pdf/2608.05451)) for our Rocq→Lean translation and correspondence verification project.

**Idea 1 — Simulation Relation:** Instead of requiring source and target implementations to have similar structures, prove that their execution behaviors correspond, even when their internal computation steps differ.

**Idea 2 — Compositional Correspondence:** Once we have proved correspondence for basic types, operations, and functions, reuse these proofs to automatically establish correspondence for larger definitions and theorem statements, following their AST structure.

I want you to **critically evaluate whether these two ideas actually improve our existing system**, rather than assuming they are useful.

Please:

1. **Inspect our existing implementation.** Identify what correspondence mechanisms we already have (`Iso`, `rel_iso`, function relations, proposition correspondence, etc.) and whether we already implement either idea partially.
    
2. **Test Compositional Correspondence.** Select 2–3 representative real definitions from our project. Compare our current verification method against composing existing correspondence lemmas. Determine whether this reduces manual proofs, proof complexity, duplicated work, and verification effort.
    
3. **Test Simulation Relation.** Find a real translation case where Rocq and Lean have substantially different computational structures (e.g., recursion, recursor lowering, or state transitions). Evaluate whether simulation provides stronger or simpler verification than our existing correspondence approach. If no suitable example exists, explicitly explain why simulation is not currently justified.
    
4. **Evaluate three benefits separately:**
    
    - Simplicity: Does it reduce code, manually written lemmas, proof obligations, or implementation complexity? Include the overhead of building the new framework.
        
    - Understandability: Does it make the correctness argument easier to explain and audit? Show a concrete before/after example.
        
    - Convincingness: Does it provide stronger, independently checkable correctness guarantees, or merely repackage our existing assumptions?
        
5. **Perform small proof-of-concept experiments where feasible.** Use actual repository code and real compiler/kernel checks. Preserve original statements, avoid `sorry`, `admit`, additional axioms, unsafe tricks, or unverified assumptions. Keep experiments isolated and avoid major production changes.
    
6. **Report measurable evidence:** proof lines, reused lemmas, manual effort, successful verification coverage, additional assumptions, and any new complexity. Clearly distinguish verified results from hypotheses, and explain the trust boundary between original Rocq definitions, mechanically translated Lean definitions, and native Lean definitions.
    

**Final deliverable:** For each idea, explain in simple terms:

- What exactly would change in our current system?
    
- What concrete improvement did the experiment demonstrate?
    
- What extra complexity or limitations does it introduce?
    
- Does it genuinely make translation/verification simpler, easier to understand, or more convincing?
    
- Should we adopt it now, later, or not at all?
    

Provide the actual files, proof results, commands, and a before/after comparison.

Prioritize experimental evidence over theoretical arguments. Do not claim an improvement without demonstrating it.

### 我特别想让 Agent 回答的一个问题

假设我们已经证明：

`nat_corr`、`add_corr`、`eq_corr`

现在遇到一个复杂 Definition：

旧方法： 需要额外写 50 行证明。

新方法： 可以直接组合已有的三个 Correspondence，只需 5 行证明。

这就是一个明确的改进。

反过来，如果引入 Simulation 后，原本 50 行的 Function Correspondence 变成 200 行 Simulation Proof，而且没有得到更强的实际保证，那就不值得采用。

最终目标不是使用更高级的理论，而是证明这些理论真的让我们的翻译系统更简单、更自动化，并且让别人更有理由相信翻译是正确的。