"""
Report Explainer — Ollama-powered patient-friendly report explanation.

Takes structured metrics and detected risks, sends them to Ollama MedGemma
for a clear, empathetic explanation a patient can understand.
"""

import logging
from typing import Any

from langchain_ollama import ChatOllama
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)

# ─── Prompt ──────────────────────────────────────────────────────────────────
EXPLANATION_PROMPT = PromptTemplate(
    template="""You are a professional Health Companion. A patient has received their clinical laboratory results and needs a very brief, encouraging, and easy-to-understand summary.

## Lab Results
{metrics_text}

## Risk Flags & Severities
{risks_text}

## Your Goal
Provide a concise "Personal Health Summary" (max 10-15 lines).
Focus ONLY on the risk flags or areas that need attention. Do NOT explain normal metrics unless necessary for context.

## Required Sections
1. Quick Summary: 1-2 sentences summarizing the overall state.
2. Areas for Attention: For each flagged risk, briefly explain what it means (skip if no risks).
3. Simple Precautions: Provide 1-2 simple, actionable tips based ONLY on the flagged risks.
4. Next Steps: Brief recommendation on whether to consult a doctor.

## Style Guidelines
- Use ONLY PLAIN TEXT. NO markdown formatting (no #, ##, or **).
- Keep it extremely concise and direct. Max 15 lines.
- Avoid all medical jargon where possible.

## Mandatory Cautious Note
This is an AI summary for informational purposes. It is not a medical diagnosis or medical advice. Please consult your physician.""",
    input_variables=["metrics_text", "risks_text"],
)


def _format_metrics(metrics: dict[str, Any]) -> str:
    """Format metrics dict into readable text."""
    if not metrics:
        return "No metrics extracted."

    lines = []
    for name, data in metrics.items():
        lines.append(f"- {data['display']}: {data['value']} {data['unit']}")
    return "\n".join(lines)


def _format_risks(risks: list[dict[str, Any]]) -> str:
    """Format risks list into readable text."""
    if not risks:
        return "No significant risk flags detected."

    lines = []
    for r in risks:
        lines.append(f"- {r['metric']}: {r['value']} {r['unit']} ({r['status']}) -> {r['risk']}")
    return "\n".join(lines)


def _get_layman_suggestions(risks: list[dict[str, Any]]) -> list[str]:
    """Provide simple, actionable precautions for common clinical risks."""
    suggestions = []
    seen_categories = set()

    for r in risks:
        metric = r['metric'].lower()
        
        if "hemoglobin" in metric and "low" in r.get('status', '').lower() and "anemia" not in seen_categories:
            suggestions.append("Precautions for Low Hemoglobin: Include more iron-rich foods like spinach, beans, and lentils in your diet. Vitamin C help iron absorption.")
            seen_categories.add("anemia")
            
        if "glucose" in metric and "high" in r.get('status', '').lower() and "diabetes" not in seen_categories:
            suggestions.append("Precautions for High Blood Sugar: Try to limit sugary drinks and processed snacks. A 10-minute walk after meals can help manage levels.")
            seen_categories.add("diabetes")

        if ("wbc" in metric or "leucocytes" in metric) and "high" in r.get('status', '').lower() and "infection" not in seen_categories:
            suggestions.append("Precautions for High WBC: This often means your body is fighting something. Rest well, stay hydrated, and monitor for any fever.")
            seen_categories.add("infection")

        if "cholesterol" in metric or "ldl" in metric or "triglycerides" in metric:
            if "high" in r.get('status', '').lower() and "heart" not in seen_categories:
                suggestions.append("Precautions for High Fats/Lipids: Focus on healthy fats like avocados or nuts, and try to incorporate more fiber from whole grains.")
                seen_categories.add("heart")

        if "platelets" in metric and "low" in r.get('status', '').lower() and "bleeding" not in seen_categories:
            suggestions.append("Precautions for Low Platelets: Be careful with activities that could cause bruising or cuts. Avoid heavy lifting or contact sports for now.")
            seen_categories.add("bleeding")

    return suggestions


def explain_report(
    metrics: dict[str, Any],
    risks: list[dict[str, Any]],
) -> str:
    """
    Generate a layman-friendly explanation of lab results using Ollama MedGemma.
    """
    try:
        llm = ChatOllama(
            model="medgemma1.5:4b",
            temperature=0.3,
        )

        chain = EXPLANATION_PROMPT | llm | StrOutputParser()

        metrics_text = _format_metrics(metrics)
        risks_text = _format_risks(risks)

        explanation = chain.invoke({
            "metrics_text": metrics_text,
            "risks_text": risks_text,
        })

        return explanation.strip()

    except Exception as e:
        logger.error(f"[ReportExplainer] Ollama explanation failed: {e}")
        
        # PROACTIVE FALLBACK: Build a high-quality layman summary manually
        summary_parts = ["Personal Health Summary\n"]
        
        if risks:
            summary_parts.append("Main Findings to Note:\n")
            for r in risks:
                summary_parts.append(f"- {r['risk']}")
            
            summary_parts.append("\nSimple Precautions & Suggestions:\n")
            layman_tips = _get_layman_suggestions(risks)
            if layman_tips:
                for tip in layman_tips:
                    summary_parts.append(f"- {tip}")
            else:
                summary_parts.append("- Focus on a balanced diet, regular hydration, and adequate rest while waiting for a professional review.")
        else:
            summary_parts.append("Your results appear to be within the normal range. Continue your healthy routines!")

        summary_parts.append("\nCaution: This is an AI-generated summary for information only. Please speak with your doctor for a formal diagnosis.")
        return "\n".join(summary_parts)
