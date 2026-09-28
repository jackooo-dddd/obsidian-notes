CARLA is an open-source autonomous-driving simulator including roads, cars, pedestrians, traffic lights, weather.
```
From CARLA Simulator
sensor observe vehicle physics
        ↓
   E2E model
   ORION / MindDrive
        ↓
 predicted trajectory
 steering / throttle / brake
        ↓
      CARLA
        ↓
 car moves in simulation
        ↓
 new sensor observations
        ↓
      model again
```
Closed loop steps: 
1. CARLA renders camera images
2. Model receives the images
3. Model predicts a trajectory
4. Controller converts trajectory → steering/throttle/brake
5. CARLA applies those controls
6. Vehicle moves
7. CARLA generates the next scene
8. Repeat