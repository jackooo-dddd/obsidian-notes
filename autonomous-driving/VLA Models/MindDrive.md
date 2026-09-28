Introduces online reinforcement learning into autonomous-driving VLA training.
Basic Idea: Camera images 
→ LLM Decision Expert gives decision "slow down" / "change lane" / "go straight"
→ Action Expert gives numerical trajectory → CARLA vehicle moves → Reward →  RL training
MindDrive uses one LLM with different LoRA parameters to form two roles:
**Decision Expert:** decides _what the car should do_.
**Action Expert:** converts linguistic decision into an actual drivable trajectory.
Instead of doing RL directly over millions of possible continuous steering/trajectory values, it can reason over more discrete language-level actions such as:
```
keep lane
slow down
turn left
change lane right
```
That makes RL exploration easier.
MindDrive reports **78.04 Driving Score / 55.09% Success Rate**, while its later 3B version reaches an even higher Driving Score.
