Neural network is basically collection of numbers. A 7B model contains roughly 7 billion parameters. Normally, these values may be stored using FP32, FP16, or BF16. Quantization means representing those model values using fewer bits.
Instead of storing precise floating-point values, map them into much smaller set of values.
For example:
```
Original weights
FP16
0.1274, -0.8431
        ↓ quantization
INT4 representation
 2, -6
```
The main reason is memory.
For a 7B model:
```
FP32
7B × 4 bytes
≈ 28 GB

INT8
7B × 1 byte
≈ 7 GB
```
#### Datatype `dtype` 
`dtype` tells how each number is represented in binary.
Going from FP32 → FP16/BF16 is called reduced/mixed precision. Going from FP16/FP32 → INT8/INT4 is what mean by quantization.
**FP32:** 32-bit floating point. A floating-point number consists of sign + exponent + fraction. Historically, neural networks were often trained with FP32. But for LLMs, FP32 is expensive and FP32 inference is uncommon for modern LLMs.
**FP16/BF16:** 16-bit floating point, uses only half as many bits as FP32, memory is approximately halved. The number itself is represented with less precision. But neural networks are generally robust enough that this tiny difference does not significantly change inference quality. Thus, FP16 is common.
**INT8:** 8-bit integer. An 8-bit signed integer can represent 
```-128 ... 127```, that's only 256 possible integer values. But model weights can contain arbitrary floating numbers, ```-0.83721, 
 0.12581...``` So we need some way of mapping the floating-point values onto those integer values. That mapping is called **quantization**. Good modern INT8 quantization usually causes fairly small accuracy degradation.
 **INT4:** Much more aggressive, 4 bits can only represent 16 states.
#### **How is quantization actually achieved?**
Suppose a weight tensor contains:
```
[-1.0, -0.7, -0.2, 0.1, 0.5, 0.9]
```
And suppose we only want a very small integer range for illustration:
```
-2, -1, 0, 1, 2
```
We need to find a **scale**. For example, `scale = 0.5`.The we calculate 
$$q = \operatorname{round}\left(\frac{x}{\text{scale}}\right)$$
Set scale = 0.5`
```
For x = 0.9
0.9 / 0.5 = 1.8
quantized integer: round(1.8) = 2
```
```
For x = -0.7
-0.7 / 0.5 = -1.4
round = -1
```
So weights become approximately:
```
Original:
-1.0  -0.7  -0.2   0.1   0.5   0.9
             ↓
Quantized:
 -2    -1      0      0     1     2
```
#### **Recover an approximate value**
During computation, integer + scale → approximate floating value →  matrix multiplication.
For example:
```
quantized value = 2, scale = 0.5
2 × 0.5 = 1.0
```
The original was 0.9, now we use 1.0
So we've introduced an **quantization error**
#### **Real LLM quantization is more sophisticated**
We **do not calculate one scale for the entire 7B model**. That would lose far too much information. Instead, weights might be divided into groups:
```
Weight matrix
┌────────────────────────────┐
│ group 1 │ group 2 │ group 3│
│         │         │        │
│ scale 1 │ scale 2 │ scale 3│
└────────────────────────────┘
```
Each group receives its own scale. This is called **group-wise quantization**.
Smaller groups → more scales → more metadata → usually better accuracy
#### **Outliers** 
Suppose most weights/activations are around: `-1 ... +1`
but there is one: `37.2`
If force everything into the same INT8 range `-128...+127`, that huge outlier can make your scaling poor for all the normal values.
To handle this, for example, Hugging Face's `bitsandbytes` integration uses **LLM.int8()**, which keep important outlier computations at higher precision while quantizing other portions to INT8.
#### **Weight precision and compute precision can be different**
```
load_in_4bit=True
bnb_4bit_compute_dtype=torch.bfloat16
```
4-bit stored weights  → small blocks are de-quantized → BF16 values 
→ GPU Tensor Core computation → Result
#### **Code: Qwen2.5-7B with 4-bit quantization**
```
import torch

from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)

model_name = "Qwen/Qwen2.5-7B-Instruct"

# ------------------------------------
# 1. Define the quantization strategy
# ------------------------------------

quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,

    # Store model weights using NF4
    # Original weight → One of 16 possible 4-bit states 
    bnb_4bit_quant_type="nf4",

    # Matrix computations use BF16
    bnb_4bit_compute_dtype=torch.bfloat16,

    # Also quantize the quantization constants
    # for a little more memory saving
    bnb_4bit_use_double_quant=True,
)

# ------------------------------------
# 2. Load tokenizer
# ------------------------------------

tokenizer = AutoTokenizer.from_pretrained(model_name)

# ------------------------------------
# 3. Load model and quantize it
# ------------------------------------

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    quantization_config=quantization_config,
    device_map="auto",
    dtype=torch.bfloat16,
)

# ------------------------------------
# 4. Prepare prompt
# ------------------------------------

messages = [
    {
        "role": "user",
        "content": "Explain model quantization in one paragraph."
    }
]

text = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True,
)

inputs = tokenizer(
    text,
    return_tensors="pt",
).to(model.device)

# ------------------------------------
# 5. Run inference
# ------------------------------------

with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=150,
    )

# ------------------------------------
# 6. Decode
# ------------------------------------

generated_tokens = outputs[0][inputs.input_ids.shape[1]:]

response = tokenizer.decode(
    generated_tokens,
    skip_special_tokens=True,
)

print(response)
```

This follows Hugging Face's current bitsandbytes approach of supplying a `BitsAndBytesConfig` to `from_pretrained()`