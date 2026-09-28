### Job
`Definition JobType := eqType.`
Define Job Type to be and Type whose elements can be compared for equality.

Prosa deliberately does **not** say that a job contains fields like `arrival`, `cost`, etc. Prosa associates properties with jobs using functions.
`Variable job_arrival : Job -> instant. # job_arrival[j1] = 3
`Variable job_cost : Job -> work. # job_cost[j1] = 5

Definition work := nat.  `work` is another name for the natural-number type `nat`. `work` is just a name, not a property of a job. For example `Variable job_cost : Job -> work.` this is effectively `Variable job_cost : Job -> nat.`
Then why do Prosa define `work`? For readability
`Variable job_arrival : Job -> nat. ` /    `Variable job_cost    : Job -> nat.`
Both return `nat`. But what do those natural numbers **mean**?
- `job_arrival j` → a **time**
- `job_cost j` → an **amount of work**
So if everything were just `nat`, the code would lose semantic meaning.
Another reason: Abstraction, suppose Prosa has hundreds of definitions like
job_cost : Job -> work
service_on : Job -> State -> Core -> work
supply_on : State -> Core -> work
Today `Definition work := nat.`, but the authors could later decide to represent work differently. If the source code directly said `Job -> nat, State -> Core -> nat...`
then the concept of "work" is mixed with the implementation choice "`nat`".

`Class JobCost (Job : JobType) := job_cost : Job -> work.`
- Class: Create a typeclass/interface. 
- JobCost: Name of that interface.
- (Job : JobType): The interface is parameterized by a particular job type.
- job_cost : Job -> work: Any instance of this interface must provide a function mapping each job to its required work.
define a reusable interface saying that any job model with costs **must provide such a function**, and let Rocq's typeclass system find it automatically.
The declaration `Variable job_cost : Job -> work.` assumes that within the current section, a cost function is provided. However, because Prosa frequently references `job_cost` across numerous files and definitions, passing this function explicitly everywhere becomes cumbersome. Instead, Prosa utilizes typeclasses. When working with a job of type `Job`, Rocq automatically resolves the appropriate typeclass instance, providing a registered method to compute the job's cost without requiring it to be passed as an explicit argument.