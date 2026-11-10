在后面的规则中，经常会出现 `parameter`、`index`、`non-uniform parameter`。先区分前两个。
### Parameter：贯穿整个 Datatype 的类型参数
```
Inductive mylist (A : Type) : Type := ...
```
其中 `A` 就是 Parameter。
对于 `mylist nat`，它的 `nil` 和 `cons` 都围绕同一个元素类型 `nat` 构造列表。

### Index：类型本身还携带额外信息
例如我们定义一个长度固定的 List：
```
Inductive vec (A : Type) : nat -> Type :=
| vnil : vec A 0
| vcons : forall n : nat,
    A -> vec A n -> vec A (S n).
```
这里的 `vec` 具有：
- `A`：Parameter，表示元素类型。
- `n : nat`：Index，表示 List 的长度。
例如：
```
vec nat 0    长度为 0 的自然数列表
vec nat 3    长度为 3 的自然数列表
```
最关键的是，Index 可以随着构造器变化。
例如 `vcons`：
```
vcons : forall n,
  A -> vec A n -> vec A (S n)
```
它接收一个长度为 `n` 的 Vector，再添加一个元素，得到长度为 `S n` 的 Vector。
翻译器必须保留这一关系，不能只生成一个没有长度信息的普通 List。

对应的 Lean 类型可以表示为：

```
inductive Rocq.vec (A : Type u) : Nat → Type u where
  | vnil : Rocq.vec A 0
  | vcons (n : Nat) :
      A → Rocq.vec A n → Rocq.vec A (Nat.succ n)
```

这是普通 Inductive 生成机制已经需要处理的内容，并不意味着所有 Indexed Datatype 都要额外设计一套独立的翻译规则。