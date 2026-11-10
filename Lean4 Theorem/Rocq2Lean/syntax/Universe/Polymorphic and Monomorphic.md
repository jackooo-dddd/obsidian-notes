需要区分两个概念：
1. **Universe Instantiation**：每次调用一个 Polymorphic Definition 时，可以重新选择它的 Universe Levels。
2. **Universe Cumulativity**：允许较低 Universe Level 的类型，在需要较高 Universe Level 类型的位置使用。
Monomorphic 不支持第一种独立实例化，但 Rocq 仍然支持第二种 Cumulativity。
### 1. Monomorphic Definition
考虑一个普通的 Rocq Definition：
```coq
Definition id (A : Type) (x : A) := x.
```

假设 Rocq 为它创建了一个全局 Universe Level `u`，相当于：
```coq
Definition id (A : Type@{u}) (x : A) := x.
```

这里的 `u` 属于全局声明，而不是每次调用时新创建的 Universe Parameter。
例如：
```coq
id nat 3
id bool true
```

这两个调用都可以成功，因为：
```coq
nat  : Set
bool : Set
```
通过 Universe Cumulativity，`Set` 中的类型可以在需要更高 `Type@{u}` 的位置使用。因此，虽然实际输入类型的 Universe Level 较低，但 `id` 自身使用的全局 `u` 并没有改变。

### 2. 如果 Input 的 Universe Level 更高呢？
假设现在有：
```coq
A : Type@{v}
```
调用：
```coq
id A x
```
需要满足：
$$
v \leq u
$$

| Input 的 Universe | Monomorphic `id` 能否接受 |
|---|---|
| `v < u` | 可以，通过 Cumulativity |
| `v = u` | 可以 |
| `v > u` | 不能直接满足当前约束 |

- 但需要注意，Monomorphic 的全局 `u` 不代表定义时已经确定为某个具体整数。Rocq 可以在后续使用过程中为 `u` 增加全局 Universe Constraints，使它足够大。

### 3. Polymorphic Definition 的区别
如果声明为：
```coq
Polymorphic Definition pid (A : Type) (x : A) := x.
```
那么 Universe Level 是声明的参数，可以理解为：
```coq
pid@{u}
```
因此，不同调用可以使用不同的 Universe Instances：
```coq
pid@{u1} A1 x1
pid@{u2} A2 x2
```
其中 `u1` 和 `u2` 可以不同，每次调用可以根据实际输入类型选择相应的 Universe Level。

| 特性 | Monomorphic | Polymorphic |
|---|---|---|
| Universe 来源 | 全局 Universe Level | 声明的 Universe Parameter |
| 每次调用独立实例化 | 不可以 | 可以 |
| 接受更低 Universe 的 Input | 可以（Cumulativity） | 可以（Cumulativity） |
| 不同调用使用不同 Universe Instances | 不可以 | 可以 |
| Universe Constraints | 作用于共享的全局 Levels | 随实例化应用于各次调用 |

### 4. 核心区别
Monomorphic 和 Polymorphic 的区别，并不是能否接受不同 Universe Levels 的输入，而是 Definition 自身的 Universe 能否在每次调用时独立实例化。
- Monomorphic：使用共享的 Global Universe Levels，可以利用 Cumulativity 接受较低层级的输入，但不能为每次调用独立实例化 Universe。
- Polymorphic：使用 Universe Parameters，不同调用可以分别实例化这些参数，同时也支持 Cumulativity。

这也是 Rocq → Lean Translation 中必须区分 Monomorphic Global Levels 和 Polymorphic Universe Parameters 的原因。