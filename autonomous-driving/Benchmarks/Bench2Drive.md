The data is obtained from running inside the CARLA simulator and is designed specifically for closed-loop end-to-end autonomous driving evaluation.
Inside CARLA simulator:  Current cameras → ORION / MinDrive → Predicated trajectory → Car actually moves → CARLA world changes → new cameras → ...

Bench2Drive contains **44 interactive scenario types**, including things like:
```
cut-in
overtaking
detour
pedestrian interactions
lane changes
intersection situations
...
```
across different towns and weather conditions. 