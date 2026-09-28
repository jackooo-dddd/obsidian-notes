control + option + 下箭头


Chains: 
```
Job -> State -> Core -> bool
```
means a **function that takes three arguments, one after another, and finally returns a `bool`**.

```
scheduled_on : Job -> State -> Core -> bool;
```
can be mentally read as:
```
scheduled_on(Job, State, Core) -> bool
```


Conceptually:
```
give Job
   ↓
get a function waiting for State
   ↓
give State
   ↓
get a function waiting for Core
   ↓
give Core
   ↓
get bool
```

For normal use, however, you can simply think of it as a **3-input function**:

```
             ┌──────────────┐
Job ────────►│              │
State ──────►│ scheduled_on │────► bool
Core ───────►│              │
             └──────────────┘
```



**Supply = how much computing capacity the processor/core makes available.**  
**Service = how much of that capacity a particular job actually receives.**