Prosa is a library/framework built using [[Rocq]] specifically for providing Real-Time Systems scheduling theory formalization. Its purpose is to provide reusable, machine-checkable definitions and proofs for real-time scheduling analysis.
#### **Why Prosa exists**
When proving a response-time bound, use Rocq directly, need to define RTS concepts such as`What is time? What is a job? What is a task? What is schedule? What does preemption mean? What is priority? What is interference? What is response time?`
#### **RTS Example**
Suppose question is:  Under fixed-priority scheduling, can task $\tau_k$ always finish before its deadline? A common response-time equation is
$$
R_k =
C_k +
\sum_{\tau_i\in hp(k)}
\left\lceil
\frac{R_k}{T_i}
\right\rceil C_i
$$
The schedulability question is then $\boxed{R_k \le D_k}.$  If this holds, task $\tau_k$ always finishes before its deadline under the assumed task and scheduling model.
- **Rocq's Role**: Rocq understands mathematical objects such as `natural numbers, function, sets, ∀, ∃`.  Rocq's main job is to check whether a proof is mathematically valid. `Assumptions + Theorem + Proof → Rocq → Proof is valid`
- **Prosa's Role:** Prosa is built on top of Rocq and provides the real-time systems and scheduling concepts needed for RTS proofs. For instance, `τ → task, C → execution cost, job → formal job definition, schedulability → formal deadline guarantee`.

### Prosa Layers
#### prosa.behavior — Basic execution semantics
The **Behavior Layer** in Prosa acts as the "physics engine" for a real-time system, defining the fundamental rules of execution without caring about _what_ tasks are running or _how_ they are scheduled. It focuses purely on the passage of time and the lifecycle of a job. 
- For example, it defines core concepts like `time`, `job_arrival`, and `schedule` (which maps every moment in time to either a running job or an idle state). 
- Because this layer is completely independent of specific task models (like periodic or DAG tasks) and scheduling algorithms (like EDF or Rate Monotonic), any mathematical proof created here—such as "a job cannot execute before it arrives"—automatically applies to every possible system configuration.
To track a job's progress through this timeline, the Behavior Layer provides essential metrics and state checks, such as `service`, `pending`, and `completed`. 
- The `service` function calculates exactly how much CPU time a job has received up to a specific moment, while `pending` checks if a job has arrived but isn't finished yet. Once the `service` received equals the job's required execution cost, the `completed` state is triggered. 
- By strictly defining these basic building blocks, the Behavior Layer creates a solid foundation that the higher-level Policy and Analysis layers can later use to prove complex safety properties, like guaranteeing that all deadlines will be met.
#### prosa.model — System and task assumptions
The Model layer builds directly on top of the Behavior layer to describe exactly _what_ kind of tasks and hardware we are considering. For example: 
- Task model: Defining whether jobs arrive periodically, sporadically, or follow a specific pattern
- Processor model: defining if the system uses a single CPU, multiple CPUs, or even models realistic hardware quirks like context-switch overheads and cache delays. 
- Scheduling model: Fixed Priority or Earliest Deadline First.
- Preemption model: fully preemptive / non-preemptive / limited preemption
By formally capturing these specific system assumptions, the Model layer acts as a crucial bridge. It takes the raw, abstract concepts of time and execution from the Behavior layer and shapes them into a concrete system environment. This allows the higher-level Analysis layer to later prove mathematical guarantees based on the exact, constraints of specific setup.
#### prosa.analysis` — Generic mathematical analysis
Once Behavior and Model are defined, the Analysis layer develops the machinery needed to rove timing properties, including `workload, interference, time bounds...` The important point is that this layer is often **generic**.
- Instead of proving FP scheduling of sporadic tasks has response-time bound X, Prosa may prove a much more abstract theorem about interference + service + arrival bounds + response time bound. Then that theorem can later be reused for FP, EDF, different preemption models, etc.

#### `prosa.results` — Concrete schedulability theorems
The **Results Layer** contains the final scheduling guarantees proved in Prosa. It answers:
Under these assumptions, is the real-time system schedulable?
- Provides verified results such as EDF schedulability tests, Fixed-Priority Response-Time Analysis (RTA), and response-time bounds.
- Researchers can reuse general theorems and instantiate them with a specific task/job model, rather than proving everything from scratch.
- Supports different scheduling models, including fully preemptive, non-preemptive, and limited-preemptive scheduling.
- Connects the assumptions defined in the Model Layer with concrete schedulability guarantees.

#### prosa.implementation — Executable implementations
The previous layers can be highly abstract, the Implementation Layer bridges the gap between theory and practice by providing concrete, executable representations of these concepts.
##### 1. The Abstract View (Model Layer):
Mathematically, we define an arrival curve as a pure function:
`max_arrivals : Task -> duration -> nat`
It is a theoretical rule stating, *"In any time window of length $\Delta$, this task will release at most $N$ jobs."* It doesn't specify how $N$ is stored, calculated, or represented in a computer's memory.
##### 2. The Concrete View (Implementation Layer):
To actually execute this on a computer, Prosa implements it as a specific, finite data structure:
```text
Concrete Arrival Curve = {
    steps: [(0, 0), (10, 1), (20, 2)],  // A finite list of (time, max_jobs) pairs
    horizon: 100,     // The maximum time this specific list covers, this table describes up to 100
    period: 10        // The repeating cycle length, a new job arrive every 10s
}
```
The Implementation layer then provides an **executable algorithm** (e.g., `compute_max_arrivals(curve, Δ)`) that physically loops through this finite list of steps to calculate the exact number of jobs for any given $\Delta$.
