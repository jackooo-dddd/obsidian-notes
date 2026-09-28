
$\boxed{\begin{aligned}\text{DAG task}&=\text{vertices representingcomputation}\\&+\text{directed edges representing precedence} \end{aligned}}$
$G_i=(V_i,E_i)$, where $V_i$ is the set of vertices/subtasks and $E_i$ is the set of edges. 
```text
v1 ──→ v2 ──→ v4 ──→ v5    DAG Example
 │              ↑
 └──→ v3 ───────┘
```
- **Directed**: every dependency has a direction, e.g. edge $v_1\rightarrow v_2$ is a **precedence constraint** meaning that $v_1$ must finish before $v_2$ can start.
- **Acyclic**: following the directed edges can never lead back to an earlier node. Acyclic graph prevents from cyclic dependency in which no node can become executable.
- **Vertex**: A vertex $v_i$ represents a **subtask / piece of computation**, each vertex has its own execution requirement. e.g. $C(v_1)=2,\quad C(v_2)=3,\quad C(v_3)=4,\quad C(v_4)=2,\quad C(v_5)=1.$
- **Total Work:** Total amount of CPU execution needed by the DAG job., $W=\sum_{v\in V}C(v).$
- **Critical Path:** The longest directed path through the DAG. Path $v_1\rightarrow v_2\rightarrow v_4\rightarrow v_5$ has length $2+3+2+1=8$,  Path $v_1\rightarrow v_3\rightarrow v_4\rightarrow v_5$ has length $2+4+2+1=9,$ therefore critical-path length $\boxed{L=9}$. Even with an unlimited number of processors, the DAG cannot finish faster than its critical path because the nodes on that path must execute sequentially

## DAG as a Recurrent Real-Time Task
Usually, the DAG does not execute only once. A DAG task can be represented as $\boxed{\tau_i=(G_i,T_i,D_i)}$ with $G_i=(V_i,E_i).$ 
$\tau_i$ repeatedly releases `DAG jobs` with the same internal graph structure $G_i$.
```text
time ─────────────────────────────────────────→
release                         release
   ↓                               ↓
DAG Job 1                       DAG Job 2
   ↓                               ↓

    ┌→v2→┐                         ┌→v2→┐
v1 ─┤    ├→v4→v5           v1 ─────┤    ├→v4→v5
    └→v3→┘                         └→v3→┘
|<------------- T_i ------------->|
```

## Relation to Prosa
The ordinary Prosa model is approximately:
```text
Task τ_i
   ↓
releases Job J_i,j
   ├──→ arrival
   ├──→ execution cost
   ├──→ deadline
   └──→ scheduled execution
```

For DAG tasks, this would become:
```text
DAG Task τ_i
   ↓
releases DAG Job J_i,j
   ↓
contains multiple vertex jobs
   ├──→ v1 → v2
   ├──→ v1 → v3
   ├──→ v2 → v4
   ├──→ v3 → v4
   └──→ v4 → v5
```

Therefore, one of the central formalization questions when adding DAG tasks to Prosa is how do we formally represent precedence relations between jobs?
Conceptually, one might need a relation such as `precedes : Job -> Job -> bool`
where: `precedes v1 v2 → v1 must complete → v2 becomes eligible`
The scheduling need to guarantee $\boxed{v_i\rightarrow v_j\Longrightarrow v_j\text{ cannot execute before }v_i\text{ completes}}$ 