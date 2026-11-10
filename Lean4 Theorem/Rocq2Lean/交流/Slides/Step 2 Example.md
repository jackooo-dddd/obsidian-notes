在 Rocq 中定义一个简单的 Identity Function：

```
Definition id (A : Type) (x : A) : A := x.
```

这里有两个部分：
- Type：`forall (A : Type) (x : A), A`
- Body：`fun (A : Type) (x : A) => x`
经过 Step 2 的 Parser 后，可以用下面的结构来理解它的 `ConstantDecl`：

```
ConstantDecl
│
├── name : "id"
│
├── type : IR.Term
│   └── prod (A : Type)
│       └── prod (x : rel 0)
│           └── rel 1
│
├── body : Option IR.Term
│   └── some
│       └── lam (A : Type)
│           └── lam (x : rel 0)
│               └── rel 0
│
├── universes : UDecl
│   └── monomorphic
│
├── typeDeps : []
└── bodyDeps : []
```

这是便于理解的简化 AST，省略了 `SortIR`、Binder Names 和具体 Universe Levels 的编码。

### 1. Type AST：`prod → prod → rel`

在 `IR.Term` 中，`prod` 表示 Dependent Function Type，也就是 Rocq 的 `forall`。

```
prod (A : Type)
  prod (x : A)
    A
```

它对应：

```
forall (A : Type) (x : A), A
```

这里：

- 第一个 `prod`：声明参数 `A : Type`。
    
- 第二个 `prod`：声明参数 `x : A`。
    
- 最后的 `rel 1`：表示函数的返回类型是 `A`。
    

### 2. Body AST：`lam → lam → rel`

在 `IR.Term` 中，`lam` 表示 Lambda Expression，也就是 Rocq 的 `fun`。

```
lam (A : Type)
  lam (x : A)
    x
```

它对应：

```
fun (A : Type) (x : A) => x
```

这里：

- 第一个 `lam`：接收类型参数 `A`。
    
- 第二个 `lam`：接收一个 `A` 类型的值 `x`。
    
- 最后的 `rel 0`：返回变量 `x`。
    

### 3. 为什么 Type 中是 `rel 1`，而 Body 中是 `rel 0`？

因为 Rocq AST 使用 De Bruijn Index：

- `rel 0`：最近绑定的变量。
    
- `rel 1`：往外一层绑定的变量。
    

对于最内层的 Context：

```
x : A    → rel 0
A : Type → rel 1
```

因此，在 Type 的最终返回类型位置，`A` 是 `rel 1`；而在 Body 的最终表达式位置，`x` 是 `rel 0`。

不过，第二个 `prod` 或 `lam` 中的参数类型 `A` 使用的是 `rel 0`，因为此时 `x` 尚未进入作用域，最近的 Binder 仍然是 `A`。

所以我们可以总结为：

`ConstantDecl` 保存整个 Constant 的信息，而其中的 `type` 和 `body` 分别由 `IR.Term` 的 AST Nodes 组成。对于这个例子，Type 主要由 `prod` 构成，Body 主要由 `lam` 构成，它们内部通过 `rel` 引用局部变量。

后续 Step 5 的 `trans` 就会递归处理这些 AST Nodes，把 `prod` 转换为 Lean 的 `forall`、`lam` 转换为 Lean Lambda，并将 `rel` 解析成对应的 Lean Local Variable，最终生成 Lean `Expr`。