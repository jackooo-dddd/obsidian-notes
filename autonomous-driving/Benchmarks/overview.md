
| Benchmark              | Data source                   | Main purpose                                  | Typical evaluation          |
| ---------------------- | ----------------------------- | --------------------------------------------- | --------------------------- |
| nuScenes           | Real cars, Boston + Singapore | Detection, tracking, prediction, E2E planning | Mostly open-loop        |
| Waymo Open Dataset | Real Waymo vehicles           | Perception, motion prediction, E2E driving    | Mostly open-loop        |
| Argoverse 2        | Real vehicles                 | Motion forecasting, perception                | Mostly open-loop        |
| nuPlan             | Real driving logs + simulator | Planning                                  | Open-loop + closed-loop |
| CARLA Leaderboard  | CARLA simulator               | Complete autonomous-driving agent             | Closed-loop             |
| Bench2Drive        | CARLA simulator               | Modern E2E/VLA driving models                 | Closed-loop             |
**Open-loop:** The model's prediction does NOT modify the next input. Even if the model predicts terrible at the current frame, the next frame is still whatever the human driver actually experienced.
**Closed-loop:** The model receives new state caused by its previous action.
There is a closed feedback loop:
```
       ┌──────────────────────────────┐
       │                              │
       ↓                              │
 Environment → Sensors → Model → Action
       ↑                        │
       └────────────────────────┘
```
Closed-loop tasks is much harder as the mistake becomes part of the future, a model can have excellent open-loop trajectory error while still being a poor actual driver.