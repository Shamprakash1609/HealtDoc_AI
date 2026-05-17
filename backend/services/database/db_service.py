"""
Database Service — Per-user EHR and NutriPlan file storage.
Each user gets their own directory under backend/database/patients/{user_id}/.
"""
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_DB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "database")
_PATIENTS_DIR = os.path.join(_DB_DIR, "patients")


def _ensure_patient_dir(user_id: str):
    """Create the patient directory for a user if it doesn't exist."""
    patient_dir = os.path.join(_PATIENTS_DIR, user_id)
    os.makedirs(patient_dir, exist_ok=True)
    return patient_dir


def _patient_file(user_id: str, filename: str) -> str:
    return os.path.join(_PATIENTS_DIR, user_id, filename)


def _read_patient_json(user_id: str, filename: str, default):
    path = _patient_file(user_id, filename)
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return default


def _write_patient_json(user_id: str, filename: str, data):
    _ensure_patient_dir(user_id)
    path = _patient_file(user_id, filename)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ── EHR Records ────────────────────────────────────────────────────────────────

def save_ehr_record(user_id: str, record: dict) -> str:
    """
    Append an EHR record to the user's ehr_records.json file.
    Returns the record_id.
    """
    records = _read_patient_json(user_id, "ehr_records.json", [])
    record_id = record.get("record_id") or str(uuid.uuid4())
    record["record_id"] = record_id
    record.setdefault("saved_at", datetime.now(timezone.utc).isoformat())
    records.append(record)
    _write_patient_json(user_id, "ehr_records.json", records)
    logger.info(f"[DB] Saved EHR record {record_id} for user {user_id}")
    return record_id


def get_ehr_records(user_id: str) -> list:
    """Return all EHR records for the user, newest first."""
    records = _read_patient_json(user_id, "ehr_records.json", [])
    return list(reversed(records))  # newest first


def get_ehr_record(user_id: str, record_id: str) -> Optional[dict]:
    """Return a single EHR record by ID."""
    records = _read_patient_json(user_id, "ehr_records.json", [])
    for r in records:
        if r.get("record_id") == record_id:
            return r
    return None


# ── NutriPlan Data ─────────────────────────────────────────────────────────────

def save_nutri_data(user_id: str, data: dict):
    """Overwrite (or create) the user's nutri_data.json with the latest plan."""
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_patient_json(user_id, "nutri_data.json", data)
    logger.info(f"[DB] Saved nutri data for user {user_id}")


def get_nutri_data(user_id: str) -> Optional[dict]:
    """Return the user's latest NutriPlan data, or None."""
    data = _read_patient_json(user_id, "nutri_data.json", None)
    return data


# ── Dashboard Summary ──────────────────────────────────────────────────────────

def get_dashboard_summary(user_id: str) -> dict:
    """
    Aggregate data for the InsightsDashboard.
    Returns a single dict with all data the dashboard needs.
    """
    records = get_ehr_records(user_id)
    nutri = get_nutri_data(user_id)

    total_reports = len(records)
    total_risks = sum(len(r.get("risks", [])) for r in records)
    last_analysis = records[0].get("saved_at") if records else None

    # Health score: simple heuristic (starts at 100, deduct per flagged risk)
    health_score = max(0, 100 - (total_risks * 8))

    # Recent 5 records (already newest first)
    recent_records = records[:5]

    return {
        "total_reports": total_reports,
        "total_risks": total_risks,
        "last_analysis": last_analysis,
        "health_score": health_score,
        "recent_records": recent_records,
        "nutri_data": nutri,
    }
