当我们要创建一个具体的列表值时，主要使用 Constructors（`nil` 和 `cons`）；当我们要声明一个列表的类型时，主要使用 `list` 本身。
```
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```

### 什么时候使用 `list` 本身？
当我们需要表示“一个列表类型”时，使用 `list`。
```
(* 声明一个变量 xs，它是自然数列表 *)
Variable xs : list nat.

(* 定义一个函数，输入列表，返回自然数 *)
Definition length (xs : list nat) : nat := ...

(* 定义一个函数，输入列表，返回列表 *)
Definition copy (xs : list nat) : list nat := ...
```
`list nat`表示一种类型，而不是具体的列表值。可以把 `list` 理解成类型层面的函数：
```
list : Type -> Type # 输入 `nat`，得到类型 `list nat`。
```

### 什么时候使用 Constructors？
当我们需要创建 `list nat` 类型的具体值时，使用 `nil` 和 `cons`。
```
@nil nat
```
得到一个空列表：
```
[] : list nat
```

或者：
```
@cons nat 1 (@nil nat)
```
得到：
```
[1] : list nat
```

再比如：
```
@cons nat 1 (@cons nat 2 (@nil nat))
```
得到：
```
[1; 2] : list nat
```
这些都是具体的列表值。

### 实际上，二者通常一起使用
例如，我们要定义一个函数，给列表前面加一个元素：
```
Definition prepend (A : Type) (x : A) (xs : list A) : list A :=
  cons x xs.
```
拆开：

|表达式|作用|类型层面还是值层面|
|---|---|---|
|`A : Type`|声明类型参数|类型层面|
|`xs : list A`|声明输入是一个列表|类型层面|
|`: list A`|声明函数返回一个列表|类型层面|
|`cons x xs`|构造一个具体列表值|值层面|

#### 两者最大的区别

|        | `list`                     | `nil`、`cons`      |
| ------ | -------------------------- | ----------------- |
| 属于什么   | Inductive Type Constructor | Data Constructors |
| 用来做什么  | 定义、使用列表类型                  | 构造列表值             |
| 输入     | 类型 `A`                     | 元素、已有列表           |
| 输出     | 类型 `list A`                | 属于 `list A` 的值    |
| 常见使用位置 | 函数的参数和返回类型                 | 函数 Body、构造表达式     |


## Inductive 开头定义的 Parameters 会自动成为Constructors 的参数
```
Inductive list (A : Type) : Type :=
| nil : list A
| cons : A -> list A -> list A.
```
这里的：
```
(A : Type)
```
是整个 Inductive 的 Parameter，不仅属于 `list`，也会成为 `nil` 和 `cons` 的参数。

因此，完整的 Constructor Types 实际上是：
```
nil  : forall (A : Type), list A

cons : forall (A : Type),
       A -> list A -> list A
```
也就是说，两个 Constructor 都有参数 `A`，只是 Rocq 允许你在声明中省略重复书写它。
#### 为什么调用时要写 `nat`？
看：`@cons nat 1 (@nil nat)`
逐个拆开：

|部分|含义|
|---|---|
|`@cons`|使用 Constructor `cons`，显式提供包括隐式参数在内的参数|
|`nat`|指定 `A = nat`|
|`1`|一个 `nat` 类型的元素|
|`@nil nat`|一个空的 `list nat`|

所以：`@cons nat 1 (@nil nat) : list nat`
这里传入的 `nat` 就是 Inductive 声明开头的那个参数 `A`。
#### 那么必须写 `nat` 吗？
不一定！可以让 Rocq 自动推断。例如，把 `A` 声明成隐式参数：
```
Arguments nil {A}.
Arguments cons {A} _ _.
```
之后就可以写：
```
nil : list nat
```
或者：
```
cons 1 (nil : list nat)
```
Rocq 根据 `1` 的类型及上下文，推断出 `A = nat`。
如果你想显式传入 `A`，仍然可以使用 `@`：
```
@cons nat 1 (@nil nat)
```
这里需要注意：省略 `A` 是否被允许，取决于 Constructor 的隐式参数设置；`@` 的作用就是让这些隐式参数也能显式填写。