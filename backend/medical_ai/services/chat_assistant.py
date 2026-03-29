import json
import logging
import re
from typing import Dict, Any, Optional

from backend.medical_ai.services.medgemma_loader import get_model, get_processor, get_device

logger = logging.getLogger(__name__)

class ChatQueryError(Exception):
    """Custom exception for chat query processing errors."""
    pass

def generate_chat_response(query: str, context: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate an ultra-fast, layman-friendly response using MedGemma.
    
    Args:
        query: The user's medical question.
        context: Optional context from previous interactions or an analyzed report.
        
    Returns:
        Dict containing the 'answer' string and 'suggestions' list of strings.
    """
    try:
        model = get_model()
        processor = get_processor()
        device = get_device()
        
        if not model or not processor:
            raise ChatQueryError("MedGemma model is not initialized.")

        # Construct a strict prompt enforcing JSON out and layman-friendly tone
        context_str = f"Context: {context}\n" if context else ""
        sys_prompt = (
            "You are a friendly, highly intelligent medical AI assistant designed for regular people. "
            "Someone has asked you a health-related question. "
            "Provide a clear, brief, and very easy-to-understand answer (max 3 short paragraphs). "
            "Do NOT use heavy medical jargon. "
            "You MUST output your ENTIRE response as a strictly valid JSON object. Do not output any markdown outside the JSON.\n\n"
            "Format:\n"
            "{\n"
            '  "answer": "Your clear, layman-friendly medical explanation here.",\n'
            '  "suggestions": [\n'
            '    "A short follow-up question the user might want to ask next?",\n'
            '    "Another related follow-up question?"\n'
            "  ]\n"
            "}"
        )

        messages = [
            {"role": "user", "content": f"{sys_prompt}\n\n{context_str}User Question: {query}\n\nRespond ONLY with the JSON format requested."}
        ]

        # Apply chat template
        prompt = processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )

        inputs = processor(text=prompt, return_tensors="pt").to(device)

        # Ultra-fast generation parameters
        outputs = model.generate(
            **inputs,
            max_new_tokens=400,
            do_sample=True,
            temperature=0.3,
            top_p=0.9,
            repetition_penalty=1.1,
        )

        generated_text = processor.decode(outputs[0], skip_special_tokens=False)
        
        # Extract the response after the <start_of_turn>model tag
        model_delimiter = "<start_of_turn>model"
        if model_delimiter in generated_text:
            response_text = generated_text.split(model_delimiter)[-1].strip()
        else:
            response_text = generated_text.strip()

        parsed_json = _clean_and_parse_json(response_text)
        
        # Validate structure
        answer = parsed_json.get("answer", "I could not generate a clear answer to that question. Please try rephrasing.")
        suggestions = parsed_json.get("suggestions", [])
        
        if not isinstance(suggestions, list):
            suggestions = ["Could you clarify your health query?"]
            
        return {
            "answer": answer,
            "suggestions": suggestions[:3] # Ensure max 3 suggestions
        }

    except Exception as e:
        logger.error(f"Error generating chat response: {e}")
        # Return a graceful fallback instead of crashing the endpoint
        return {
            "answer": "I am currently overloaded and cannot process this query. Please try again in a moment.",
            "suggestions": ["What are common symptoms?", "Should I consult a doctor?"]
        }


def _clean_and_parse_json(raw_text: str) -> dict:
    """Helper to aggressively clean and extract JSON from raw LLM output."""
    raw_text = raw_text.strip()
    
    # 1. Remove markdown formatting if the model bled it into the output
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.startswith("```"):
        raw_text = raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
        
    raw_text = raw_text.strip()
    
    # 2. Try direct parse
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        logger.warning("Direct JSON parse failed. Attempting regex extraction.")
        
    # 3. Aggressive extraction using regex to find the first '{' and last '}'
    match = re.search(r'\{.*\}', raw_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as e:
            logger.error(f"Regex JSON parse failed: {e}. Raw extracted: {match.group(0)}")
            
    # 4. Total failure, return fallback
    logger.error(f"Total failure parsing chat JSON. Raw text: {raw_text[:200]}...")
    return {
        "answer": raw_text[:500] + "\n\n(Note: The AI struggled to format this response ideally. Please consult a doctor for serious concerns.)",
        "suggestions": ["Can you explain that in simpler terms?"]
    }
