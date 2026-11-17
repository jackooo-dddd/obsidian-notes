`proof-workflow.ts` 是 ProsaBuddy 的证明工作流管理中心 
`coq_session` 负责试证明，`edit` 负责修改证明代码，`checkpoint` 负责检查证明进度，`task` 负责把子目标交给其他 agent。`proof-workflow.ts` 负责规定这些工具应该遵守什么规则，如何衔接起来。`proof-workflow` 主要管理六件事：
1. Proof Region：把一个大 theorem 拆成多个可独立证明的局部区域。
2. Proof Status：记录哪些区域还没证明、正在证明、已经验证，或者遇到了困难。
3. Dependencies：确定哪些子目标必须等其他子目标完成之后才能开始。
4. Validation：判断一个局部证明是否真的经过编译验证。
5. Scheduling：决定哪个 region 现在可以交给 subagent。
6. Recovery：证明失败后，保留已经验证的进度，决定从哪里继续，而不是每次从头证明。

| Tool          | 它自己负责什么                                  | 它向 `proof-workflow.ts` 获取什么                                    |
| ------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `coq_session` | 让 agent 查看当前 goal、hypotheses，尝试执行 tactic | 当前允许进入哪个 proof region、它的起始上下文和预期 goal、是否存在需要恢复的 compiler error |
| `checkpoint`  | 调用 Coq 编译器，判断本次检查成功或失败                   | 证明进度是否真实提高、是否满足最终完成条件                                          |
| `task`        | 创建 lemma subagent，传递任务，运行子代理并接收结果        | 哪个 region 可以委派、依赖是否完成、子代理能修改哪里，以及什么时候允许恢复或转交                   |
| `edit`        | 将 agent 生成的 proof code 应用到源码或暂存草稿        | 当前修改是否合法、是否修改了别人的 region、是否违反证明顺序、是否允许接管正在运行的 region           |
- `proof-workflow.ts` 主要负责规则与状态；真正的文件版本管理则由 `proof-edit-transaction.ts` 负责。例如 agent 修改了一个证明，`edit` 需要先经过 `proof-workflow.ts` 的范围检查，再通过 `ProofEditTransaction.stage(...)` 保存新的草稿版本。随后 `checkpoint` 会读取这个版本并进行验证。
#### Proof Region 的生命周期
![222](data:image/svg+xml;charset=utf-8,%3Csvg%20font-family%3D%22-apple-system-body%2C%20ui-sans-serif%2C%20-apple-system%2C%20system-ui%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Helvetica%2C%20%26quot%3BApple%20Color%20Emoji%26quot%3B%2C%20Arial%2C%20sans-serif%2C%20%26quot%3BSegoe%20UI%20Emoji%26quot%3B%2C%20%26quot%3BSegoe%20UI%20Symbol%26quot%3B%22%20font-weight%3D%22400%22%20data-d-component%3D%22svg%22%20fill%3D%22currentColor%22%20style%3D%22color%3Argb\(13%2C%2013%2C%2013\)%22%20viewBox%3D%220%200%20340%20292%22%20width%3D%22100%25%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%2273%22%20y%3D%2210%22%20width%3D%22194%22%20height%3D%2243%22%20rx%3D%228%22%20fill%3D%22%2353677e%22%20fill-opacity%3D%220.12%22%20stroke%3D%22%237f93a9%22%20stroke-width%3D%221.2%22%2F%3E%3Ctext%20x%3D%22170%22%20y%3D%2227%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Epending%3C%2Ftext%3E%3Ctext%20x%3D%22170%22%20y%3D%2242%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3E%E7%AD%89%E5%BE%85%E8%A2%AB%E5%88%86%E9%85%8D%3C%2Ftext%3E%3Cpath%20d%3D%22M170%2053%20v11%20m-4%20-4%20l4%204%204%20-4%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%221.3%22%2F%3E%3Crect%20x%3D%2273%22%20y%3D%2265%22%20width%3D%22194%22%20height%3D%2243%22%20rx%3D%228%22%20fill%3D%22%2353677e%22%20fill-opacity%3D%220.12%22%20stroke%3D%22%237f93a9%22%20stroke-width%3D%221.2%22%2F%3E%3Ctext%20x%3D%22170%22%20y%3D%2282%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Erunning%3C%2Ftext%3E%3Ctext%20x%3D%22170%22%20y%3D%2297%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Esubagent%20%E6%AD%A3%E5%9C%A8%E8%AF%81%E6%98%8E%3C%2Ftext%3E%3Cpath%20d%3D%22M170%20108%20v11%20m-4%20-4%20l4%204%204%20-4%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%221.3%22%2F%3E%3Crect%20x%3D%2273%22%20y%3D%22120%22%20width%3D%22194%22%20height%3D%2243%22%20rx%3D%228%22%20fill%3D%22%2353677e%22%20fill-opacity%3D%220.12%22%20stroke%3D%22%237f93a9%22%20stroke-width%3D%221.2%22%2F%3E%3Ctext%20x%3D%22170%22%20y%3D%22137%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Eunvalidated%3C%2Ftext%3E%3Ctext%20x%3D%22170%22%20y%3D%22152%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3E%E4%BB%A3%E7%A0%81%E5%B7%B2%E5%86%99%E5%A5%BD%EF%BC%8C%E5%B0%9A%E6%9C%AA%E9%AA%8C%E8%AF%81%3C%2Ftext%3E%3Cpath%20d%3D%22M170%20163%20v11%20m-4%20-4%20l4%204%204%20-4%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-opacity%3D%220.6%22%20stroke-width%3D%221.3%22%2F%3E%3Crect%20x%3D%2273%22%20y%3D%22175%22%20width%3D%22194%22%20height%3D%2243%22%20rx%3D%228%22%20fill%3D%22%23176c53%22%20fill-opacity%3D%220.17%22%20stroke%3D%22%2323866a%22%20stroke-width%3D%221.2%22%2F%3E%3Ctext%20x%3D%22170%22%20y%3D%22192%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Esolved%3C%2Ftext%3E%3Ctext%20x%3D%22170%22%20y%3D%22207%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3E%E8%8E%B7%E5%BE%97%E6%9C%89%E6%95%88%E7%9A%84%E7%BC%96%E8%AF%91%E8%AF%81%E4%B9%A6%3C%2Ftext%3E%3Cpath%20d%3D%22M269%2087%20H310%20V239%20H268%22%20stroke%3D%22%23b9793c%22%20stroke-width%3D%221.4%22%20stroke-dasharray%3D%224%203%22%20fill%3D%22none%22%2F%3E%3Cpath%20d%3D%22M275%20235%20l-7%204%207%204%22%20stroke%3D%22%23b9793c%22%20stroke-width%3D%221.4%22%20fill%3D%22none%22%2F%3E%3Ctext%20x%3D%22315%22%20y%3D%22159%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22%23b9793c%22%20transform%3D%22rotate\(90%20315%20159\)%22%3E%E6%97%A0%E6%B3%95%E8%AF%81%E6%98%8E%20%2F%20%E9%9C%80%E8%A6%81%E5%8D%87%E7%BA%A7%3C%2Ftext%3E%3Crect%20x%3D%2273%22%20y%3D%22247%22%20width%3D%22194%22%20height%3D%2232%22%20rx%3D%227%22%20stroke%3D%22%23b9793c%22%20fill%3D%22%23b9793c%22%20fill-opacity%3D%220.11%22%2F%3E%3Ctext%20x%3D%22170%22%20y%3D%22267%22%20font-size%3D%2212%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Eescalated%20%2F%20repair%3C%2Ftext%3E%3C%2Fsvg%3E)     ![svg+xml;charset=utf-8,%3Csvg%20font-family%3D%22-apple-system-body%2C%20ui-sans-serif%2C%20-apple-system%2C%20system-ui%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Helvetica%2C%20%26quot%3BApple%20Color%20Emoji%26quot%3B%2C%20Arial%2C%20sans-serif%2C%20%26quot%3BSegoe%20UI%20Emoji%26quot%3B%2C%20%26quot%3BSegoe%20UI%20Symbol%26quot%3B%22%20font-weight%3D%22400%22%20data-d-component%3D%22svg%22%20fill%3D%22currentColor%22%20style%3D%22color%3Argb\(13%2C%2013%2C%2013\)%22%20viewBox%3D%220%200%20330%20182%22%20width%3D%22100%25%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%22117%22%20y%3D%228%22%20width%3D%2296%22%20height%3D%2241%22%20rx%3D%227%22%20fill%3D%22%23268769%22%20fill-opacity%3D%220.17%22%20stroke%3D%22%23268769%22%2F%3E%3Ctext%20x%3D%22165%22%20y%3D%2224%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3ERegion%20A%3C%2Ftext%3E%3Ctext%20x%3D%22165%22%20y%3D%2239%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Esolved%3C%2Ftext%3E%3Cpath%20d%3D%22M165%2049%20V70%22%20stroke%3D%22currentColor%22%20stroke-width%3D%221.3%22%20stroke-opacity%3D%22.6%22%2F%3E%3Cpath%20d%3D%22M161%2065%20L165%2071%20L169%2065%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%221.3%22%20stroke-opacity%3D%22.6%22%2F%3E%3Crect%20x%3D%22117%22%20y%3D%2272%22%20width%3D%2296%22%20height%3D%2241%22%20rx%3D%227%22%20fill%3D%22%235880ae%22%20fill-opacity%3D%220.14%22%20stroke%3D%22%235880ae%22%2F%3E%3Ctext%20x%3D%22165%22%20y%3D%2289%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3ERegion%20B%3C%2Ftext%3E%3Ctext%20x%3D%22165%22%20y%3D%22104%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Epending%3C%2Ftext%3E%3Cpath%20d%3D%22M165%20113%20V134%22%20stroke%3D%22currentColor%22%20stroke-width%3D%221.3%22%20stroke-opacity%3D%22.6%22%2F%3E%3Cpath%20d%3D%22M161%20129%20L165%20135%20L169%20129%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%221.3%22%20stroke-opacity%3D%22.6%22%2F%3E%3Crect%20x%3D%22117%22%20y%3D%22137%22%20width%3D%2296%22%20height%3D%2239%22%20rx%3D%227%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-opacity%3D%22.35%22%20stroke-dasharray%3D%224%203%22%2F%3E%3Ctext%20x%3D%22165%22%20y%3D%22153%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3ERegion%20C%3C%2Ftext%3E%3Ctext%20x%3D%22165%22%20y%3D%22167%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Epending%3C%2Ftext%3E%3Ctext%20x%3D%22226%22%20y%3D%2296%22%20font-size%3D%2211%22%20fill%3D%22%235880ae%22%3E%E2%86%90%20%E4%B8%8B%E4%B8%80%E4%B8%AA%E4%BB%BB%E5%8A%A1%3C%2Ftext%3E%3Ctext%20x%3D%22216%22%20y%3D%22162%22%20font-size%3D%2210%22%20fill%3D%22currentColor%22%20opacity%3D%22.65%22%3E%E7%AD%89%20B%20%E5%AE%8C%E6%88%90%3C%2Ftext%3E%3C%2Fsvg%3E|333](data:image/svg+xml;charset=utf-8,%3Csvg%20font-family%3D%22-apple-system-body%2C%20ui-sans-serif%2C%20-apple-system%2C%20system-ui%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Helvetica%2C%20%26quot%3BApple%20Color%20Emoji%26quot%3B%2C%20Arial%2C%20sans-serif%2C%20%26quot%3BSegoe%20UI%20Emoji%26quot%3B%2C%20%26quot%3BSegoe%20UI%20Symbol%26quot%3B%22%20font-weight%3D%22400%22%20data-d-component%3D%22svg%22%20fill%3D%22currentColor%22%20style%3D%22color%3Argb\\(13%2C%2013%2C%2013\\)%22%20viewBox%3D%220%200%20330%20182%22%20width%3D%22100%25%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%22117%22%20y%3D%228%22%20width%3D%2296%22%20height%3D%2241%22%20rx%3D%227%22%20fill%3D%22%23268769%22%20fill-opacity%3D%220.17%22%20stroke%3D%22%23268769%22%2F%3E%3Ctext%20x%3D%22165%22%20y%3D%2224%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3ERegion%20A%3C%2Ftext%3E%3Ctext%20x%3D%22165%22%20y%3D%2239%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Esolved%3C%2Ftext%3E%3Cpath%20d%3D%22M165%2049%20V70%22%20stroke%3D%22currentColor%22%20stroke-width%3D%221.3%22%20stroke-opacity%3D%22.6%22%2F%3E%3Cpath%20d%3D%22M161%2065%20L165%2071%20L169%2065%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%221.3%22%20stroke-opacity%3D%22.6%22%2F%3E%3Crect%20x%3D%22117%22%20y%3D%2272%22%20width%3D%2296%22%20height%3D%2241%22%20rx%3D%227%22%20fill%3D%22%235880ae%22%20fill-opacity%3D%220.14%22%20stroke%3D%22%235880ae%22%2F%3E%3Ctext%20x%3D%22165%22%20y%3D%2289%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3ERegion%20B%3C%2Ftext%3E%3Ctext%20x%3D%22165%22%20y%3D%22104%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Epending%3C%2Ftext%3E%3Cpath%20d%3D%22M165%20113%20V134%22%20stroke%3D%22currentColor%22%20stroke-width%3D%221.3%22%20stroke-opacity%3D%22.6%22%2F%3E%3Cpath%20d%3D%22M161%20129%20L165%20135%20L169%20129%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%221.3%22%20stroke-opacity%3D%22.6%22%2F%3E%3Crect%20x%3D%22117%22%20y%3D%22137%22%20width%3D%2296%22%20height%3D%2239%22%20rx%3D%227%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-opacity%3D%22.35%22%20stroke-dasharray%3D%224%203%22%2F%3E%3Ctext%20x%3D%22165%22%20y%3D%22153%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3ERegion%20C%3C%2Ftext%3E%3Ctext%20x%3D%22165%22%20y%3D%22167%22%20font-size%3D%2210%22%20text-anchor%3D%22middle%22%20fill%3D%22currentColor%22%3Epending%3C%2Ftext%3E%3Ctext%20x%3D%22226%22%20y%3D%2296%22%20font-size%3D%2211%22%20fill%3D%22%235880ae%22%3E%E2%86%90%20%E4%B8%8B%E4%B8%80%E4%B8%AA%E4%BB%BB%E5%8A%A1%3C%2Ftext%3E%3Ctext%20x%3D%22216%22%20y%3D%22162%22%20font-size%3D%2210%22%20fill%3D%22currentColor%22%20opacity%3D%22.65%22%3E%E7%AD%89%20B%20%E5%AE%8C%E6%88%90%3C%2Ftext%3E%3C%2Fsvg%3E)
- unvalidated: 没有 proof hole，但没有有效证书
- solved: 没有 proof hole，而且有与当前源码对应的编译证书
Region 之间的 dependency
- 假设一个 theorem 被拆成三个局部事实 A, B, C. 如果 `B` 依赖 `A`，而 `C` 依赖 `B`，那么即使 `C` 的证明看起来很简单，系统也不能直接安排 `C`，因为依赖尚未完成验证。
- dependency 主要由 `proof-workflow.ts` 里面的函数控制

| 函数                                     | 作用                                                |
| -------------------------------------- | ------------------------------------------------- |
| `dependencyReady()`                    | 判断当前 region 的前置 region 是否已经是 `solved`             |
| `firstReadyUnresolved()`               | 选择当前优先处理的未完成 region                               |
| `planNextSubtask()`                    | 综合状态、失败记录和依赖，决定是启动、恢复、验证还是转入 repair               |
| `assertFreshLemmaAssignmentLocality()` | 在 `task` 真正启动新的 lemma agent 前，检查这次委派是否符合当前区域和顺序约束 |
### 四个 Tool 怎样调用 `proof-workflow.ts`
#### `coq_session`：确定现在应该证明什么
- `coq_session` 主要是用于交互式证明的工具，它的核心功能和 LSP 提供的 Proof State 查询很接近，但不只是 LSP，它还负责确认 Agent 是否有权在当前区域工作，以及源码和交互式证明状态是否仍然一致。
具体流程 (只有 1–3 步是在使用 `coq_session`)：
1. `open`：Lemma Agent 打开分配给自己的 proof region，获取当前 goal 和 hypotheses。
2. `step`：Lemma Agent 提交一个 tactic，让 Coq 执行，然后返回更新后的 proof state。
3. 继续 `step`：根据新的 goal，尝试下一个 tactic，直到所有 goals 都解决，或者遇到错误。
4. `edit`：把已经试验成功的 tactics 写入源文件。
5. `checkpoint`：正式编译和验证修改后的证明。
Lemma Agent 不需要每尝试一个 tactic 就修改一次 `.v` 文件、重新编译整个文件。它可以通过 `step` 在交互式证明会话中探索证明，然后再把成功的 tactics 写回源码。
当 lemma agent 调用
```
coq_session({
  op: "open",
  file: "Theorem3.v",
  theorem: "Theorem3_07",
  scope: "assigned_region"
})
```
它会通过 `proof-workflow.ts` 获取当前的 region assignment，再调用函数 `SessionProofWorkflow.assignedRegionSessionContext(...) `检查当前 agent 是不是被分配到这个 region、前置依赖是否已经证明、region 是否还存在，并获取正确的 proof entry position、预期 goal 和 source fingerprint。随后 `coq_session` 才加载 Coq context，并返回当前的 goal 和 hypotheses。
`coq_session({ op: "step", tactic: "move=> n." })`
- `step` 指的是向当前 Coq 证明会话提交一个 tactic，执行它，查看 Proof State 发生了什么变化。
当 agent 调用 `step` 时，它会先通过 `synchronizeSession()` 检查源码、上下文和 goal 是否仍然同步。不同步时返回 `session_state_desync`，阻止在错误的 proof state 上继续执行 tactic。
- `coq_session` 的 tactic 尝试成功，不等于源码已经获得正式证明证书。 试出来的 tactics 还需要写入源码，再由编译验证。

#### `edit`：判断这次修改能不能被允许
`edit` 保证 agent 在允许的位置修改代码，同时不破坏已经确认的工作。当 subagent 生成证明并调用 `edit` 后，会执行三个检查

|检查|作用|
|---|---|
|`assertLemmaSequentialEditAllowed`|确保 lemma agent 只编辑自己负责的 region，并遵守已验证的 proof prefix，不跳过当前未完成的 proof hole|
|`assertWideAgentRunningRegionEditAllowed`|防止主 prover 随意修改正在被 lemma agent 证明的 region；特殊情况需要显式 takeover|
|`assertBoundProofBodyMutationAllowed`|保护已经绑定的 theorem 范围，阻止越界修改原始证明目标等内容|
检查通过后，真正保存草稿由 `ProofEditTransaction.stage(...) `完成。

#### `checkpoint`：决定这次证明进展是否有效
Agent 写完代码后调用 `checkpoint`，它会编译当前版本，并把结果交给 `proof-workflow.ts`。
checkpoint 使用 ProofWorkflow 里面的 function 进行检查
- `recordLemmaPrefixValidation` 检查局部 lemma 已经验证的前缀是否仍然有效，防止 agent 未验证当前 proof hole 就继续修改后面的内容。
- `recordCompilerResult` 根据当前编译结果更新 region 状态。成功时可以给符合条件的 `unvalidated` region 颁发证书，成为 `solved`；失败时会记录错误，并在必要时让原有证书失效。
- `classifyCoqcSuccess / Failure` 进一步判断这次操作是否真的取得进度，还是只是重复错误、调试性修改，或者已经完成最终 theorem。
- 最终阶段还会执行 theorem gate 和 AST audit。

#### `task`：真正启动和管理 subagent
当系统确定 Region B 可以开始后，`task` 会先调用：
```
SessionProofWorkflow.assertFreshLemmaAssignmentLocality(...)
SessionProofWorkflow.assertProofTaskDispatchAllowed(...)
```
前者验证委派是否符合当前 region 的范围、顺序和依赖；后者检查当前 proof workflow 是否允许启动这个证明任务，例如有没有尚未完成的 repair 或重复委派。
创建子代理之后，`task` 还会调用：
```
SessionProofWorkflow.inheritBoundProofScope(...)
SessionProofWorkflow.bindActiveLemmaAssignment(...)
```
这样子代理就知道自己被分配到了哪个 theorem、哪个 region，以及当前源码版本是什么。
子代理执行完成后，会返回结构化的 `proof_result`，例如 `solved`、`split` 或 `escalate`。`task` 负责解析、检查结果并处理子代理的事务和 submission audit，而 `proof-workflow` 后续根据实际源码、编译证书与结果决定是否继续、恢复或升级到主 prover 修复。



`proof-workflow.ts` 在 Proof Region 建立之后，主要负责管理这些 Region 的整个生命周期（Lifecycle），包括分配、执行、验证、失败恢复，以及最终把各个 Region 的证明组合起来。
- `proof-workflow.ts` 是管理者：决定哪个 Region 可以开始、哪些依赖已满足、当前由谁负责、是否通过验证。
- Subagent 是执行者：负责实际寻找证明、调用工具、编写 tactic。![[mermaid-diagram.png|586]]

| Subagent 调用的 Tool | 自动触发的 Proof Workflow 机制                                 |
| ----------------- | ------------------------------------------------------- |
| `coq_session`     | 检查当前 agent 是否有权进入指定 Region、前置依赖是否已验证、goal 和 source 是否同步 |
| `edit`            | 检查是不是只修改自己的 Region、有没有修改其他 agent 正在证明的区域、有没有破坏已验证的证明    |
| `checkpoint`      | 记录编译结果、更新 Region 状态、颁发或撤销 Validation Certificate        |
| `task`            | 检查是否允许委派、是否有重复任务，并绑定子代理的 Region 和证明上下文                  |
Subagent 不需要主动调用 `proof-workflow.ts`。 它只调用 `edit`、`checkpoint` 等工具，而这些工具的内部实现会自动调用 `SessionProofWorkflow` 的相应函数，执行检查和更新状态。

```
// Subagent 调用 edit
edit({ filePath, oldString, newString })

// edit 内部自动触发
SessionProofWorkflow.assertLemmaSequentialEditAllowed(...)
SessionProofWorkflow.assertBoundProofBodyMutationAllowed(...)

// 检查通过后
ProofEditTransaction.stage(...)
```
- Proof Workflow 并非只管理 Region，也保留 theorem-level 的计划状态、失败恢复、最终完成检查。所有 Region 都变成 `solved` 后，主 prover 仍需要完成整个 theorem 的最终组合与验证。