"""
User Data Controller — Protected routes for EHR records, NutriPlan data, and dashboard.

All endpoints require: Authorization: Bearer <token>

POST /user/ehr           →  Save a new EHR record
GET  /user/ehr           →  List all EHR records
GET  /user/ehr/{id}      →  Get specific EHR record
POST /user/nutri-data    →  Save NutriPlan data
GET  /user/nutri-data    →  Get saved NutriPlan data
GET  /user/dashboard     →  Full dashboard summary
"""
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, Any, Dict, List

from backend.services.auth.auth_service import validate_session
from backend.services.database.db_service import (
    save_ehr_record,
    get_ehr_records,
    get_ehr_record,
    save_nutri_data,
    get_nutri_data,
    get_dashboard_summary,
)

logger = logging.getLogger(__name__)
user_router = APIRouter(tags=["User Data"])


# ── Auth Helper ────────────────────────────────────────────────────────────────

def _require_user(authorization: Optional[str]) -> str:
    """Extract and validate token; return user_id or raise 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = authorization[len("Bearer "):]
    user_id = validate_session(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please log in again.")
    return user_id


# ── Request Models ─────────────────────────────────────────────────────────────

class EHRSaveRequest(BaseModel):
    """EHR record sent from the Smart Reports frontend after analysis."""
    filename: str
    report_type: str = "blood_test"
    source: str = "report"          # "report" | "image"
    metrics: Optional[Dict[str, Any]] = None
    risks: Optional[List[Any]] = None
    explanation: Optional[str] = None
    diagnosis: Optional[str] = None
    findings: Optional[List[str]] = None
    report_id: Optional[str] = None


class NutriDataRequest(BaseModel):
    """NutriPlan data sent from the NutriPlan frontend calculator."""
    age: Optional[int] = None
    gender: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    activity_level: Optional[float] = None
    goal: Optional[str] = None
    calories: Optional[int] = None
    protein_g: Optional[int] = None
    fat_g: Optional[int] = None
    carb_g: Optional[int] = None
    protein_pct: Optional[int] = None
    fat_pct: Optional[int] = None
    carb_pct: Optional[int] = None
    bmr: Optional[int] = None
    tdee: Optional[int] = None
    weekly_change_kg: Optional[float] = None
    diet_type: Optional[str] = None
    protein_target_g_per_kg: Optional[float] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@user_router.post("/ehr")
async def save_ehr(request: EHRSaveRequest, authorization: Optional[str] = Header(None)):
    """Save an EHR record (called by Smart Reports after successful analysis)."""
    user_id = _require_user(authorization)
    try:
        record = request.model_dump()
        record_id = save_ehr_record(user_id, record)
        return {"message": "EHR record saved.", "record_id": record_id}
    except Exception as e:
        logger.exception(f"Failed to save EHR: {e}")
        raise HTTPException(status_code=500, detail="Failed to save EHR record.")


@user_router.get("/ehr")
async def list_ehr(authorization: Optional[str] = Header(None)):
    """Return all EHR records for the authenticated user."""
    user_id = _require_user(authorization)
    records = get_ehr_records(user_id)
    return {"records": records, "total": len(records)}


@user_router.get("/ehr/{record_id}")
async def get_single_ehr(record_id: str, authorization: Optional[str] = Header(None)):
    """Return a single EHR record by ID."""
    user_id = _require_user(authorization)
    record = get_ehr_record(user_id, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="EHR record not found.")
    return record


@user_router.post("/nutri-data")
async def save_nutri(request: NutriDataRequest, authorization: Optional[str] = Header(None)):
    """Save the user's NutriPlan data (overwrite latest)."""
    user_id = _require_user(authorization)
    try:
        save_nutri_data(user_id, request.model_dump(exclude_none=True))
        return {"message": "NutriPlan data saved."}
    except Exception as e:
        logger.exception(f"Failed to save nutri data: {e}")
        raise HTTPException(status_code=500, detail="Failed to save NutriPlan data.")


@user_router.get("/nutri-data")
async def get_nutri(authorization: Optional[str] = Header(None)):
    """Return the user's latest NutriPlan data."""
    user_id = _require_user(authorization)
    data = get_nutri_data(user_id)
    if not data:
        return {"nutri_data": None}
    return {"nutri_data": data}


@user_router.get("/dashboard")
async def get_dashboard(authorization: Optional[str] = Header(None)):
    """Return aggregated data for the InsightsDashboard."""
    user_id = _require_user(authorization)
    summary = get_dashboard_summary(user_id)
    return summary
