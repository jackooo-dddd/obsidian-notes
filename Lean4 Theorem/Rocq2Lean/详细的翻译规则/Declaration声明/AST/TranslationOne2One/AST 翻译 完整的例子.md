## 一、Rocq 一侧
### ① 声明里（源码，Corelib/Init/Peano.v:181）
```coq
Definition lt (n m:nat) := S n <= m.
```

| |写了什么|
|---|---|
|类型|没有写，由 Rocq 自己推出来|
|值|参数写在名字后面 `(n m:nat)`；用的是记号 `<=`|

### ② elaborate 以后，Rocq 内核里存的项
Rocq 把源码补全、展开记号以后，存进内核的是：

|     | 可读写法                                    | 内核内部的写法                                                                                         |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 类型  | `forall (n : nat) (m : nat), Prop`      | `Prod(n, Ind nat, Prod(m, Ind nat, Sort Prop))`                                                 |
| 值   | `fun (n : nat) (m : nat) => le (S n) m` | `Lambda(n, Ind nat, Lambda(m, Ind nat, App(Ind le, [App(Construct(nat, 2), [Rel 2]), Rel 1])))` |

elaborate 做了三件事：
1. 参数 `(n m:nat)` 变成两层 `fun`（Lambda）；
2. 记号 `S n <= m` 展开成 `le (S n) m`；
3. 推出类型：`le (S n) m` 是一个命题，所以整个类型是 `nat → nat → Prop`。

要注意：Rocq 内核内部的编号从 1 开始。n 是 `Rel 2`，m 是 `Rel 1`；S 是 nat 的第 2 号构造子（O 是第 1 号）。
### ③ 打印出来（`Print lt.`）
```text
lt = fun n m : nat => S n <= m
     : nat -> nat -> Prop
```

打印时会重新套上记号，所以又变回了 `S n <= m`。加上 `Set Printing All.` 后，不用记号：

```text
lt = fun n m : nat => le (S n) m
     : forall (_ : nat) (_ : nat), Prop
```

类型里显示成 `_`，是因为 n 和 m 在类型里没有被用到，打印时就省略了名字。内核里存的名字仍然是 n 和 m，导出的 AST 里也能看到。
### ④ MetaRocq 导出的 AST（IR，也就是你给的这两行）
```text
类型：prod(n, ind nat, prod(m, ind nat, sort prop))
值：  lam(n, ind nat, lam(m, ind nat, app(ind le, [app(construct nat 1, [rel 1]), rel 0])))
```

和 ② 是同一个东西，只是 MetaRocq 的编号从 0 开始：

| |Rocq 内核（②）|MetaRocq AST（④）|
|---|---|---|
|n|`Rel 2`|`rel 1`|
|m|`Rel 1`|`rel 0`|
|S|`Construct(nat, 2)`|`construct nat 1`|

这是一个固定的减 1，IR 规范里写明了（`IR_SPEC.md`："Raw kernel `Rel 1` = IR `rel 0`"）。
## 二、Lean 一侧
Lean 这边没有 elaborate 这一步。翻译器直接生成内核级的 Expr，交给 Lean 内核检查。
### ⑤ Lean 内核里的 Expr（翻译器生成，report 中的 `target_type` / `target_value`）
```text
类型：forallE n (const Rocq.…nat) (forallE m (const Rocq.…nat) (sort 0))
值：  lam n (const Rocq.…nat)
        (lam m (const Rocq.…nat)
          (app (app (const Rocq.…Peano.le)
                    (app (const Rocq.…nat.S) (bvar 1)))
               (bvar 0)))
```

编号和 ④ 一样从 0 开始。所以 `rel 1 → bvar 1`、`rel 0 → bvar 0` 可以直接照抄。
### ⑥ 打印出来（`#print`，取自 results/corelib-complete/Corelib/Init/Peano.txt:74）
```lean4
def Rocq.Corelib.Init.Peano.lt :
    Rocq.Corelib.Init.Datatypes.nat → Rocq.Corelib.Init.Datatypes.nat → Prop :=
  fun n m => Rocq.Corelib.Init.Peano.le n.S m
```

`n.S` 是 Lean 打印时的简写，意思是 `Rocq.Corelib.Init.Datatypes.nat.S n`，也就是 `S n`。
## 汇总

|阶段|类型|值|
|---|---|---|
|① Rocq 源码|（没写）|`(n m:nat) := S n <= m`|
|② Rocq 内核|`forall (n m : nat), Prop`|`fun n m => le (S n) m`，编号从 1 开始|
|③ Rocq 打印|`nat -> nat -> Prop`|`fun n m : nat => S n <= m`|
|④ MetaRocq AST|`prod(n, ind nat, prod(m, ind nat, sort prop))`|`lam(n, …, lam(m, …, app(ind le, [app(construct nat 1, [rel 1]), rel 0])))`，编号从 0 开始|
|⑤ Lean 内核 Expr|`forallE n Rocq.nat (forallE m Rocq.nat (sort 0))`|`lam n … (lam m … (app (app le (app S (bvar 1))) (bvar 0)))`|
|⑥ Lean 打印|`nat → nat → Prop`|`fun n m => le n.S m`|

需要比较的是 ④ 和 ⑤，也就是两个内核里实际存的东西。① ③ ⑥ 都是给人看的写法，带着记号和简写，不能直接拿来比较。
## 三. 两棵树并排以及逐个节点的翻译过程
## type 树

```text
源树 S                                   目标树 T

prod n                 ── 节点 T02 ──►   forall n
├─ ind nat             ── 叶子 T03 ──►   ├─ const Rocq.…nat
└─ prod m              ── 节点 T02 ──►   └─ forall m
   ├─ ind nat          ── 叶子 T03 ──►      ├─ const Rocq.…nat
   └─ sort prop        ── 叶子 U02 ──►      └─ sort 0
```

|#|在 lt 的类型里是哪部分|Rocq AST 节点|换成 Lean Expr|怎么换|
|---|---|---|---|---|
|1|整个类型 `∀ n : nat, …`："先接受一个 nat，叫它 n"|`prod(n, nat, …)`|`forall n : Rocq.nat, …`|组合节点，照搬。里面多了一个变量 n|
|2|n 的类型 `nat`|`ind nat`|`Rocq.nat`|叶子：换成之前翻译好的 nat|
|3|剩下的部分 `∀ m : nat, Prop`："再接受一个 nat，叫它 m"|`prod(m, nat, …)`|`forall m : Rocq.nat, …`|组合节点，照搬。里面又多了一个变量 m|
|4|m 的类型 `nat`|`ind nat`|`Rocq.nat`|叶子|
|5|最后返回的东西 `Prop`|`sort prop`|`Sort 0`|叶子：层按换算表换，Rocq 的 Prop 就是 Lean 的 Sort 0|


#### prod 是什么
**一个 prod 就是"接受一个参数"。** lt 接受两个参数，所以有两层 prod，一层套一层：
```text
prod n : nat          ← 接受第一个参数 n
└─ prod m : nat       ← 接受第二个参数 m
   └─ Prop            ← 两个参数都给了，返回一个命题
```

**每个 prod 装三样东西**，翻译时三样各自对应：

| prod 里的部分 | 第 1 行（外层） | 第 3 行（内层） | 怎么换                       |
| --------- | --------- | --------- | ------------------------- |
| 参数名       | n         | m         | 照抄                        |
| 参数的类型     | `nat`     | `nat`     | 叶子，换成 `Rocq.nat`（第 2、4 行） |
| 返回的类型     | 内层的 prod  | `Prop`    | 继续往下换（第 3、5 行）            |

**这棵树里没有用到变量。** n 和 m 只是被声明了，后面没有出现。所以和值的那棵树不同，这里没有 `rel` 和 `bvar`。值的那棵树里，`le (S n) m` 用到了 n 和 m。
## body 树
```text
源树 S                                   目标树 T

lam n                  ── 节点 T02 ──►   lam n
├─ ind nat             ── 叶子 T03 ──►   ├─ const Rocq.…nat
└─ lam m               ── 节点 T02 ──►   └─ lam m
   ├─ ind nat          ── 叶子 T03 ──►      ├─ const Rocq.…nat
   └─ app              ── 节点 T02 ──►      └─ app
      ├─ ind le        ── 叶子 T03 ──►         ├─ const Rocq.…Peano.le
      ├─ app           ── 节点 T02 ──►         ├─ app
      │  ├─ construct nat 1 (S) ─ T03 ►        │  ├─ const Rocq.…nat.S
      │  └─ rel 1 (n)  ── 叶子 T01 ──►         │  └─ bvar 1 (n)
      └─ rel 0 (m)     ── 叶子 T01 ──►         └─ bvar 0 (m)
```


|#|在 lt 里是哪部分|Rocq AST 节点|换成 Lean Expr|怎么换|
|---|---|---|---|---|
|1|`fun n : nat => …`|`lam(n, nat, …)`|`lam n : Rocq.nat, …`|组合节点，照搬。里面多了一个变量 n|
|2|n 的类型 `nat`|`ind nat`|`Rocq.nat`|叶子：换成之前翻译好的 nat|
|3|`fun m : nat => …`|`lam(m, nat, …)`|`lam m : Rocq.nat, …`|组合节点，照搬。里面又多了一个变量 m|
|4|m 的类型 `nat`|`ind nat`|`Rocq.nat`|叶子|
|5|`le (S n) m`|`app(le, [S n, m])`：函数 le，带两个参数|`app(app(Rocq.le, S n), m)`|组合节点，照搬。Lean 一次只接一个参数，所以两个参数写成两层 `app`|
|6|其中的函数 `le`|`ind le`|`Rocq.Peano.le`|叶子：换成之前翻译好的 le|
|7|第一个参数 `S n`|`app(S, [n])`：函数 S，带一个参数|`app(Rocq.nat.S, n)`|组合节点，照搬。只有一个参数，一层就够|
|8|其中的函数 `S`|`construct nat 1`|`Rocq.nat.S`|叶子：nat 的第 1 号构造子（第 0 号是 O）|
|9|`S n` 里的 `n`|`rel 1`|`bvar 1`|变量：编号照抄（见下）|
|10|第二个参数 `m`|`rel 0`|`bvar 0`|变量：编号照抄（见下）|

#### 变量的编号怎么读
第 5 至 10 行都在两层 `fun` 里面，这时能用的变量是 n 和 m。编号从最近的那层往外数：
```text
fun n => fun m => …
    ↑        ↑
  rel 1    rel 0        （最近的是 m，再往外是 n）
```
Lean 也按同样的方式编号，所以 `rel 1 → bvar 1`、`rel 0 → bvar 0`，编号直接照抄。

#### lam 是什么

**一个 lam 就是"拿到一个参数"。** lt 拿两个参数，所以有两层 lam，一层套一层：
```text
lam n : nat               ← 拿到第一个参数 n
└─ lam m : nat            ← 拿到第二个参数 m
   └─ le (S n) m          ← 两个参数都拿到了，返回这个命题
```

**每个 lam 装三样东西**，翻译时三样各自对应：

|lam 里的部分|外层|内层|怎么换|
|---|---|---|---|
|参数名|n|m|照抄|
|参数的类型|`nat`|`nat`|叶子，换成 `Rocq.nat`|
|返回的值（body）|内层的 lam|`le (S n) m`|继续往下换|


#### 和 prod 对照

| |prod（类型）|lam（值）|
|---|---|---|
|参数名|n、m|n、m（相同）|
|参数的类型|`nat`、`nat`|`nat`、`nat`（相同）|
|第三样|返回的类型：最里面是 `Prop`|返回的值：最里面是 `le (S n) m`|
|用到变量吗|没有|有：`le (S n) m` 用到了 n 和 m|

两边前两样完全一样，第三样也是配对的：`le (S n) m` 的类型正是 `Prop`。所以值 `fun n m => le (S n) m` 的类型就是 `forall n m, Prop`。

## Lean 内核怎么检查翻译结果
翻译出来的声明要交给 Lean 内核检查。lt 里只出现三种组合节点，内核对每种节点各用一条规则。这三条就是类型论里 **Π 类型（函数类型）的三条标准规则**：

|规则|回答的问题|节点|规则内容|
|---|---|---|---|
|**形成**|什么样的函数类型是合法的|`forallE`（Rocq 叫 `Prod`）|A 是类型，并且在有了 x : A 之后 B 也是类型，那么 `∀ x : A, B` 是类型|
|**引入**|怎么造出一个函数|`lam`|有了 x : A 之后，body 的类型是 B，那么 `fun x => body` 的类型是 `∀ x : A, B`|
|**消去**|怎么使用一个函数|`app`|f 的类型是 `∀ x : A, B`，参数 a 的类型是 A，那么 `f a` 的类型是 B|

"形成、引入、消去"是 Martin-Löf 类型论的标准说法。**Rocq 内核用的也是这三条规则**，所以 Rocq 能通过的检查，翻译到 Lean 以后也能照样通过。

下面按这三条规则把 lt 检查一遍。
#### 第一步：检查类型 `∀ (n : nat) (m : nat), Prop`（用形成规则）

```
forallE n : nat           外层：nat 是类型 ✓，再检查里面 ↓
└─ forallE m : nat        内层：nat 是类型 ✓，再检查里面 ↓
   └─ Prop                Prop 是类型 ✓
```

每层都满足形成规则，所以 `nat → nat → Prop` 是一个合法的类型。
#### 第二步：检查值 `fun (n : nat) (m : nat) => le (S n) m`（用引入规则）

```
lam n : nat               参数类型 nat 是类型 ✓，记下 n : nat
└─ lam m : nat            参数类型 nat 是类型 ✓，记下 m : nat
   └─ le (S n) m          在有了 n、m 的前提下，算出 body 的类型 → 见第三步
```

如果 body 的类型是 `Prop`，那么由引入规则，整个值的类型就是 `nat → nat → Prop`。
#### 第三步：算出 body `le (S n) m` 的类型（用消去规则，从里往外）

|这一步|函数要求的参数类型|实际给的参数|结果的类型|
|---|---|---|---|
|`S n`|S 要求 nat|n，是 nat |nat|
|`le (S n)`|le 要求 nat|`S n`，是 nat |一个"再要一个 nat，然后给出命题"的函数|
|`le (S n) m`|要求 nat|m，是 nat |Prop|

表里每个东西的类型从哪里来：
- **n、m 的类型**：从第二步记下的上下文里查；
- **S、le 的类型**：从之前翻译好的声明里查。

所以 body 的类型是 `Prop`。
#### 第四步：和声明的类型比较
第二步推出值的类型是 `nat → nat → Prop`，和第一步检查过的声明类型**一致**，Lean 内核接受 lt。

---

**小结**：lt 的检查用到了全部三条 Π 规则：类型用形成规则，两层 `lam` 用引入规则，三次 `app` 用消去规则。两边内核实现的是同一组规则，所以 Rocq 里的每一步检查，在 Lean 里都能一一照着走。
<small>注：一般情况下，消去规则的结果类型是"把 B 里的 x 换成实际参数"，lt 里的函数都是普通函数，所以直接就是输出类型。"参数类型和要求的一致"、"和声明的类型一致"都允许先计算再比较（按定义相等），lt 里两边字面上就相同。</small>

---


## 四. 为什么两边对应
### (a) 结构相同（T1）
形状、位置、变量编号都相同，只有叶子按字典换了名字：

| 源叶子               | 目标叶子              | 依据                       |
| ----------------- | ----------------- | ------------------------ |
| `ind nat`         | `Rocq.…nat`       | 第 1 条声明（导出顺序中排第 1）       |
| `ind le`          | `Rocq.…Peano.le`  | 第 18 条声明                 |
| `construct nat 1` | `Rocq.…nat.S`     | nat 的第 1 号构造子，随 nat 一起生成 |
| `sort prop`       | `sort 0`          | sort 映射 I                |
| `rel 1`、`rel 0`   | `bvar 1`、`bvar 0` | 两边上下文都是 `[n, m]`         |

`lt` 排第 20 条，它引用的 nat（第 1 条）和 le（第 18 条）都在它前面，符合 T4。
### (b) 类型正确（T2）
两边的类型检查一步一步对得上，用的是同一套规则：

|Rocq|Lean|
|---|---|
|`S : nat → nat`，`n : nat` ⊢ `S n : nat`|`Rocq.nat.S : Rocq.nat → Rocq.nat`，`n : Rocq.nat` ⊢ `Rocq.nat.S n : Rocq.nat`|
|`le : nat → nat → Prop` ⊢ `le (S n) : nat → Prop`|`Rocq.le : Rocq.nat → Rocq.nat → Prop` ⊢ `Rocq.le (S n) : Rocq.nat → Prop`|
|`m : nat` ⊢ `le (S n) m : Prop`|`m : Rocq.nat` ⊢ `Rocq.le (S n) m : Prop`|
|加上 `fun m`：`nat → Prop`|加上 `fun m`：`Rocq.nat → Prop`|
|加上 `fun n`：`nat → nat → Prop`，等于声明的 type |加上 `fun n`：`Rocq.nat → Rocq.nat → Prop`，等于翻译后的 type |

### (c) 行为相同（T3）
`lt` 是透明定义，两边都可以展开：

```text
Rocq:  lt 2 5   ⇝δ  (fun n m => le (S n) m) 2 5   ⇝β  le 3 5
Lean:  Rocq.lt 2 5  ⇝δ  (fun n m => Rocq.le (S n) m) 2 5  ⇝β  Rocq.le 3 5
```

每一步都是对面那一步的翻译。所以 Rocq 里任何"靠展开 lt 才成立"的推理（例如证明 `lt n m` 时先 `unfold lt`），在 Lean 里都同样成立。
### (d) 意思
两边说的都是"n < m 的意思是 n+1 ≤ m"：
- `le` 和 `nat` 是之前已经确认的叶子；
- λ、应用的意思两边相同；
- 所以整个定义的意思相同。

