#### Type-Level Function（类型层函数, 输入类型，输出类型）
判断标准是函数的返回值是不是一个 Type / Sort。
`List : Type u → Type u`
- 给我一个类型 α ⇒ List α ⇒得到一个新的类型
- For example, `List Nat`, `#check List Nat` ⇒ `-- List Nat : Type`
- 而 [1] 是一个**值**：`[1] : List Nat`

#### Polymorphic Function (多态函数, 同一个函数可以作用于很多不同类型的值)
判断标准是函数的返回值是不是一个 value
```
def myId {α : Type} (x : α) : α :=
  x
```
- 对于任意类型 α，给我一个 α 类型的 x，我返回一个 α。∀ α, α → α
- 同一个 `myId` 可以实例化成 `Nat → Nat, Bool → Bool, String → String. `, 所以它叫 polymorphic
