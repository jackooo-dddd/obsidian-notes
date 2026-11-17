## JobArrival Typeclass 的完整 Correspondence Example

文件：

`Prosa-Shunqi/Prosa/Behavior/Job.lean`

Lean 侧直接定义：

```lean
class JobArrival (Job : JobType) [DecidableEq Job] where
  job_arrival : Job → instant

export JobArrival (job_arrival)
```

因此 Lean 侧的 typeclass 可以理解成：

```text
JobArrival
 └── job_arrival : Job → instant
```

这里 `JobArrival` 不是一个 proposition，而是一个 **class / structure declaration**，里面包含字段 `job_arrival`。

## 1. Lean Class Import 回 Rocq

repo 中：

`Validation/certificates/behavior_job/JobTypeAudit.v`

会检查真正 import 回 Rocq 的 declarations：

```coq
Check ImportedJob.Prosa_Behavior_Job_JobArrival.
Check ImportedJob.Prosa_Behavior_Job_JobArrival_mk.
Check ImportedJob.Prosa_Behavior_Job_JobArrival_job_arrival.
```

实际导入后的 type 是：

```coq
Prosa_Behavior_Job_JobArrival
  : forall Job : Prosa_Behavior_Job_JobType,
      DecidableEq Job -> Type
```

constructor 是：

```coq
Prosa_Behavior_Job_JobArrival_mk
  :
  forall (Job : Prosa_Behavior_Job_JobType)
         (decEq : DecidableEq Job),
    (Job -> Prosa_Behavior_Time_instant) ->
    Prosa_Behavior_Job_JobArrival Job decEq
```

field projection 是：

```coq
Prosa_Behavior_Job_JobArrival_job_arrival
  :
  forall (Job : Prosa_Behavior_Job_JobType)
         (decEq : DecidableEq Job),
    Prosa_Behavior_Job_JobArrival Job decEq ->
    Job ->
    Prosa_Behavior_Time_instant
```

也就是说，Lean 中：

```text
class JobArrival ... where
  job_arrival : Job → instant
```

import 回 Rocq 后，本质上变成：

```text
type declaration
  Prosa_Behavior_Job_JobArrival

constructor
  Prosa_Behavior_Job_JobArrival_mk

projection
  Prosa_Behavior_Job_JobArrival_job_arrival
```

所以 **typeclass 的数据结构本身确实被实际 import 回了 Rocq**。

## 2. 定义 Source 和 Imported Typeclass 的 Relation

文件：

`Validation/certificates/behavior_job/JobCorrespondence.v`

定义：

```coq
Definition JobArrivalRel (T : eqType)
    (arrivalR : prosa.behavior.job.JobArrival T)
    (arrivalL :
       ImportedJob.Prosa_Behavior_Job_JobArrival T
         (eqtype_to_job_decidable_eq T)) : SProp :=
  forall j : T,
    InstantRel
      (@prosa.behavior.job.job_arrival T arrivalR j)
      (ImportedJob.Prosa_Behavior_Job_JobArrival_job_arrival
         T
         (eqtype_to_job_decidable_eq T)
         arrivalL j).
```

左边：

```text
arrivalR : 原始 Rocq JobArrival instance
```

右边：

```text
arrivalL : imported Lean JobArrival instance
```

然后要求对于所有 job `j`：

```text
Rocq:
job_arrival arrivalR j

        ↓ InstantRel

Imported Lean:
job_arrival arrivalL j
```

所以这里验证的**不是**：

```text
JobArrivalR ↔ JobArrivalL
```

因为 `JobArrival` 本身不是 proposition。真正验证的是：

```text
两个 structure instance
        ↓
比较对应 field
        ↓
∀ j, field output 对应
```

因此这属于 **definition / structure 的输入输出 correspondence**，而不是 theorem statement 的 `P ↔ Q` correspondence。

## 3. 项目不是直接假设 `JobArrivalRel`

项目实际定义了：

```coq
Definition import_job_arrival (T : eqType)
    (arrivalR : prosa.behavior.job.JobArrival T) :
    ImportedJob.Prosa_Behavior_Job_JobArrival T
      (eqtype_to_job_decidable_eq T) :=
  ImportedJob.Prosa_Behavior_Job_JobArrival_mk T
    (eqtype_to_job_decidable_eq T)
    (fun j =>
       instant_to_imported
         (@prosa.behavior.job.job_arrival T arrivalR j)).
```

输入：

```text
arrivalR : Rocq JobArrival
```

然后调用 imported Lean class 的 constructor：

```text
Prosa_Behavior_Job_JobArrival_mk
```

构造：

```text
arrivalL : Imported Lean JobArrival
```

其中 imported instance 的字段被定义成：

```text
arrivalL.job_arrival j
  :=
instant_to_imported
  (arrivalR.job_arrival j)
```

因此结构是：

```text
Rocq JobArrival instance
arrivalR
   │
   │ job_arrival j
   ▼
Rocq instant
   │
   │ instant_to_imported
   ▼
Imported instant
   │
   │ 放入 JobArrival_mk
   ▼
Imported Lean JobArrival instance
```

也就是说，target instance 不是随便假设出来的，而是**根据 source instance 明确构造出来的**。

## 4. 证明 Import Direction 的 Correspondence

项目接着证明：

```coq
Lemma job_arrival_import_certificate
    (T : eqType)
    (arrivalR : prosa.behavior.job.JobArrival T) :
  JobArrivalRel T
    arrivalR
    (import_job_arrival T arrivalR).
Proof.
  intros j.
  exact (eq_refl _).
Qed.
```

为什么最终只需要：

```coq
eq_refl
```

？

因为展开定义后，目标实际上变成：

```text
InstantRel
  (job_arrival_R j)
  (instant_to_imported (job_arrival_R j))
```

而 `InstantRel` 本身就是按照这个转换关系定义的，所以最终约化为类似：

```text
instant_to_imported (job_arrival_R j)
=
instant_to_imported (job_arrival_R j)
```

因此直接 `refl` 即可。

## 5. 还证明了 Export Direction 和 Roundtrip

项目不只是证明：

```text
Rocq → Imported Lean
```

还定义了：

```coq
export_job_arrival
```

把：

```text
Imported Lean JobArrival
```

重新构造成：

```text
Rocq JobArrival
```

然后证明：

```coq
Lemma job_arrival_export_certificate ... :
  JobArrivalRel
    T
    (export_job_arrival T arrivalL)
    arrivalL.
```

此外还有两个 roundtrip certificate：

```text
job_arrival_source_roundtrip_certificate
job_arrival_target_roundtrip_certificate
```

所以完整验证链是：

```text
                     import_job_arrival
Rocq JobArrival  ---------------------------->
                    Lean JobArrival

      │                                      │
      │ job_arrival                          │ job_arrival
      ▼                                      ▼

 Rocq instant  <------ InstantRel ------> Lean instant

      ▲                                      │
      │                                      │
      <----------- export_job_arrival --------
```

并且还验证：

```text
Rocq → Lean → Rocq
```

之后字段恢复原值，以及：

```text
Lean → Rocq → Lean
```

之后字段也恢复原值。

因此这里不仅验证了 field correspondence，还验证了两边 representation 的 **双向转换和 roundtrip**。

## 6. Manifest 明确把它归类为 `Class`

`behavior_job_module_manifest.json` 中有：

```json
{
  "source_declaration": "prosa.behavior.job.JobArrival",
  "lean_declaration": "Prosa.Behavior.Job.JobArrival",
  "kind": "Class",
  "semantic_status": "CERTIFIED",
  "certificate_bundle": [
    "job_arrival_import_certificate",
    "job_arrival_export_certificate",
    "job_arrival_source_roundtrip_certificate",
    "job_arrival_target_roundtrip_certificate"
  ]
}
```

所以这是 repo 中一个很标准的完整流程：

```text
Rocq Class declaration
        ↓ translation
Lean class
        ↓ import
Imported Rocq structure declarations
        ↓
define correspondence relation
        ↓
import / export conversion
        ↓
field correspondence certificates
        ↓
roundtrip certificates
        ↓
CERTIFIED
```

## 最值得记住的结构

```text
Lean class:

JobArrival
  └── job_arrival : Job → instant

              ↓ import

Imported Rocq structure:

Prosa_Behavior_Job_JobArrival
Prosa_Behavior_Job_JobArrival_mk
Prosa_Behavior_Job_JobArrival_job_arrival

              ↓ verification

JobArrivalRel :=
  ∀ j,
    InstantRel
      (source.job_arrival j)
      (target.job_arrival j)
```

因此，这个例子非常明确地说明：

$$
\boxed{
\text{Typeclass correspondence}
=
\text{structure / field correspondence}
}
$$

而不是：

$$
\boxed{
P_{\text{source}}\leftrightarrow P_{\text{target}}
}
$$

因为 typeclass 本身不是 theorem proposition；验证的是 **两个 class instance 的对应字段，在对应输入下是否产生对应输出**，再进一步用 import/export 和 roundtrip certificate 验证整个 structure correspondence。



## `ImportedJobArrival` 与桥接构造的准确含义

**`ImportedJobArrival` 指真实 Lean class 导入 Rocq 后的类型；构造和证明都在 Rocq 验证文件中完成。**

## 1. 两边的 Class 分别要求什么？

```text
RocqJobArrival：
  提供一个函数 job_arrival : Job → RocqInstant

ImportedJobArrival：
  提供一个函数 job_arrival : Job → ImportedInstant
```

**Class 只规定必须提供什么字段，并没有规定每个 job 的到达时间具体是多少。** 具体的到达时间由某个 instance 自己提供。

## 2. 给定 Source Instance，构造对应的 Target Instance

假设已经有：

```text
arrivalR : RocqJobArrival
```

验证文件使用 **target type 已有的 constructor** 创建一个新的 instance：

```coq
(* 简化名称后的示意 *)
Definition import_job_arrival
    (arrivalR : RocqJobArrival) : ImportedJobArrival :=
  ImportedJobArrival_mk
    (fun j =>
      instant_to_imported (rocq_job_arrival arrivalR j)).
```

意思是：新 instance 的 `job_arrival` 字段被定义成：

```text
读取 source instance 的到达时间
        ↓
instant_to_imported
        ↓
作为 target instance 的到达时间
```

例如：

| job | Source instance 返回 | 新构造的 Target instance 返回 |
|---|---|---|
| A | Rocq 的 `3` | imported 的 `3` |
| B | Rocq 的 `7` | imported 的 `7` |

这里**没有修改 Lean 的 class，也没有修改它的字段读取操作**；只是使用 import 后已有的 constructor，创建了一个新的 `ImportedJobArrival` instance。

## 3. 证明这个新 Instance 对所有 Job 都对应

```coq
(* 简化名称后的示意 *)
Lemma job_arrival_import_certificate
    (arrivalR : RocqJobArrival) :
  forall j,
    instant_to_imported (rocq_job_arrival arrivalR j)
    =
    imported_job_arrival (import_job_arrival arrivalR) j.
Proof.
  intros j.
  exact (eq_refl _).
Qed.
```

右边：

```text
imported_job_arrival (import_job_arrival arrivalR) j
```

就是读取刚刚构造出来的新 target instance 的字段。

按照 `import_job_arrival` 的定义展开后，目标变成：

```text
instant_to_imported (rocq_job_arrival arrivalR j)
=
instant_to_imported (rocq_job_arrival arrivalR j)
```

因此：

```coq
intros j.
exact (eq_refl _).
```

就足够了。

## 4. 这个 Certificate 证明了什么？

它证明的是：

> 对任意 source instance `arrivalR`，通过 `import_job_arrival arrivalR` 构造出来的 target instance，对所有 job 都给出对应的到达时间。

也就是：

```text
source instance
arrivalR
   │
   │ job_arrival j
   ▼
Rocq instant
   │
   │ instant_to_imported
   ▼
Imported instant
   │
   │ 填入 target constructor
   ▼
target instance
import_job_arrival arrivalR
```

并且对于任意 `j`：

```text
target.job_arrival j
=
convert(source.job_arrival j)
```

## 5. 这个 Certificate 没有证明什么？

它**没有证明任意两个独立定义的 `JobArrival` instance 都对应**。

例如，如果另一个独立的 target instance 定义成：

```text
A → 9
```

而 source instance 是：

```text
A → 3
```

那么这两个 instance 显然不对应，必须另外建立 relation 并证明。

因此，certificate 的准确含义是：

> **“这个 bridge constructor 保留了所有 job 的 arrival time”，而不是“任意两个 `JobArrival` instance 都相同”。**

最核心的区别是：

```text
不是：

任意 arrivalR
任意 arrivalL
      ↓
它们天然对应
```

而是：

```text
给定 arrivalR
      ↓
用明确的转换规则
构造 arrivalL
      ↓
证明这个构造出来的 arrivalL
和 arrivalR 的所有字段都对应
```