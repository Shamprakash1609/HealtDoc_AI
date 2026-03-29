import torch
from backend.medical_ai.services.medgemma_loader import get_model, get_processor, get_device
from PIL import Image

print("Init Medgemma...")
model = get_model()
processor = get_processor()
device = get_device()

img_path = "/Users/shamprakashr/Documents/PerfectUnit😎🥳🚀/Projects/Chat-with-pdf/chest_xray_test.png"
image = Image.open(img_path).convert('RGB')

dtype = model.dtype if hasattr(model, "dtype") else torch.bfloat16
if device.type == "mps":
    dtype = torch.float16

messages = [
    {
        "role": "user",
        "content": [
            {"type": "image", "image": image},
            {"type": "text", "text": "Describe this image."},
        ],
    }
]

inputs = processor.apply_chat_template(
    messages,
    add_generation_prompt=True,
    tokenize=True,
    return_dict=True,
    return_tensors="pt",
).to(device, dtype=dtype)

input_len = inputs["input_ids"].shape[-1]
print(f"Input len: {input_len}")

with torch.inference_mode():
    outputs = model.generate(**inputs, max_new_tokens=2, do_sample=False)

print(f"Output shape: {outputs.shape}")

# Distinguish if it's encoder-decoder or decoder-only
if outputs.shape[1] > input_len:
    print("Decoder-Only: Returns prompt + generated")
    gen_tokens = outputs[0][input_len:]
else:
    print("Encoder-Decoder: Returns ONLY generated")
    gen_tokens = outputs[0]

print(f"New tokens string: [{processor.decode(gen_tokens, skip_special_tokens=True)}]")

