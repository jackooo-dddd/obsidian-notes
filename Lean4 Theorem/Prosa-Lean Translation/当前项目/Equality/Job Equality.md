## Prosa 中的 Job 是什么？
Prosa 中的核心定义是：

```coq
Definition JobType := eqType.
```

这意味着 `JobType` 不是预先定义好的某个 Job Record，而是**任意支持可判定相等性的类型**，例如可以通过编号、Record 或其他数据结构表示 Job。同时，Prosa 通过 Typeclass 定义 Job 的属性：

```coq
Class JobCost (Job : JobType) :=
  job_cost : Job -> work.

Class JobArrival (Job : JobType) :=
  job_arrival : Job -> instant.
```

因此，Job 的 Representation Correspondence 实际上需要区分两种情况：1）Generic Job：Rocq 和 Lean 共享同一个底层 Job Type；2）Concrete Job：Rocq 和 Lean 分别定义了独立的 Job Record，需要证明两种表示之间的 Isomorphism。

## 情况一：Generic Job（FinishTime）——为什么两边的 Job 可以直接对应？

核心原因是：**Rocq 和 Lean 并没有各自创建一个不同的 Job Type，而是在验证时，直接让 Imported Lean 使用原始 Rocq 的同一个 Job Type 和同一个 Job Value。** 因此，这里根本不存在两个不同的 Job 需要转换或证明同构的问题。

首先，Rocq 中的 Generic Theorem 使用：

```coq
Context (Job : eqType).
Variable j : Job.
```

而 Lean Translation 使用：

```lean
{Job : JobType}
[DecidableEq Job]
(j : Job)
```

注意，Lean 中的 `Job` 只是一个 Type Parameter，并不是一个新定义的 Job Datatype。因此，当 Lean Declaration 被 Import 回 Rocq 后，我们可以直接把原始 Rocq 的 `Job` 传给它：

```coq
Context (Job : eqType).
Let dJ := svc_decidable_eq Job.
Variable j : Job.
```

例如 FinishTime Certificate 调用 Imported Lean Declaration：
```coq
ImportedFinishTime.Prosa_Analysis_Definitions_FinishTime_finish_time
  Job
  dJ
  arrivalL
  costL
  PStateL
  schedL
  j
  RL
  HL
```
这里最关键的是传入的 `Job` 和 `j`：**`Job` 就是原始 Rocq 的 Job 底层类型，`j` 也是原始 Rocq 中的同一个 Job Value。** 因此，两边不是分别存在 `jR` 和 `jL`，再通过某个转换函数证明它们对应，而是从一开始就使用同一个 `j`。
```text
原始 Rocq Definition       Imported Lean Definition
         │                           │
         ▼                           ▼
     Job : eqType ───────────→ 同一个 Job 底层类型
         │                           │
         ▼                           ▼
       j : Job ──────────────→ 同一个 j
```

举个简单的例子：假设 `Job` 是一个包含 `J1`、`J2` 的类型，当前 `j = J1`，那么 Rocq Definition 接收的是 `J1`，Imported Lean Definition 接收的也是同一个 `J1`，并不存在额外创建的 `LeanJ1`。所以**不需要再证明 `J1` 和 `LeanJ1` 之间的 Representation Relation**。如果一定要用转换函数描述，这相当于 Identity Conversion：
$$
toJob(j)=j,\qquad fromJob(j)=j
$$

不过，这只是概念上的解释，项目实际上直接共享类型和值，并不需要构造这两个转换函数，也不需要单独证明 Job Datatype 的 Isomorphism。

**但这不代表其他东西也自动对应。** Rocq 的 `eqType` 包含 Equality 信息，而 Lean 需要 `[DecidableEq Job]`，所以项目通过 `svc_decidable_eq Job`，利用 MathComp 的 `eqP` 构造 Imported Lean 所需的 Equality Instance。此外，虽然两边使用同一个 `j`，但 `job_cost j`、`job_arrival j` 等函数的返回值仍然可能采用不同的表示，因此还需要通过 `SvcJobCostRel`、`Harrival` 等关系证明它们的输出对应。

**总结：Generic Job 不需要额外证明 Job Type / Value 的 Isomorphism，因为验证时已经通过参数实例化让两边共享同一个 Type 和同一个 Value；真正需要证明的是 Equality 接口的桥接，以及作用在这个 Job 上的 Operations 和 Properties 是否对应。**
## 情况二：Concrete Job（Classic）——两个独立的 Job Datatype

与 Generic Job 不同，Classic Implementation 中 Rocq 和 Lean 分别定义了自己的 Concrete Job Record。对应 Certificate：

`classic_implementation_job/ClassicImplJobCorrespondence.v`

两边的 Concrete Job 包含 Job ID、Arrival、Cost、Deadline、Task 等字段。由于它们是两个独立的 Record Representation，不能直接复用同一个 `j`，而是需要建立真正的双向转换：

```coq
ij_export : Rocq_concrete_job -> Imported_Lean_concrete_job
ij_import : Imported_Lean_concrete_job -> Rocq_concrete_job
```

其中 `ij_export` 将 Rocq Job 转换成 Imported Lean Job，`ij_import` 则将 Imported Lean Job 转换回 Rocq Job。为了证明两种 Datatype 无损对应，需要验证两个 Roundtrip：

$$
\boxed{ij\_import(ij\_export(j_R))=j_R}
$$

$$
\boxed{ij\_export(ij\_import(j_L))=j_L}
$$

对应 Certificate：

```text
ij_source_roundtrip
ij_target_roundtrip
```

这就建立了两个 Concrete Job Datatype 之间的 Isomorphism，保证任意 Rocq Job 都可以转换成对应的 Lean Job，反方向也一样，而且来回转换不会丢失信息。

**除了 Datatype Isomorphism，还需要证明各个 Field 的 Correspondence。** 项目中包括：

```text
ij_job_id
ij_job_arrival
ij_job_cost
ij_job_deadline
ij_job_task
```

这意味着不仅要验证整个 Job Record 能够无损转换，还要验证其中的 Job ID、Arrival、Cost、Deadline、Task 等字段在转换后仍然对应。

为了比较两边的具体 Job Value，Certificate 定义了 Representation Relation：

```coq
IjRel r l := Lean.eq (ij_export r) l
```

这里省略了部分参数，意思是：只有当 Rocq Job `r` 经过 `ij_export` 转换后等于 Imported Lean Job `l`，才认为这两个 Job 对应。

此外，Certificate 还通过 `ConcreteJob_concrete_job_target_total` 证明：对于任意 Imported Lean Job `l`，总能找到对应的 Rocq Job。具体选择 `ij_import l`，并利用 Roundtrip 证明：

```coq
IjRel (ij_import l) l
```

因此，Concrete Job 的验证过程可以总结成：

```text
Rocq Concrete Job
       │
       │ ij_export
       ▼
Imported Lean Concrete Job
       │
       │ ij_import
       ▼
Rocq Concrete Job
       │
       ▼
证明 Roundtrip + Field Correspondence
```

总结：**Concrete Job 需要先建立两个独立 Job Datatype 之间的 Isomorphism，再通过 Representation Relation 和 Field Correspondence 验证两边具体 Job 的无损对应。**

## 两种 Job Correspondence 的核心区别

| 比较 | Generic Job（FinishTime） | Concrete Job（Classic） |
|---|---|---|
| 底层类型 | 共享同一个 Job Type | 两个独立的 Job Record |
| 具体 Job | 两边使用同一个 `j` | 分别使用 `jR`、`jL` |
| Conversion | Identity | `ij_export`、`ij_import` |
| Datatype Iso | 不需要额外证明 | 需要证明 |
| Roundtrip | Identity 自然成立 | 显式证明双向 Roundtrip |
| Job Equality | `eqType` → `DecidableEq` | 通过 Conversion 和 Relation 对应 |
| Job Properties | `SvcJobCostRel`、`Harrival` 等 | Field Correspondence |
| 验证目标 | 同一 Job 上的 Operations 语义对应 | 两种独立 Job Representation 无损对应 |

最关键的区别是：**Generic Job 的两边本来就共享同一个 Type 和 Value，所以只需要处理 Equality Instance 和 Operations 的 Correspondence；Concrete Job 的两边是两个独立的 Datatype，因此必须建立 Conversion、Isomorphism、Roundtrip 和 Field Correspondence，才能证明它们表示的是同一个 Job。**