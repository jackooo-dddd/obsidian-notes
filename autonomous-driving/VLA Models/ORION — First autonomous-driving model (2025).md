ORION stands for an end-to-end autonomous driving framework based on Vision + Language + Action.
The model combines three major components:  Vision processing → LLM reasoning → trajectory generation
For example, Camera detect road images → Vision encoder → QT-Former → LLM reasons "Car ahead is slowing, I should decelerate" → Generative planner "slow down" → Output Future trajectory "(x1, y1), (x2, y2)....." → Vehicle control

**Result:** ORION achieves roughly 77.74 Driving Score and 54.62% Success Rate on Bench2Drive