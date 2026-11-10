### Rocq.list.{?s} A 是什么意思？
假设我们之前已经把 Rocq 的 `list` 翻译成 Lean：
```
inductive Rocq.list.{s} (A : Sort s) :
    Sort (max 1 s) where
  | nil : Rocq.list A
  | cons : A → Rocq.list A → Rocq.list A
```
这里的 `s` 是 `Rocq.list` 自己声明的 Universe Parameter。
当我们使用它时，需要实例化这个 `s`。
例如：`Rocq.list.{1} Nat`
表示：
- `Rocq.list`：已经定义好的类型构造器。
- `.{1}`：将 `Rocq.list` 的 Universe Parameter `s` 实例化为 `1`。
- `Nat`：实际传入的类型参数 `A`。
- 所以：`Rocq.list.{1} Nat : Sort 1`
如果暂时不知道这次应该选择哪个 Universe Level，就使用：
```
Rocq.list.{?s} A
```
其中 `?s` 是一个待求解的 Universe Metavariable。
注意，`?s` 不代表输入的 `list`，而是表示这次 `list` 类型构造器的 Universe 实例。
### 那为什么要创建新的 `?s`？
现在来看当前正在翻译的 Inductive：
```
Inductive ListBox (A : Type) : Type :=
| box : list A -> ListBox A.
```
翻译器已经知道：
```
A : Sort r
```
其中 `r` 是当前 `ListBox` 的 Universe Level。

当它遇到 Constructor Field：
```
list A
```
就需要使用之前翻译好的 `Rocq.list`。

但是，`Rocq.list` 是 Universe Polymorphic 的：
```
Rocq.list.{s} : (A : Sort s) → Sort (max 1 s)
```
因此，翻译器必须决定：当前这一次使用 `Rocq.list` 时，应该把它自己的 `s` 实例化成什么？

为了让 Lean 根据实际参数推断，先写：
```
Rocq.list.{?s} A
```
接着 Lean 检查：
```
Rocq.list.{?s} 需要：A : Sort ?s
当前实际传入是 A : Sort r
```
因为 `A` 必须符合 `Rocq.list` 的参数类型要求，所以通过 Unification：
```
Sort ?s = Sort r
     ↓
?s := r
```
最终`Rocq.list.{r} A`
也就是说，`?s` 是临时变量，最终可以由输入参数 `A` 的 Universe Level `r` 确定。

### 为什么不能直接使用 `r`，还要先创建 `?s`？
例如，假设同一个声明中引用了两次 `Rocq.list`：
```
Rocq.list Nat
Rocq.list (Type 0)
```

它们要求不同的 Universe 实例：
```
Rocq.list.{1} Nat
Rocq.list.{2} (Type 0)
```

因此，不能把 `Rocq.list` 定义时的 Universe Parameter 永久固定为某个 Level。
翻译器可以在每次引用时分别创建：
```
第一次引用：Rocq.list.{?s₁} Nat
第二次引用：Rocq.list.{?s₂} (Type 0)
```

经过 Unification：
```
?s₁ := 1
?s₂ := 2
```
注意，两次引用的是同一个 `Rocq.list` Declaration，只是采用了不同的 Universe Instances。