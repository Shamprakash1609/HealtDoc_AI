"""
Clinical Risk Engine — Regex-based metric extraction and rule-based risk assessment.

Parses raw OCR text from blood/lab reports to extract structured metrics,
then applies clinical threshold rules to flag potential health risks.
"""

import re
from typing import Any

# ─── Reference Ranges & Risk Rules ────────────────────────────────────────────
# Each entry: (metric_name, regex_pattern, unit, normal_low, normal_high, risk_labels)
METRIC_DEFINITIONS = [
    {
        "name": "hemoglobin",
        "display": "Hemoglobin",
        "unit": "g/dL",
        "pattern": r"\b(?:haemoglobin|hemoglobin|hgb|hb)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)\s*(?:g/dl|gm/dl|g/l)",
        "low": 12.0,
        "high": 17.5,
        "risk_low": "Anemia (low hemoglobin)",
        "risk_high": "Polycythemia (high hemoglobin)",
    },
    {
        "name": "glucose",
        "display": "Glucose (Fasting)",
        "unit": "mg/dL",
        "pattern": r"\b(?:glucose[\s\(\)a-z\-,\/]*(?:fasting|fbs|level|post|prandial|eag)|(?:fbs|fasting|eag)[\s\(\)a-z\-,\/]*glucose)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)\s*(?:mg/dl|mmol/l)",
        "low": 70.0,
        "high": 100.0,
        "risk_low": "Hypoglycemia (low blood sugar)",
        "risk_high": "Hyperglycemia / Pre-diabetes risk (high blood sugar)",
    },
    {
        "name": "ldl",
        "display": "LDL Cholesterol",
        "unit": "mg/dL",
        "pattern": r"\b(?:ldl|low\s*density)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)\s*(?:mg/dl|mmol/l)",
        "low": 0.0,
        "high": 100.0,
        "risk_low": None,
        "risk_high": "High LDL cholesterol (cardiovascular risk)",
    },
    {
        "name": "hdl",
        "display": "HDL Cholesterol",
        "unit": "mg/dL",
        "pattern": r"\b(?:hdl|high\s*density)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)\s*(?:mg/dl|mmol/l)",
        "low": 40.0,
        "high": 200.0,
        "risk_low": "Low HDL cholesterol (cardiovascular risk)",
        "risk_high": None,
    },
    {
        "name": "triglycerides",
        "display": "Triglycerides",
        "unit": "mg/dL",
        "pattern": r"\b(?:triglycerides|trig|tg)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)\s*(?:mg/dl|mmol/l)",
        "low": 0.0,
        "high": 150.0,
        "risk_low": None,
        "risk_high": "High triglycerides (cardiovascular risk)",
    },
    {
        "name": "wbc",
        "display": "White Blood Cells",
        "unit": "×10³/µL",
        "pattern": r"\b(?:wbc|white\s*blood\s*cells?|leucocytes?|total\s*wbc)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 4.0,
        "high": 11.0,
        "risk_low": "Leukopenia (low WBC — possible immune suppression)",
        "risk_high": "Leukocytosis (high WBC — possible infection/inflammation)",
    },
    {
        "name": "rbc",
        "display": "Red Blood Cells",
        "unit": "×10⁶/µL",
        "pattern": r"\b(?:rbc|red\s*blood\s*cells?|erythrocytes?)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 4.0,
        "high": 6.0,
        "risk_low": "Low RBC count (possible anemia)",
        "risk_high": "High RBC count (possible polycythemia)",
    },
    {
        "name": "platelets",
        "display": "Platelets",
        "unit": "×10³/µL",
        "pattern": r"\b(?:platelets?|plt|platelet\s*count)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 150.0,
        "high": 450.0,
        "risk_low": "Thrombocytopenia (low platelets — bleeding risk)",
        "risk_high": "Thrombocytosis (high platelets — clotting risk)",
    },
    {
        "name": "creatinine",
        "display": "Creatinine",
        "unit": "mg/dL",
        "pattern": r"\b(?:creatinine|creat)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)\s*(?:mg/dl|umol/l)",
        "low": 0.6,
        "high": 1.2,
        "risk_low": None,
        "risk_high": "Elevated creatinine (possible kidney dysfunction)",
    },
    {
        "name": "urea",
        "display": "Blood Urea / BUN",
        "unit": "mg/dL",
        "pattern": r"\b(?:blood\s*urea|bun|urea\s*nitrogen)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)\s*(?:mg/dl|mmol/l)",
        "low": 7.0,
        "high": 20.0,
        "risk_low": None,
        "risk_high": "Elevated urea (possible kidney stress)",
    },
    {
        "name": "calcium",
        "display": "Calcium",
        "unit": "mg/dL",
        "pattern": r"\b(?:calcium|ca\+\+)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)\s*(?:mg/dl|mmol/l)",
        "low": 8.5,
        "high": 10.5,
        "risk_low": "Hypocalcemia",
        "risk_high": "Hypercalcemia",
    },
    {
        "name": "alt",
        "display": "ALT (SGPT)",
        "unit": "U/L",
        "pattern": r"\b(?:alt|sgpt|alanine\s*aminotransferase)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 0.0,
        "high": 40.0,
        "risk_low": None,
        "risk_high": "Elevated liver enzymes (possible liver stress/injury)",
    },
    {
        "name": "ast",
        "display": "AST (SGOT)",
        "unit": "U/L",
        "pattern": r"\b(?:ast|sgot|aspartate\s*aminotransferase)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 0.0,
        "high": 40.0,
        "risk_low": None,
        "risk_high": "Elevated liver enzymes",
    },
    {
        "name": "potassium",
        "display": "Potassium",
        "unit": "mEq/L",
        "pattern": r"\b(?:potassium|k\+)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 3.5,
        "high": 5.1,
        "risk_low": "Hypokalemia",
        "risk_high": "Hyperkalemia",
    },
    {
        "name": "sodium",
        "display": "Sodium",
        "unit": "mEq/L",
        "pattern": r"\b(?:sodium|na\+)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 135.0,
        "high": 145.0,
        "risk_low": "Hyponatremia",
        "risk_high": "Hypernatremia",
    },
    {
        "name": "chloride",
        "display": "Chloride",
        "unit": "mEq/L",
        "pattern": r"\b(?:chloride|cl)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 96.0,
        "high": 106.0,
        "risk_low": "Hypochloremia",
        "risk_high": "Hyperchloremia",
    },
    {
        "name": "bilirubin",
        "display": "Total Bilirubin",
        "unit": "mg/dL",
        "pattern": r"\b(?:total\s*bilirubin|bili)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 0.1,
        "high": 1.2,
        "risk_low": None,
        "risk_high": "Hyperbilirubinemia (possible liver or bile issue)",
    },
    {
        "name": "albumin",
        "display": "Albumin",
        "unit": "g/dL",
        "pattern": r"\b(?:albumin|alb)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 3.4,
        "high": 5.4,
        "risk_low": "Hypoalbuminemia",
        "risk_high": None,
    },
    {
        "name": "total_protein",
        "display": "Total Protein",
        "unit": "g/dL",
        "pattern": r"\b(?:total\s*protein|tp)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 6.0,
        "high": 8.3,
        "risk_low": "Low total protein",
        "risk_high": "High total protein",
    },
    {
        "name": "alp",
        "display": "Alkaline Phosphatase (ALP)",
        "unit": "U/L",
        "pattern": r"\b(?:alp|alkaline\s*phosphatase)\b[\s\(\)a-z\-,\/]*[:\-]?\s*[\n\r]*\s*([\d]+\.?\d*)",
        "low": 44.0,
        "high": 147.0,
        "risk_low": "Low ALP (possible nutrient deficiency)",
        "risk_high": "Elevated ALP (possible bone or liver issue)",
    },
]


def extract_metrics(raw_text: str) -> dict[str, Any]:
    """
    Parse key blood/lab metrics from raw OCR text using regex patterns.
    Includes normalization for common unit magnitude differences.
    """
    text_lower = raw_text.lower()
    metrics = {}

    for defn in METRIC_DEFINITIONS:
        match = re.search(defn["pattern"], text_lower)
        if match:
            try:
                value = float(match.group(1))
                
                # Normalization for WBC (if reported in cells/cu.mm instead of 10^3)
                if defn["name"] == "wbc" and value > 1000:
                    value = value / 1000.0
                
                # Normalization for Platelets (if reported in cells/cu.mm instead of 10^3)
                if defn["name"] == "platelets" and value > 100000:
                    value = value / 1000.0

                metrics[defn["name"]] = {
                    "value": value,
                    "unit": defn["unit"],
                    "display": defn["display"],
                }
            except ValueError:
                continue

    return metrics


def assess_risks(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Apply clinical threshold rules to extracted metrics.
    Includes severity logic (LOW, MEDIUM, HIGH) based on deviation magnitude.
    """
    risks = []
    defn_lookup = {d["name"]: d for d in METRIC_DEFINITIONS}

    for metric_name, metric_data in metrics.items():
        defn = defn_lookup.get(metric_name)
        if not defn:
            continue

        value = metric_data["value"]
        
        status = None
        risk_text = None
        deviation = 0.0

        if value < defn["low"] and defn["risk_low"]:
            status = "LOW"
            risk_text = defn["risk_low"]
            # Percentage deviation from low threshold
            deviation = (defn["low"] - value) / defn["low"] if defn["low"] != 0 else 0
        elif value > defn["high"] and defn["risk_high"]:
            status = "HIGH"
            risk_text = defn["risk_high"]
            # Percentage deviation from high threshold
            deviation = (value - defn["high"]) / defn["high"] if defn["high"] != 0 else 0

        if status:
            # Severity mapping
            if deviation < 0.15:
                severity = "LOW"
            elif deviation < 0.40:
                severity = "MEDIUM"
            else:
                severity = "HIGH"

            risks.append({
                "metric": defn["display"],
                "value": value,
                "unit": defn["unit"],
                "status": status,
                "severity": severity,
                "risk": risk_text,
            })

    return risks
