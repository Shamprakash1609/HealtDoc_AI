import os
import torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText

model_id = "google/medgemma-1.5-4b-it"
hf_token = os.environ.get("HF_TOKEN", "") # Use environment variable for token
cache_dir = "/Users/shamprakashr/Documents/PerfectUnit😎🥳🚀/Projects/Chat-with-pdf/backend/medical_ai/models/medgemma"

processor = AutoProcessor.from_pretrained(model_id, cache_dir=cache_dir, token=hf_token)
model = AutoModelForImageTextToText.from_pretrained(
    model_id,
    cache_dir=cache_dir,
    token=hf_token,

    device_map="cpu",
    torch_dtype=torch.float32,
)

img_path = "/Users/shamprakashr/Documents/PerfectUnit😎🥳🚀/Projects/Chat-with-pdf/chest_xray_test.png"
image = Image.open(img_path).convert('RGB')

messages = [
    {
        'role': 'user',
        'content': [
            {'type': 'image', 'image': image},
            {'type': 'text', 'text': 'Describe this medical image.'},
        ],
    }
]

inputs = processor.apply_chat_template(
    messages,
    add_generation_prompt=True,
    tokenize=True,
    return_dict=True,
    return_tensors='pt',
)

input_len = inputs['input_ids'].shape[-1]

print('Generating 5 tokens...')
with torch.inference_mode():
    outputs = model.generate(
        **inputs, 
        max_new_tokens=5, 
        do_sample=False
    )

print('Outputs shape:', outputs.shape)
generated_tokens = outputs[0][input_len:]
print(f'Input length: {input_len}, Output length: {outputs.shape[1]}')
print('Output Tokens:', generated_tokens)
print('Decoded:', processor.decode(generated_tokens, skip_special_tokens=True))
