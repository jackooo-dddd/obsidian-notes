### Prosa v0.6源文件
```
Validation/.work/foundation_slice_1.XXXXXX/
└── source/
    └── behavior/
        └── time.v
```
核心内容：
```
Definition duration := nat.
Definition instant := nat.
```
这个文件不是 Codex 生成的，而是从固定的 Prosa v0.6 commit里copy 进 run directory，而且脚本会检查 SHA256，不一致就直接失败。
### 翻译后的 Lean文件
```
Prosa-Shunqi/
└── Prosa/
    └── Behavior/
        └── Time.lean
```
核心内容：
```
namespace Prosa.Behavior.Time

abbrev duration := Nat
abbrev instant := Nat

end Prosa.Behavior.Time
```
-  translation 做的是 `Rocq: Definition instant := nat.`　→ `Lean: abbrev instant := Nat`
- 现在只能说看起来很合理，还没有完成 validation。

### 编译后的 Lean文件的“编译产物/artifacts”
```
Validation/.work/foundation_slice_1.XXXXXX/
└── olean/
    └── Prosa/
        └── Behavior/
            └── Time.olean
```
- After fresh Lean compile, `Time.lean` becomes `Time.olean`
- Lean 编译后的二进制/内部 artifact. Lean kernel 已经检查过里面的 declaration
- 编译产物是这一轮重新生成的，不依赖以前残留的 .olean 缓存。
- artifact指的是build/compile 之后生成的产物。
### 导出的实际 Lean artifact
```
Validation/.work/foundation_slice_1.XXXXXX/
└── imported/
    └── Time.out
```
- After `lean4export`, `Time.olean` becomes `Time.out`
- `Time.out`是 lean4export 从 `Time.olean `中读取 declaration 然后序列化成一种可以给后续 importer 读取的中间格式
### 把 Lean 导进 Rocq
```
Validation/.work/foundation_slice_1.XXXXXX/
└── imported/
    ├── Time.out
    ├── ImportedTime.v
    └── ImportedTime.vo
```
`ImportedTime.v` 非常简单
```
From LeanImport Require Import Lean.
Lean Import "Time.out".
```
- `From LeanImport Require Import Lean`: 在 Rocq 里加载 `rocq-lean-import` 的导入功能。
- `Lean Import "Time.out"`: 读取 `Time.out` 里面序列化的 Lean declarations，并把它们注册成 Rocq declarations。
- 原来 Lean 里的`Prosa.Behavior.Time.instant,`会在 Rocq environment 里出现一个对应的 imported declaration，例如`Prosa_Behavior_Time_instant`
- 然后 `ImportedTime.v` 被 Rocq 编译, 生成`ImportedTime.vo`, 它是Rocq 编译产物，类似前面 Lean 的 `.olean`。
- 正式验证时会加载原始 Prosa v0.6。于是同一个 Rocq environment 里同时存在原始 Prosa declaration和`翻译后的 Lean → export → import declaration
**Lean 4 的 `Nat` 导进 Rocq 后**，它不是 Rocq 自带的 `nat`，而是 importer 新建的inductive type。
```
Inductive Nat : Set :=
| Nat_zero : Nat
| Nat_succ : Nat -> Nat.
```
```
Original Rocq       ⇒       Lean        ⇒      Lean Imported Rocq
────────────────            ──────────          ─────────────────
Inductive nat : Set :=       inductive nat       Inductive Nat : Set :=
| O : nat                    | zero : nat        | Nat_zero : Nat
| S : nat -> nat.            | succ n : nat      | Nat_succ : Nat -> Nat.
```
- `nat : Set， Nat : Set`, **类型层级一样，结构也一样，但不是同一个 inductive declaration**。所以需要`rocq_nat_to_imported`, `imported_nat_to_rocq`这样的bridge，用来证明` Rocq instant == Imported Lean instant`
`ImportedTime.vo` 并不是把 Lean 代码翻译回原来的 Prosa，而是让 Lean 中实际编译出来的 declarations 以 Rocq declarations 的形式存在，这样才能在 Rocq 内部证明它与原始 Prosa对应。
#### 查看导入Rocq后的文件
不一定能在某个 `.v` 文件里看到一段完整的翻译`Inductive Nat : Set :=.....` 
 - `Nat` 是`Lean Import "Time.out".` 在编译 `ImportedTime.v` 的过程中，由 `rocq-lean-import` 动态注册进 Rocq environment 的 declaration。
- 在`ImportedTime.v`里面只看到`From LeanImport Require Import Lean. 和 Lean Import "Time.out".`
- `ImportedTime.vo`里面确实包含编译后的这些 imported declarations，但 `.vo` 是二进制编译产物，不适合直接打开看源码。
最准确的办法是让 Rocq 自己 `Print`。`Print` 就是查看已经存在于 environment 中 declaration 的标准方法。 新建一个临时文件`PrintImportedNat.v`
```
Require Import ImportedTime.
Print Nat.
Print Nat_zero.
Print Nat_succ.
```
然后跑`rocq compile PrintImportedNat.v`. 
### certificate
certificate 的用处是证明两个 datatype 可以无损地来回转换。
```
Validation/.work/foundation_slice_1.XXXXXX/
└── certificates/
    └── FoundationTimeCertificate.v
```
#### Datatype Correspondence
`Rocq nat`和`Lean Nat 导入 Rocq 后的 Nat`不是同一个datatype。证明往返不变需要定义两个函数`rocq_nat_to_imported : nat -> Nat`, `imported_nat_to_rocq : Nat -> nat`
```
	forall n : nat, (* nat is for Rocq *)
	  imported_nat_to_rocq (rocq_nat_to_imported n) = n.
	forall n : Nat, (* Nat is for Lean *)
	  rocq_nat_to_imported (imported_nat_to_rocq n) = n.
```
这两个函数说明两个类型之间存在一个很强的 correspondence
- `Rocq 0 ⇔ Imported Nat_zero`
- `Rocq S 0 ⇔ Imported Nat_succ Nat_zero`
- certificate 不是证明`nat 和 Nat identical`, 而是证明`nat ≅ Nat`
- 如果存在两个函数 $f : nat \to Nat$ 和 $g : Nat \to nat$，并且对任意 $n : nat$ 和 $m : Nat$ 都满足 $g(f(n))=n$ 以及 $f(g(m))=m$，那么 $f$ 和 $g$ 互为逆函数，因此 `nat` 和 `Nat` 之间建立了一个bijection，可以写成 $\boxed{nat \cong Nat}$。这里的 $\cong$ 可以理解成“这两个类型在元素层面一一对应”。
对于Rocq的`Definition instant := nat.` 和 Lean的`abbrev instant := Nat`, certificate可以借助 bridge 证明`original instant ⇔ imported Lean instant`
-  `Prosa 的 instant t`可以转成`rocq_nat_to_imported t`, 作为 imported Lean instant 使用。
#### 函数certificate：
证明 `original add 和 imported add` 对应
- ` 任意输入 -> 分别运行两边函数 -> 输出仍然对应`
- 对于任何a和b, ` toImported (a + b) = imported_add (toImported a) (toImported b)`
#### proposition / theorem certificate 
证明 `原始 proposition 成立 ⇔ imported proposition 成立`,
- 通过其中类型、运算、参数等的对应，建立整个命题的对应
#### certificate文件
`FoundationTimeCertificate.v` 在建立最底层的语义桥
- certificate 证明“原始 Rocq declaration”和“从 Lean 实际 artifact 导回来的 declaration”在一个明确的 bridge 下具有相同语义。
- 整个验证最终不是在看两边代码长得一样吗？而是在问两边虽然 representation 不一样，但是否对所有对应输入表现一致，并且这种对应能被 Rocq 正式证明？
#### Example: Correspondence between 2 functions
`original add` 和 `imported add`
```
是什么              Original Rocq              Imported Lean
────────────────   ─────────────────────      ─────────────────────

自然数类型          nat                        Nat

自然数 0            O                          Nat_zero

后继 (+1)           S                          Nat_succ

加法类型            original_add :             imported_add :
                    nat → nat → nat            Nat → Nat → Nat

0 + b = b           original_add O b := b       imported_add Nat_zero b := b

(a+1)+b=(a+b)+1     original_add (S a) b :=     imported_add (Nat_succ a) b :=
                      S (original_add a b)        Nat_succ (imported_add a b)
```
 validator accept Correspondence的条件：
(1) 两边 declaration 必须确定. source 真的是 official Prosa v0.6 的 `add`， target 真的是 fresh compiled Lean artifact 导回来的 `imported add`. 不能拿旧 `.olean`、旧 `.out`
(2) 输入和输出类型已经有 bridge
- ` original nat ↔ imported Nat`的Correspondence已被证明
(3) 函数语义 correspondence 必须被正式证明  
```
forall a b : nat,
  rocq_nat_to_imported (original_add a b)
  =imported_add
    (rocq_nat_to_imported a)
    (rocq_nat_to_imported b).
```
- 这个theorem才是`add` correspondence 的主体。
(4)不能依赖验证的 theorem 本身以及assumption boundary 必须符合规则
- 对 `add` 来说，就是 certificate 不能通过直接引用一个已经假定`original_add corresponds imported_add`的 theorem 来完成证明。
- 比较理想的 accepted 状态: [[Certifications For Add]]
如果用了允许的基础 bridge，例如 Prop/SProp foundation，则状态可能是：
`CERTIFIED_WITH_PROP_SPROP_FOUNDATION`但不能有未记录的额外公理。

#### 防止 LLM 作弊式通过
- 防止certificate 通过了，却没有真正证明 translation correspondence
要证明：
```
forall a b,
  bridge (original_add a b) = imported_add (bridge a) (bridge b).
```
如果允许任意假设，LLM 可能直接引入：
```
Axiom add_corresponds :
  forall a b,
    bridge (original_add a b)
    =
    imported_add (bridge a) (bridge b).
```
然后`exact add_corresponds a b.` certificate 会编译通过，但这显然没有验证任何东西。所以这些检查分别是在堵不同的漏洞.
1) `semantic premises = []` 防止把真正要证明的语义对应偷偷塞进 theorem 参数里，相当于假设correspondence成立：, 例如：
```
	Theorem add_correspondence
	  (H :
	    forall a b : nat,
	      toImported (original_add a b)
	      =
	      imported_add (toImported a) (toImported b))
	  :
	  forall a b : nat,
	    toImported (original_add a b)
	    =
	    imported_add (toImported a) (toImported b).
	Proof.
	  exact H.
	Qed.
```
- `semantic_premises` 必须额外检查certificate theorem statement， 看哪些只是 foundation premises，哪些实际上已经包含待证明 semantic fact

2) `source theorem dependency = false` 防止调用原 Rocq 已存在的目标 theorem
- 假设原始 Rocq 有 Theorem original_big_nat_eq0
- Lean 翻译回来有对应的Imported_big_nat_eq0， 现在想证明它们 correspondence。
 错误做法：
```
Theorem big_nat_eq0_certificate : ... .
Proof.
  ...
  exact original_big_nat_eq0.
Qed.
```
- 检查逻辑：certificate proof term → 计算 dependency closure → 有没有 source theorem constant

3) `target theorem dependency = false` 防止直接调用 imported Lean 那边对应的 theorem。例如本来要验证`original_theorem ↔ imported_theorem`, 却直接写`apply imported_theorem.` 这种就失去了验证意义。
假设 imported Lean 里已经有`Imported_big_nat_eq0 :...`
LLM 可能写
```
Theorem big_nat_eq0_certificate : ...
Proof.
  ...
  apply Imported_big_nat_eq0.
Qed.
```
然后 certificate PASS。但本来就是在检查Lean 翻译出来的 `big_nat_eq0`是否和原始 Rocq `big_nat_eq0 `对应, 结果直接拿 Lean theorem 本身作为证明依据。
dependency audit 会看到`certificate depends on Imported_big_nat_eq0`
于是`target theorem self-dependency = true`, reject
```
                    certificate
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
original theorem?              imported theorem?
          │                           │
        NO                          NO

source dep = false          target dep = false
```
- certificate 应该依赖的是更底层的`Nat correspondence, List correspondence, add correspondence, comparison correspondence...`然后自己推导出当前 theorem correspondence。
4) `unexpected assumptions = []`用来检查`Axiom, Admitted, Parameter, 未批准的 Prop/SProp bridge, statement-only exported theorem, 其他全局假设`有没有混进 proof dependency。
- 这一项最接近`Print Assumptions certificate_name.`
假设 LLM 偷偷写：
```
Axiom magic_add :
  forall a b,
    toImported (original_add a b)
    =
    imported_add (toImported a) (toImported b).
```
然后：
```
Theorem add_correspondence : ...
Proof.
  exact magic_add.
Qed.
```
certificate 编译`PASS`。 但`Print Assumptions add_correspondence.`会暴露类似：
`Axioms:magic_add :forall a b, ...`, classifier 就得到：
`unexpected_assumptions = [magic_add]` 然后 reject。
- 在当前的设计里，不是所有 assumption 都一刀切。例如` Time certificate` 里面 importer 的`Lean.eq definitional UIP`, 被明确分类成`ALLOWED_IMPORTER_FOUNDATION`,  不会进入unexpected assumptions

`certificate compile PASS`只说明Rocq 接受这个 proof term。
`semantic premises = [], source dependency = false, target dependency = false, unexpected assumptions = []` 是在说明这个 proof term 不是靠“把答案当前提”“直接引用答案”“偷偷加 axiom”得到的。
