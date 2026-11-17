#### Audit
`certificates/FinishTimeAssumptionAudit.v`: 对各个 correspondence theorem 执行 `Check` 和 `Print Assumptions`，并给输出加开始、结束标记

`audit/finish_time_assumption_config.json`:` 指定允许的 foundation、源/目标声明名称、需要识别的语义前提名称。定义哪些依赖允许出现，哪些应当被标记。

`audit/audit_assumptions.py:` 解析日志，把依赖分成 foundation、statement-only、semantic premise、unexpected 等类别。

`certificates/FinishTimeExactTypeGuards.v` 将实际源 theorem 和 imported theorem，在指定参数下，分别检查为预期的 statement 类型,  检查准备比较的 statement 与实际 theorem 类型是否匹配。

`audit/publish_analysis_finish_time.py` 综合检查源码版本、兼容补丁、Lean 公理输出、导出配置、哈希、编译时间戳和证书审计结果。


`finish_time_lean_axioms_published.txt`
- 记录原来的 `Lean declarations / theorems`自己依赖哪些 Lean axioms
```
finished_at_finish_time
depends on axioms:
[propext, Classical.choice, Quot.sound]
```
表示 proof term 经过所有 dependency 展开之后，最终会碰到这三个 Lean 基础公理。
- 注意，这里是lean theorem自己的proof，而不是correspondence的proof

##### `finish_time_assumptions_published.txt`
文件先打印了 correspondence theorem 本身，例如：
```
finish_time_correspondence : ...
finished_at_finish_time_statement_correspondence : ...
earliest_finish_time_statement_correspondence : ...
completes_at_finish_time_statement_correspondence : ...
response_time_correspondence : ...
```
例如 `finished_at_finish_time_statement_correspondence` 的目标明确是：
```
PropSPropFoundation.PropSPropRel
  (completed_by schedR j (finish_time schedR j RR HR))
  (eq
     (Prosa_Behavior_Service_completed_by ...)
     Bool_true)
```
- 然后文件后半段就是对 correspondence certificate 的 assumptions 原始输出做 assumption audit
```
AUDIT_BEGIN finished_at_finish_time
Axioms:
...
propext
...
PropSPropFoundation.interpret_strict
...
Quot_sound
Classical_choice
AUDIT_END finished_at_finish_time
```
> 证明 `finished_at_finish_time_statement_correspondence` 这个 correspondence theorem 时，最终 proof term 依赖了哪些公理？

#### `finish_time_assumption_summary_published.json`
`finish_time_assumptions_published.txt` 主要保存 **Rocq 原始的 `Print Assumptions` 输出**，也就是记录最终的 correspondence proof / certificate 实际依赖了哪些 axioms；
 `finish_time_assumption_summary_published` 则是在此基础上经过 audit script 的进一步分析、分类和检查。它不仅列出依赖项，还会回答这些 axioms 分别属于什么类别、是否出现危险或未预期的额外依赖、certificate 是否偷用了 source theorem 或 target theorem 本身的 proof，以及最终该 certificate 是否满足审计策略、可以被接受。

