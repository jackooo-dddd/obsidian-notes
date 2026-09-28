`ProsaBuddy: Assisting Mechanized Real-Time Schedulability Analysis with LLM-based Agents`
#### **Research Question**
Can an LLM agent reduce the human effort required to construct **machine checked** schedulability analysis proofs in Prosa/Rocq?
Second question: What capabilities does LLM agent need to solve the long, domain specific, dependency heavy proofs found in real time scheduling?

#### **Why RQ is Challenging / Difficulty to solve**
- Very little training data for formal scheduling proofs. It is impossible to let LLM know Prosa proof patterns via pretraining. This motivates inference time learning.
- Scheduling theorem has huge context, a Prosa theorem can depend on processor model, task model, job model, scheduler, interference, workload, priority, validity, previous lemmas...
- Prosa contains deep dependency chains, simply retrieving a theorem from the library is insufficient, LLM must know how to make that theorem usable. Suppose the agent finds a very useful theorem $L : A \land B \land C \land D \Rightarrow G$ and the current goal is $G$, the agent has to instantiate all the variables and prove `A, B, C, D`, each of these conditions may themselves depend on more Prosa assumptions.

#### **ProsaBuddy Ingredients**
1. **ReAct:** ProsaBuddy is built on OpenCode. Repeatedly performs `Reason → Act → Observe feedback → Reason. `Instead of relying purely on what the LLM knows from its parameters, the system allows the model to repair the proof.
2. **Retrieval knowledge from Prosa library:** LLM has access to Prosa codebase, it can search for `definitions, lemmas, proof patterns, assumptions, similar proof example.` Thus the LLM does not need to remember Prosa internally.
3. **Subgoal decomposition** `(Architecture Contribution)`: Suppose the goal is $T$, instead of giving the entire problem to one gigantic agent context, primary agent constructs $T \Leftarrow H_1 \land H_2$ and $H_1 \Leftarrow S_1 \land S_2$, only the terminal goals $S_1, S_2, H_2$ are sent to subagents. The **decomposition is machine checked**, LLM cannot invent subgoals and claim they imply the theorem, the logical structure of decomposition is verified by Rocq. 
4. **Proving skills learned from failure traces:** The author select 65 Prosa lemmas, they let an earlier version of ProsaBuddy attempt them and collect the entire agent trajectory: attempt → Rocq error → new attempt → different error → repair → proof state → successful solution. Then another LLM analyzes these traces, producing proof traces → failure segments → problem patterns → candidate skills. Eventually 17 skills are produced, a skill tells the model when this type of problem occurs, use this procedure. Example skill includes `error priority, tactic selection, goal management, lemma instantiation...`
5. **Give the agent direct Rocq tools**: ProsaBuddy exposes three important Rocq interfaces.
	(1) Rocq compiler: Checks the `.v` file. `Proof → Compile → error line + message`
	(2) Rocq top level: Allows querying things such as definition of concepts / type of a lemma / assumptions / available objects. 
	(3) Rocp-lsp: Provides the current interactive proof state. Listing `current goal:..., Hypotheses:..., `So LLM can make one change and immediately observe `Previous state → new state` 
6. **Validator prevents the LLM from cheating:** Compilation alone does not guarantee that the theorem was really proved, agent might make the file compile by doing something like `Adimitted.` or modifying the theorem itself. Thus, ProsaBuddy introduces a Validator. It checks that the agent has not modified the theorem statement or definitions / added `Parameter/Conjecture/Admitted. `The success criterion is Rocq compilation succeeds and validator succeeds. They additionally sandbox the file system so that the agent cannot secretly modify Prosa itself. This makes the evaluation much more trustworthy.
#### **Guidelines for Decomposition**
1. **Reshaping:** rewriting a statement into exactly the syntactic form expected by an existing lemma. Rocq often cannot automatically treat differently represented expressions as interchangeable, the expression often needs to have the exact structure expected by the proof library.
2. **Witnessing:** Used for existential statements. Suppose the goal is  $\exists j,\;P(j).$ A human may simply reason that "such a job $j$ must exist," but Rocq needs an explicit witness. So the proof is decomposed into  $\boxed{\exists j,\;P(j)\rightarrow\text{choose }j\text{ and prove }P(j)}$. The LLM therefore needs to identify an appropriate object and explicitly provide it to Rocq.
3. **Library Matching:** Suppose a Prosa lemma has the structure $A\land B\land C\Rightarrow G.$ If the goal is $G$, the proof should explicitly generate the required assumptions: `A, B, C.`This is closely related to using `apply some_prosa_lemma` in Rocq. After applying the lemma, Rocq asks to prove its required assumptions. Thus, library matching is reshaping the proof problem around an existing library theorem. This is important in Prosa since many useful RTS results already exist in the library.
4. **Case Splitting:** Sometimes a proof depends on whether a proposition $P$ is true or false. Instead of reasoning about both possibilities implicitly, explicitly split the proof into $\boxed{P\lor\neg P}$ 
5. **Lifting**: Converts facts about individual elements into a fact about an entire collection, such as a set, list, count, or aggregate. For example, suppose we know something about every individual job $\forall j\in J,\;P(j).$ But the theorem requires a statement about the whole job set $P_{\text{set}}(J).$  The proof must therefore "lift" the local facts: `Property of job 1, 2, 3... → lifting → property of the whole set. `Lifting occurs frequently in scheduling proofs because reasoning often begins with individual jobs but the final theorem concerns quantities such as total workload, interference, job counts, or schedulability.
6. **Why the decomposition is needed:** Much of the difficulty in formal theorem proving is expressing the mathematics in exactly the representation expected by the proof assistant and its libraries. This explains why explicit decomposition guidelines are useful: they teach the LLM how to bridge the gap between **understanding what should be proved** and **producing the exact proof state transformations required by Rocq/Prosa**.
$$
\boxed{
\begin{aligned}
\text{High-level mathematical idea}
&\not\Rightarrow
\text{immediately usable Rocq proof}
\end{aligned}
}
$$
$$
\boxed{
\begin{aligned}
\text{High-level idea}
&\rightarrow \text{decomposition}
\rightarrow \text{Rocq-friendly subgoals} \\
&\rightarrow \text{library lemmas/tactics}
\rightarrow \text{verified proof}
\end{aligned}
}
$$

#### **Human's Responsibility**
LLM handles annoying low level mechanization, the human rations responsibility for the high-level mathematical insight. The agent input contain: `formal Rocq theorem + optional human proof hint.`The hint come directly from the mathematical proof in the original research paper.

#### **Benchmark to test agent performance**
Constructed a new mini-benchmark containing 24 formalized lemmas, these lemmas come from five real-time scheduling papers and one book. None of these 24 lemmas already exists in Prosa, so ProsaBuddy cannot simply retrieve and copy the proofs. Some proofs require `100 ~ 200` Rocq tactics, this is much more representative of the target domain than a toy theorem-proving benchmark.

#### **The Inference Cost Is Enormous**
The token counts reported in Table V are measured in **thousands of tokens** ($48{,}819K$).
So ProsaBuddy is demonstrates something closer to With very heavy inference-time search, domain-specific knowledge, and continuous proof-assistant feedback, LLM-based agents can solve formal proofs that ordinary agents currently struggle to complete.
$$
\boxed{
\begin{aligned}
\text{Large inference budget}
&+ \text{domain knowledge}
+ \text{Rocq feedback} \\
&\rightarrow \text{stronger formal proof capability}
\end{aligned}
}
$$
So one limitation of ProsaBuddy is that its success can require tens of millions of tokens and hours of inference, which may make the approach expensive for routine use.

#### **Paper's Contribution**
1. **Introduces LLM agents to real-time schedulability analysis.** The paper identifies schedulability analysis as a different domain from standard math benchmarks and builds an agent specifically for it. This is the paper's high level research contribution.
2. **Subgoal delegation architecture:** The paper introduces a primary-agent/subagent systems where large theorem is divided into small terminal goals. Importantly, the decomposition is checked by Rocq, and failed subgoals can be recursively decomposed without discarding successful work.
3. **Domain specific decomposition guidelines:** They encode expert knowledge about how Rocq proofs should be broken into `reshaping, witnessing......` This addresses the gap between math decomposition and proof-assistant friendly decomposition.
4. **Skills derived from agent failures:** This is an interesting form of extracting procedural knowledge from agent experience.
5. **Integration with Rocq and proof validation**: The paper add `compiler access, Rocq toplevel, rocq-lsp, proof state feedback, validator`, turning the proof assistant itself into an active feedback mechanism for the LLM.
6. **Benchmark:** The paper formalizes 24 new scheduling lemmas from existing literature that are not already present in Prosa, compare against several theorem-proving agents, perform ablations, repeated trials, Prosa-internal evaluations, and backbone-model comparisons.


Limitations
1. ProsaBuddy does not automatically formalize the theorem. Researcher still has to translate the informal theorem into correct Rocq statements. This may be the hardest unresolved problem as Rocq can verify a proof of formal statement, but cannot verify that the formal statement matches what the human originally means.
2. Failure does not mean theorem is false. It simply means ProsaBuddy can not find the proof. 
3. 24 benchmark lemmas are intentionally close enough to existing Prosa foundations that many required definitions and auxiliary facts already exist. The authors explicitly say the results should not be interpreted as ProsaBuddy being able to formalize arbitrary scheduling theory from scratch.
4. Inference cost is extremely high.
5. The full human-in-the-loop benefit has not yet been evaluated systematically.