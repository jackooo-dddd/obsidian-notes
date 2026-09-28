A normal block-skipping method might simply do:
```
for i, layer in enumerate(model.layers):
    if i not in skipped_layers:
        x = layer(x)
```
This reduces computation, but all the layer weights still reside on GPU even if some aren't executed.
#### **Research Questions**
Previous early-exit/block-skipping methods largely optimize in-task computation, but leave cross-task switching cost unaddressed.
How can one large VLM serve **multiple tasks** on a memory-constrained edge device while **switching between task-specific sparse configurations** quickly, without repeatedly moving large amounts of model weights between disk, CPU RAM, and GPU memory?
#### **Solution to RQ / Contributions** 
(1) Fine-grained loading: Do not load the whole model, load only needed blocks.
(2) Overlap aware sparsity: Make different tasks use many same blocks.
(3) Correlation aware preload: Predict the likely next task and prepare its missing blocks early.
#### **How do they know which blocks a task needs?**
For a task such as **vehicle detection**, they first run the **full model** on a small vehicle-detection calibration set to get a baseline score, then try removing one block at a time:
`skip block 0 → accuracy = 72%`
`skip block 1 → accuracy = 89%`
The paper uses 90% performance-retention constraint
$$
\text{Metric}(M_{\text{sparse}}) \ge 0.9 \times \text{Metric}(M_{\text{full}})
$$
**greedy block-removal algorithm**: Tentatively remove every possible block, evaluate the model, and permanently remove the block whose removal gives the best metric while keeping accuracy above the retention threshold. Then repeat.
#### **how do they know two tasks have similar patterns?** 
They actually do not first find 2 patterns then discover they are similar, they actively make later tasks prefer the same skipped blocks as earlier tasks. 
Suppose `Task 1 = vehicle detection`. After the greedy search, Vehicle skipped = {2, 5, 8, 11}. The paper puts those layers into a **shared skip-layer pool**:
```
shared_skip_pool = {2, 5, 8, 11}
```
Consider `Task 2 = traffic-light detection`. The algorithm says when searching for layers Traffic Light can remove, first try layers in shared pool.
So it first tests: 
Can traffic-light task also skip block 2, 5, 8, 11?
If skipping block 2 still preserves ≥90% performance, prefer removing it.
If skipping block 5 causes accuracy to collapse, don't force it.
That's overlap-aware sparsity alignment.
#### **Reorganize model weights into reusable units**
Reorganize the weights that are physically stored for runtime loading.
Normally, a Hugging Face model looks conceptually like:
```
model
├── layer 0
│   ├── attention weights
│   └── FFN weights
├── layer 1
...
└── layer 31
```
But the checkpoint may still be stored in a few **large monolithic files**, for example:
```
model-00001-of-00004.safetensors
model-00002-of-00004.safetensors
model-00003-of-00004.safetensors
model-00004-of-00004.safetensors
```
A single file can contain parameters from many different Transformer blocks. That is fine for normal loading, but it is inconvenient if only needs some blocks at runtime. The paper therefore reorganizes the checkpoint layout into independently reusable block-granular units.
The paper want something conceptually closer to:
```
Disk
├── block_00.weights
├── block_01.weights
├── block_02.weights
...
```
If the goal is only to **reduce computation**, then it is fine to keep the whole model on GPU and simply skip selected blocks during `forward()`. But the skipped block are still inside the GPU's memory. If the goal is also to **reduce GPU memory / support on-demand loading**, then fine-grained weight management becomes necessary for efficiency.
#### System
Deploy a single large vision language model to support multiple perception and reasoning tasks on an edge device, the goal is to minimize the memory footprint and task-switching latency.
Images and text instructions are encoded by a vision encoder and a text encoder then fused by a shared Transformer backbone with N blocks. On the top, lightweight task heads are attached for driving-related tasks. 

**Models used:** Qwen2-VL-2B and  LLaVA-7B
**Dataset and tasks:** nuScenes as the mains source of real driving scenes and trajectories.
**Task-level** Metrics: Accuracy, end to end per frame inference latency, sparsity (Fraction of skipped transformer blocks)
**System-level** Metrics: Task switch overhead, GPU utilization under dynamic task streams
