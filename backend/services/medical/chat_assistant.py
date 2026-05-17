import json
import logging
import re
import ollama
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ChatQueryError(Exception):
    """Custom exception for chat query processing errors."""
    pass

def generate_chat_response(query: str, context: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate a detailed, layman-friendly response using Ollama MedGemma.
    
    Args:
        query: The user's medical question.
        context: Optional context from previous interactions or an analyzed report.
        
    Returns:
        Dict containing the 'answer' string and 'suggestions' list of strings.
    """
    try:
        context_str = f"Context: {context}\n" if context else ""
        sys_prompt = (
            "You are a friendly, highly intelligent medical AI assistant designed for regular people. "
            "Provide a clear, detailed, and easy-to-understand response to the user's health-related question. "
            "Use clear headings, bullet points, and structures (like daily menus, dietary lists, or core strategies) to make your response comprehensive and highly actionable.\n\n"
            "CRITICAL: Keep your entire response extremely concise and under a strict limit of 350-400 words maximum. "
            "Get straight to the point. No wordy greetings or conversational intro/outro text. "
            "Keep each bullet point very short (1-2 brief sentences max).\n\n"
            "CRITICAL REQUIREMENT FOR SUGGESTIONS:\n"
            "Instead of general recommendations, advice, or statements, the suggestions MUST be complete, practical, and highly specific follow-up questions "
            "that the user can ask next based on the response you just gave (especially if they are stuck and not sure what to ask next).\n"
            "Each suggestion MUST:\n"
            "- Be phrased from the user's perspective (e.g., 'What are the main side effects I should watch out for?' or 'How long does this treatment usually take to work?').\n"
            "- Be a direct, well-formed question ending with a question mark (?).\n"
            "- Be specific to the current topic and previous query, helping the user explore further.\n\n"
            "You MUST format your output exactly as follows:\n\n"
            "ANSWER:\n"
            "[Your detailed, structured medical response goes here]\n\n"
            "SUGGESTIONS:\n"
            "- [A specific follow-up question the user can ask next?]\n"
            "- [Another specific follow-up question the user can ask next?]\n"
            "- [A third specific follow-up question the user can ask next?]"
        )

        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": f"{context_str}User Question: {query}\n\nRespond exactly in the ANSWER/SUGGESTIONS format requested."}
        ]

        # Call Ollama
        response = ollama.chat(
            model='medgemma1.5:4b',
            messages=messages,
            options={
                'temperature': 0.3,
                'top_p': 0.9,
            }
        )

        response_text = response['message']['content'].strip()
        parsed_result = _clean_and_parse_json(response_text)
        
        return {
            "answer": parsed_result["answer"],
            "suggestions": parsed_result["suggestions"][:3] # Ensure max 3 suggestions
        }

    except Exception as e:
        logger.error(f"Error generating chat response: {e}")
        # Return a graceful fallback instead of crashing the endpoint
        return {
            "answer": "I am currently overloaded and cannot process this query. Please try again in a moment.",
            "suggestions": ["What are common symptoms?", "Should I consult a doctor?"]
        }


def _clean_and_parse_json(raw_text: str) -> dict:
    """Helper to aggressively clean and extract ANSWER and SUGGESTIONS from raw LLM output."""
    raw_text = raw_text.strip()
    
    # 1. Slice from first curly brace if model still attempted JSON
    json_start = raw_text.find("{")
    if json_start != -1:
        try:
            json_match = re.search(r'\{.*\}', raw_text[json_start:], re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(0))
                if "answer" in parsed:
                    return {
                        "answer": parsed["answer"],
                        "suggestions": parsed.get("suggestions", ["Can you explain that in simpler terms?"])
                    }
        except Exception:
            pass

    # 2. Extract plain text ANSWER and SUGGESTIONS sections
    # Strip thought blocks first
    clean_text = re.sub(r"(?i)<unused\d+>thought.*?(?:ANSWER:|SUGGESTIONS:|\n\n|$)", "", raw_text, flags=re.DOTALL)
    clean_text = re.sub(r"(?i)<thought>.*?(?:</thought>|ANSWER:|SUGGESTIONS:|\n\n|$)", "", clean_text, flags=re.DOTALL).strip()
    
    answer_match = re.search(r'(?i)ANSWER:\s*(.*?)(?=\s*SUGGESTIONS:|$)', clean_text, re.DOTALL)
    suggestions_match = re.search(r'(?i)SUGGESTIONS:\s*(.*)', clean_text, re.DOTALL)
    
    answer = ""
    suggestions = []
    
    if answer_match:
        answer = answer_match.group(1).strip()
    else:
        # Fallback: take text before SUGGESTIONS: if found
        sug_idx = clean_text.upper().find("SUGGESTIONS:")
        if sug_idx != -1:
            answer = clean_text[:sug_idx].strip()
        else:
            answer = clean_text
            
    # Clean prefix if needed
    if answer.upper().startswith("ANSWER:"):
        answer = answer[7:].strip()
        
    if suggestions_match:
        sug_text = suggestions_match.group(1).strip()
        raw_items = [s.strip() for s in re.split(r'\n', sug_text) if s.strip()]
        for item in raw_items:
            cleaned_item = re.sub(r'^[-*•\d\.\s]+', '', item).strip()
            if cleaned_item:
                suggestions.append(cleaned_item)
                
    # Clean up empty values with robust fallbacks
    if not suggestions:
        suggestions = [
            "Can you explain that in simpler terms?",
            "What are some side effects to watch out for?",
            "Should I speak to a doctor about this?"
        ]
        
    if not answer or len(answer) < 10:
        answer = raw_text[:500] + "\n\n(Note: The AI struggled to format this response ideally. Please consult a doctor for serious concerns.)"
        
    return {
        "answer": answer,
        "suggestions": suggestions
    }
