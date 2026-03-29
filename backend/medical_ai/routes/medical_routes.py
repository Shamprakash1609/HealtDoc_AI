"""
Medical AI API Routes — FastAPI router for image and report analysis.

POST /medical/analyze-image  →  Medical image analysis via MedGemma
POST /medical/analyze-report →  Blood/lab report analysis pipeline
"""

import os
import json
import shutil
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from backend.medical_ai.services.image_analyzer import analyze_medical_image
from backend.medical_ai.services.ocr_parser import (
    extract_text_from_report,
    ApplicationError,
    ValidationError,
    ResourcesNotFoundError,
    OCREngineError
)
from backend.medical_ai.services.clinical_engine import extract_metrics, assess_risks
from backend.medical_ai.services.report_explainer import explain_report
from backend.medical_ai.services.chat_assistant import generate_chat_response, ChatQueryError

# ─── Constants ────────────────────────────────────────────────────────────────
MEDICAL_UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "medical_uploads")
MEDICAL_REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "medical_reports")

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/tiff", "image/bmp"}
ALLOWED_REPORT_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/jpg"}
MAX_FILE_SIZE_MB = 20

# ─── Response Models ──────────────────────────────────────────────────────────

class ImageAnalysisResponse(BaseModel):
    """Response for medical image analysis."""
    filename: str
    description: str
    findings: list[str]
    explanation: str
    importance: str


class ReportAnalysisResponse(BaseModel):
    """Response for medical report analysis."""
    filename: str
    metrics: dict[str, Any]
    risks: list[dict[str, Any]]
    explanation: str
    report_id: str


from typing import Optional

class ChatQueryRequest(BaseModel):
    """Incoming request for a medical chat query."""
    query: str
    context: Optional[str] = None


class ChatQueryResponse(BaseModel):
    """Outgoing response for a medical chat query."""
    answer: str
    suggestions: list[str]


# ─── Router ───────────────────────────────────────────────────────────────────
medical_router = APIRouter(tags=["Medical AI"])


def _ensure_dirs():
    """Create upload and report directories if they don't exist."""
    os.makedirs(MEDICAL_UPLOADS_DIR, exist_ok=True)
    os.makedirs(MEDICAL_REPORTS_DIR, exist_ok=True)


def _validate_file_size(file: UploadFile):
    """Validate that the uploaded file doesn't exceed the size limit."""
    # Read a chunk to check — FastAPI doesn't provide size upfront
    # We'll enforce this after saving
    pass


def _save_upload(file: UploadFile, subdir: str = "") -> str:
    """Save uploaded file to medical_uploads and return the path."""
    _ensure_dirs()
    target_dir = os.path.join(MEDICAL_UPLOADS_DIR, subdir) if subdir else MEDICAL_UPLOADS_DIR
    os.makedirs(target_dir, exist_ok=True)

    file_path = os.path.join(target_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Enforce max file size after save
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        os.remove(file_path)
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file_size_mb:.1f}MB exceeds {MAX_FILE_SIZE_MB}MB limit.",
        )

    return file_path


def _save_report_json(report_data: dict, filename: str) -> str:
    """Save the JSON knowledge object to medical_reports/."""
    _ensure_dirs()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_id = f"{os.path.splitext(filename)[0]}_{timestamp}"
    report_path = os.path.join(MEDICAL_REPORTS_DIR, f"{report_id}.json")

    with open(report_path, "w") as f:
        json.dump(report_data, f, indent=2)

    return report_id


def _embed_summary_in_faiss(summary_text: str, source_name: str):
    """Embed report summary into the existing FAISS vector store."""
    try:
        from backend.vector_store.store import VectorStore
        from langchain_core.documents import Document

        vector_store = VectorStore()
        doc = Document(
            page_content=summary_text,
            metadata={
                "source": f"medical_report:{source_name}",
                "page": 1,
                "type": "medical_report",
            },
        )
        vector_store.add_documents([doc])
    except Exception as e:
        # Don't fail the entire request if FAISS embedding fails
        print(f"[Medical AI] Warning: Failed to embed in FAISS: {e}")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@medical_router.post("/analyze-image", response_model=ImageAnalysisResponse)
async def analyze_image_endpoint(file: UploadFile = File(...)):
    """
    Analyze a medical image (X-Ray, CT, MRI) using MedGemma.

    Accepts: PNG, JPEG, TIFF, BMP
    Max size: 20MB
    """
    # Validate file type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    try:
        file_path = _save_upload(file, subdir="images")
        analysis_dict = analyze_medical_image(file_path)

        # Extract fields with safe defaults
        desc = analysis_dict.get("description", "Not provided")
        diag = analysis_dict.get("diagnosis", "Clinical evaluation pending review")
        findings = analysis_dict.get("findings", [])
        exp = analysis_dict.get("explanation", "Please consult a healthcare professional.")
        imp = analysis_dict.get("importance", "Review Recommended")

        # Synthesize markdown 'analysis' field for frontend compatibility
        findings_markdown = "\n".join([f"- {f}" for f in findings])
        analysis_markdown = f"""## Diagnosis
{diag}

## Description
{desc}

## Findings
{findings_markdown}

## Explanation
{exp}

## Urgency
{imp}
"""

        return ImageAnalysisResponse(
            filename=file.filename,
            description=desc,
            diagnosis=diag,
            findings=findings,
            explanation=exp,
            importance=imp,
            analysis=analysis_markdown.strip()
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)}")


@medical_router.post("/analyze-report", response_model=ReportAnalysisResponse)
async def analyze_report_endpoint(file: UploadFile = File(...)):
    """
    Analyze a medical report (blood test, lab report).

    Pipeline: OCR → Metric Extraction → Risk Assessment → MedGemma Explanation → FAISS Embedding

    Accepts: PDF, PNG, JPEG
    Max size: 20MB
    """
    # Validate file type
    if file.content_type not in ALLOWED_REPORT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: {', '.join(ALLOWED_REPORT_TYPES)}",
        )

    try:
        # Step 1: Save and OCR
        file_path = _save_upload(file, subdir="reports")
        raw_text = extract_text_from_report(file_path)

        if not raw_text.strip():
            raise HTTPException(
                status_code=422,
                detail="Could not extract any text from the uploaded report. Ensure the file is readable.",
            )

        # Step 2: Extract structured metrics
        metrics = extract_metrics(raw_text)

        # Step 3: Assess clinical risks
        risks = assess_risks(metrics)

        # Step 4: Generate MedGemma explanation
        explanation = explain_report(metrics, risks)

        # Step 5: Build JSON knowledge object
        report_data = {
            "report_type": "blood_test",
            "filename": file.filename,
            "timestamp": datetime.now().isoformat(),
            "raw_text": raw_text[:2000],  # Truncate for storage
            "metrics": {k: v["value"] for k, v in metrics.items()},
            "risks": [r["risk"] for r in risks],
            "explanation": explanation,
        }

        # Step 6: Save JSON locally
        report_id = _save_report_json(report_data, file.filename)

        # Step 7: Embed summary into FAISS
        summary_parts = [f"Medical report: {file.filename}"]
        for name, data in metrics.items():
            summary_parts.append(f"{data['display']}: {data['value']} {data['unit']}")
        for r in risks:
            summary_parts.append(f"Risk: {r['risk']}")
        summary_text = "\n".join(summary_parts)

        _embed_summary_in_faiss(summary_text, file.filename)

        return ReportAnalysisResponse(
            filename=file.filename,
            metrics=metrics,
            risks=risks,
            explanation=explanation,
            report_id=report_id,
        )

    except ValidationError as e:
        logger.error(f"Validation Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except ResourcesNotFoundError as e:
        logger.error(f"Resource Not Found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except OCREngineError as e:
        logger.error(f"OCR Engine Error: {e}")
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {str(e)}")
    except ApplicationError as e:
        logger.error(f"Application Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"Unexpected Report Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=f"Report analysis failed: {str(e)}")


@medical_router.post("/chat", response_model=ChatQueryResponse)
async def medical_chat_endpoint(request: ChatQueryRequest):
    """
    Handle user medical queries via MedGemma.
    This route specifically focuses on speed and layman-friendly responses.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    try:
        response_dict = generate_chat_response(
            query=request.query, 
            context=request.context
        )
        return ChatQueryResponse(
            answer=response_dict.get("answer", "I couldn't generate an answer."),
            suggestions=response_dict.get("suggestions", [])
        )
        
    except ChatQueryError as e:
        logger.error(f"Chat Query Service Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"Unexpected Chat Error: {e}")
        raise HTTPException(status_code=500, detail=f"Medical chat failed: {str(e)}")