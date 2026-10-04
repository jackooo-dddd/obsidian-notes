What the conclusions we can make: For every scenario modelled in Rocq Prosa, there is a Lean Prosa scenario in which every job has exactly the same cost (and the same arrival time and schedule), and in that pair every translated definition and theorem gives the same result. 

1. `Input pairs` are matched from a proved relation: `SubNatRel` for numbers, `SvcJobCostRel` for costs, `SvcScheduleRel` for schedules, `SvcProcessorStateRel` for processor models, and so on. Then: all inputs related  ⟹  output related (proved per declaration by its certificate)

2. "All inputs" includes the hidden ones. The result depends on every parameter of the elaborated statement:
	- the `DecidableEq` instance
	- the processor model
	- the readiness model
	- local instances, e.g. which priority policy
	- the proof arguments (e.g. `HR`/`HL`), which need no relation

3. Different meaning of "matched" for different kinds of declarations

|Kind|"Matched" means|
|---|---|
|Definition returning a value|the same value (`finish_time`, `response_time`, bounds)|
|Predicate|the two propositions are equivalent|
|Theorem|the two statements are equivalent (both are proved, each by its own kernel). This is the level with the review-only weakness discussed earlier.|

#### Correspondence and Coverage

|                    | Says                                                           | Proved by                        |
| ------------------ | -------------------------------------------------------------- | -------------------------------- |
| **Correspondence** | matched inputs ⇒ matched results                               | the certificates                 |
| **Coverage**       | every scenario on one side has a matched scenario on the other | the coverage / round-trip lemmas |
For every scenario on either side, a matched scenario exists on the other side (coverage), and on that matched pair every accepted definition gives the same value and every accepted theorem states the same thing (correspondence).