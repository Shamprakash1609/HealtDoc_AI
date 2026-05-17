"""
Medical Image Analyzer — X-Ray, CT, MRI analysis via Ollama.

Processes medical images through the Ollama MedGemma model
to produce structured clinical observations.
"""

import os
import re
import json
import base64
import ollama
from io import BytesIO
from PIL import Image
import logging

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────
MAX_IMAGE_DIMENSION = 768  # Optimized for speed

ANALYSIS_PROMPT = """Analyze this medical image and provide a structured JSON response.
Act as a professional medical helper for a patient. Identify the main condition in plain English.
Output ONLY valid JSON. START your response with '{'.
Do NOT include any thoughts, dialogue, or headers outside the JSON.

{
  "description": "General description of the image content.",
  "diagnosis": "Clear identity of the main condition (e.g., 'A growth in the brain').",
  "findings": [
    "Simple observation 1.",
    "Simple observation 2."
  ],
  "explanation": "What this means for the patient's health in everyday language.",
  "importance": "How urgently they should see a doctor."
}"""

def _clean_value(val: str) -> str:
    """Surgically strip JSON artifacts, markdown, and noise."""
    if not val:
        return ""
    # Strip leading markers like ": ", "diagnosis":, **Diagnosis**, etc.
    val = re.sub(r'^(?i)(?:\*+|#+|diagnosis|description|findings|explanation|importance)[:\s"\'\*\[\{]+', '', val).strip()
    # Strip structural noise
    val = re.sub(r'^[:\s"\'\[\{]+', '', val).strip()
    val = re.sub(r'[\s"\'\],\}]+$', '', val).strip()
    # Remove interior bolding
    val = val.replace("**", "")
    return val

def _extract_from_text(text: str) -> dict:
    """Ultra-resilient fallback parser to handle structured natural language if JSON fails."""
    # Strip ALL thought blocks (including partial/unclosed)
    clean_text = re.sub(r"(?i)<unused\d+>thought.*?(?:\d+\.|$)", "", text, flags=re.DOTALL)
    clean_text = re.sub(r"(?i)<thought>.*?(?:</thought>|$)", "", clean_text, flags=re.DOTALL).strip()
    
    result = {
        "description": "Analysis of medical imagery",
        "diagnosis": "Clinical condition evaluated",
        "findings": [],
        "explanation": "Please consult a healthcare professional for a detailed interpretation of these findings.",
        "importance": "Medical Review Recommended"
    }

    # Highly Flexible Patterns
    patterns = {
        "description": r"(?i)(?:description|Analyze the image)[:\s\*]+(.*?)(?:\n|diagnosis|findings|explanation|importance|$)",
        "diagnosis": r"(?i)(?:diagnosis|main condition|Identify the main condition)[:\s\*]+(.*?)(?:\n|findings|explanation|importance|$)",
        "explanation": r"(?i)(?:explanation|what this means|detailed explanation)[:\s\*]+(.*?)(?:\n|importance|next steps|$)",
        "importance": r"(?i)(?:importance|how urgently|recommendation)[:\s\*]+(.*?)(?:\n|$)"
    }

    for key, pattern in patterns.items():
        match = re.search(pattern, clean_text, re.DOTALL)
        if match:
            result[key] = _clean_value(match.group(1))

    # Findings - Look for bullet points or numbered lists
    findings_match = re.search(r"(?i)(?:findings|Analyze the image|Observation)[:\s\*]*(.*?)(?:\n\n|explanation|importance|diagnosis|3\.|$)", clean_text, re.DOTALL)
    if findings_match:
        findings_text = findings_match.group(1).strip()
        raw_items = [f.strip("- *123456789. \t").strip() for f in findings_text.split("\n") if f.strip() and len(f.strip()) > 5]
        result["findings"] = [_clean_value(item) for item in raw_items if len(_clean_value(item)) > 5][:8]

    # Special case: if diagnosis is empty but we have findings, use the first finding or common pattern
    if result["diagnosis"] == "Clinical condition evaluated" and result["findings"]:
        for f in result["findings"]:
            if any(word in f.lower() for word in ["enlarged", "appear", "suggest", "consistent", "growth", "visible", "showing"]):
                result["diagnosis"] = f
                break

    return result

def _resize_if_needed(image: Image.Image) -> Image.Image:
    """Resize for efficient inference."""
    width, height = image.size
    if width <= MAX_IMAGE_DIMENSION and height <= MAX_IMAGE_DIMENSION:
        return image
    scale = min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height)
    return image.resize((int(width * scale), int(height * scale)), Image.Resampling.LANCZOS)

def analyze_medical_image(image_path: str) -> dict:
    """Analyze a medical image using Ollama MedGemma."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    image = Image.open(image_path).convert("RGB")
    image = _resize_if_needed(image)
    
    # Convert image to base64
    buffered = BytesIO()
    image.save(buffered, format="JPEG")
    img_b64_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

    logger.info(f"[Ollama] Starting Image generation...")
    
    try:
        response = ollama.chat(
            model='medgemma1.5:4b',
            messages=[{
                'role': 'user',
                'content': ANALYSIS_PROMPT,
                'images': [img_b64_str]
            }],
            options={
                'temperature': 0.1,
            }
        )
        
        response_text = response['message']['content'].strip()
    except Exception as e:
        logger.error(f"[Ollama] Error generating image analysis: {e}")
        return {
            "description": "Analysis failed",
            "diagnosis": "Unable to process image",
            "findings": ["The local model might not support image inputs or encountered an error."],
            "explanation": str(e),
            "importance": "N/A"
        }

    # Pre-cleaning: Remove thought blocks
    cleaned_response = re.sub(r"(?i)<unused\d+>thought.*?(?:\d+\.|$)", "", response_text, flags=re.DOTALL)
    cleaned_response = re.sub(r"(?i)<thought>.*?(?:</thought>|$)", "", cleaned_response, flags=re.DOTALL).strip()

    try:
        json_start = cleaned_response.find("{")
        json_end = cleaned_response.rfind("}") + 1
        if json_start != -1 and json_end != 0:
            json_str = cleaned_response[json_start:json_end]
            parsed = json.loads(json_str)
            for key in ["description", "diagnosis", "findings", "explanation", "importance"]:
                if key not in parsed: parsed[key] = "Not identified" if key != "findings" else []
            return parsed
        return _extract_from_text(response_text)
    except Exception:
        return _extract_from_text(response_text)
