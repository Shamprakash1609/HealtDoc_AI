import json
import os
import sys
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from backend.medical_ai.services.clinical_engine import extract_metrics, assess_risks
from backend.medical_ai.services.ocr_parser import extract_text_from_report
from backend.medical_ai.services.report_explainer import explain_report
from backend.medical_ai.services.image_analyzer import analyze_medical_image

def test_report():
    print("\n[TEST] Running Report Analysis Pipeline...")
    file_path = "Tests/Reports/Blood_Report.pdf"
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    # OCR
    text = extract_text_from_report(file_path)
    print(f"Extracted {len(text)} characters.")

    # Clinical Engine
    metrics = extract_metrics(text)
    risks = assess_risks(metrics)
    print(f"Extracted {len(metrics)} metrics and {len(risks)} risks.")

    # Explanation (Gemini)
    try:
        explanation = explain_report(metrics, risks)
        print("Generated AI Explanation.")
    except Exception as e:
        print(f"Gemini Explanation failed: {e}")
        explanation = "Fallback explanation due to API error."

    result = {
        "filename": "Blood_Report.pdf",
        "metrics": metrics,
        "risks": risks,
        "explanation": explanation
    }
    print("\n--- REPORT JSON ---")
    print(json.dumps(result, indent=2))

def test_image():
    print("\n[TEST] Running Optimized Image Analysis...")
    image_path = "Tests/Images/Chest XRay.png"
    if not os.path.exists(image_path):
        print(f"File not found: {image_path}")
        return

    # MedGemma Analysis
    try:
        analysis = analyze_medical_image(image_path)
        print("\n--- IMAGE JSON ---")
        print(json.dumps(analysis, indent=2))
    except Exception as e:
        print(f"Image analysis failed: {e}")

if __name__ == "__main__":
    # Test Report first (fast)
    test_report()
    
    # Test Image (might be slow due to memory loading)
    # test_image() 
