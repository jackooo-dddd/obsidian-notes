在 **Rocq** 里，`typeclass `通常用 `Class` 定义，用 `Instance` 提供实例。
```
Class JobArrival (Job : Type) := {
  job_arrival : Job -> nat
}.
```
 `JobArrival Job` 可以理解成：“对于这个 `Job` 类型，我还需要一份额外的信息：怎么得到 job 的 arrival time。”
- `JobArrival Job` 本身是一个类型，而一个具体的 `typeclass instance`，就是这个类型的一个值。
```
例如：
Instance my_job_arrival : JobArrival MyJob := {
  job_arrival := fun j => ...
}.
```
意思是对 `MyJob`，提供了一套 `JobArrival` 的实现。
- `Context {JobArrival Job}.` 大致可以理解成 `Context (arrival_instance : JobArrival Job).` 区别只是 `{...}` 会让 Rocq 的 `typeclass` mechanism 自动找 `arrival_instance`。

##### Lean 里面的对应机制
```
class JobArrival (Job : Type) where
  job_arrival : Job → Nat
  
具体实例写：
instance : JobArrival MyJob where
  job_arrival := fun j => ...
```
Lean 和 Rocq 的普通参数：`(Job : Type)`
`Rocq typeclass 参数：{JobArrival Job}`
`Lean typeclass 参数：[JobArrival Job]`
```
例如 Lean 中
def f [JobArrival Job] (j : Job) :=
  job_arrival j
```
没有显式写`job_arrival someInstance j,` 但是 Lean  会通过 `[JobArrival Job]` 自动找到那个 instance。

`Typeclass` 本质上是一个隐式传入的结构/实例参数，Rocq 用 `Class` + `Instance`，Lean 用 `class` + `instance`；在 theorem 里，Rocq 的 `{...}` 大致对应 Lean 的 `[...]`。