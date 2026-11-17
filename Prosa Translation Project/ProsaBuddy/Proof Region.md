Proof Region 是 ProsaBuddy 自己定义的一种可编辑区域标记。它告诉系统某一段 proof 属于哪个 lemma agent，并规定这个 agent 只能修改这一段。
比如 Layer 1 prover 先生成 `H1 这个局部命题需要证明`
然后把它包成一个 region：
```
proof_region begin
    H1 的 statement
    H1 的 proof
proof_region end
```
之后 scheduler 就可以把这个 region 交给 lemma agent。lemma agent 只能改这个 region，外面的 theorem skeleton 不应该碰。Coq 可以依靠：
```
(* proof_region begin *)
have H : P.
{
  ...
}
(* proof_region end *)
```
这里 `{` 和 `}` 是非常清楚的物理边界, `{ → proof 开始, } → proof 结束`

Lean 里面虽然不能用 `{` 和 `}` 来判断边界，但是可以用缩进层级来判断边界。
判断边界的思路：先找到proof 一开始的这一行的缩进层级 (`:= by`)，然后一直往下读，直到遇到“缩进退回到这个 declaration 的层级”的下一条语句。我们就知道了这是在另外一个proof的region了。
比如有两段：
```
theorem demo (P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q := by
  -- proof_region begin: region_1
  have h1 : P := by
    exact hP
  -- proof_region end: region_1

  -- proof_region begin: region_2
  have h2 : Q := by
    exact hQ
  -- proof_region end: region_2

  exact ⟨h1, h2⟩
```
这里可以把缩进看成：
```
0 theorem demo ... := by
2   have h1 : P := by
4     exact hP

2   have h2 : Q := by
4     exact hQ

2   exact ⟨h1, h2⟩
```
- 对于第一段, parser 先看到 ` have h1 : P := by`, 这个 `have` 的起始缩进是 **2 spaces**。
- 然后下一行` exact hP` 缩进是 **4 spaces**，说明它仍然属于这个 `by` block。
- 接着遇到 ` have h2 : Q := by`.  缩进重新回到 2 spaces：2 <= 2, 于是 parser 就知道`h1` 的 `by` proof 到这里结束了。

个非常简化的 detector 可以是：
```
1. 找到目标：
   have hQ : Q := by

2. 记录：
   baseIndent = 2

3. 从下一行开始扫描

4. 如果：
   当前行是空行/comment
   → 继续

5. 如果：
   currentIndent > baseIndent
   → 仍然属于这个 by block

6. 如果：
   currentIndent <= baseIndent
   → 当前 by block 结束
```


让主 agent 强制生成一个带最外层 `()` 的局部证明模板，而不是让 parser 去猜缩进。

例如，主 `prover` 生成：

```
theorem demo (P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q := by
  -- proof_region begin: region_1
  have h1 : P := (by
    sorry
  )
  -- proof_region end: region_1

  -- proof_region begin: region_2
  have h2 : Q := (by
    sorry
  )
  -- proof_region end: region_2

  exact ⟨h1, h2⟩
```

这是合法的 Lean 4 写法。

之后 `lemma` agent 只修改括号内部：

```
  have h1 : P := (by
    exact hP
  )
```

这样做有三个好处：

1. 边界明确：通过匹配最外层 `(` 和对应的 `)`，可以定位完整的局部 proof term，不必仅依赖缩进。
    
2. 方便限制编辑范围：`lemma` agent 只允许替换 `(by ... )` 内部的证明，而不能修改 `have h1 : P` 的 statement。
    
3. 方便创建 skeleton：主 agent 统一生成 `(by sorry)`，子 agent 逐个填充，整体结构不变。
    

需要注意的只有两点：

- 括号要正确匹配：proof 内部也可能有嵌套 `()`，parser 要找到与最外层左括号对应的右括号，而不是遇到第一个 `)` 就停止。
    
- 保留 region marker：外面的 `proof_region begin/end` 可以继续用于记录 `region_id`、owner、dependency 等信息；`()` 则用于明确限定 proof body。
    

所以可以直接给 Lean ProsaBuddy 制定这样的规则：

> Layer 1 prover 创建每个局部 `have` subproof 时，统一使用 `have h : P := (by sorry)` 格式。Layer 2 lemma agent 必须保留最外层括号和 `have` statement，只能修改括号内部的证明。

这完全可行，而且比要求所有 agent 自由生成 Lean 缩进结构，再由我们解析边界，要简单得多。 仍然需要正确处理括号嵌套，但不需要专门靠缩进来寻找 proof 的结束位置。