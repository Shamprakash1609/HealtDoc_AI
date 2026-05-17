"""
seed_dev_user.py — Create John Wick as the default dev user.

Run from the HealthDoc directory:
    python seed_dev_user.py

This directly writes to the JSON database files, bypassing the backend server.
"""
import hashlib
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

# ── Config ──────────────────────────────────────────────────────────────────────
DEV_USER = {
    "name":     "John Wick",
    "email":    "jhon141@gmail.com",
    "password": "12345678",
}

# Fixed IDs for reproducibility (can be any UUIDs)
DEV_USER_ID = "dev-john-wick-0000-0000-000000000001"
DEV_TOKEN   = "jw-dev-token-healthdoc-2026"

# ── Paths ────────────────────────────────────────────────────────────────────────
BASE         = os.path.dirname(os.path.abspath(__file__))
DB_DIR       = os.path.join(BASE, "backend", "database")
PATIENTS_DIR = os.path.join(DB_DIR, "patients")
USERS_FILE   = os.path.join(DB_DIR, "users.json")
SESSIONS_FILE = os.path.join(DB_DIR, "sessions.json")
PATIENT_DIR  = os.path.join(PATIENTS_DIR, DEV_USER_ID)

# ── Helpers ──────────────────────────────────────────────────────────────────────
def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def _read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  ✅ Written: {path}")

# ── Main ─────────────────────────────────────────────────────────────────────────
def main():
    print("\n🌱 Seeding dev user: John Wick")
    print("=" * 50)

    # 1. Ensure directories exist
    os.makedirs(DB_DIR, exist_ok=True)
    os.makedirs(PATIENTS_DIR, exist_ok=True)
    os.makedirs(PATIENT_DIR, exist_ok=True)
    print(f"  ✅ Database dirs ready")

    # 2. Create user in users.json
    users = _read_json(USERS_FILE)
    if DEV_USER_ID in users:
        print(f"  ℹ️  User already exists, updating...")
    
    salt = f"dev-salt-{DEV_USER_ID}"
    users[DEV_USER_ID] = {
        "name":          DEV_USER["name"],
        "email":         DEV_USER["email"],
        "password_hash": _hash_password(DEV_USER["password"], salt),
        "salt":          salt,
        "created_at":    datetime.now(timezone.utc).isoformat(),
    }
    _write_json(USERS_FILE, users)

    # 3. Create a long-lived session (expires 1 year from now)
    sessions = _read_json(SESSIONS_FILE)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    sessions[DEV_TOKEN] = {
        "user_id":    DEV_USER_ID,
        "expires_at": expires_at,
        "name":       DEV_USER["name"],
        "email":      DEV_USER["email"],
    }
    _write_json(SESSIONS_FILE, sessions)

    # 4. Create empty EHR and NutriPlan files (if not already there)
    ehr_file   = os.path.join(PATIENT_DIR, "ehr_records.json")
    nutri_file = os.path.join(PATIENT_DIR, "nutri_data.json")

    if not os.path.exists(ehr_file):
        _write_json(ehr_file, [])
    else:
        print(f"  ℹ️  EHR file already exists, skipping")

    if not os.path.exists(nutri_file):
        print(f"  ℹ️  No NutriPlan data yet (will appear after first use)")
    else:
        print(f"  ℹ️  NutriPlan file already exists")

    print("\n" + "=" * 50)
    print("✅ Dev user ready!\n")
    print(f"  Name:     {DEV_USER['name']}")
    print(f"  Email:    {DEV_USER['email']}")
    print(f"  Password: {DEV_USER['password']}")
    print(f"  User ID:  {DEV_USER_ID}")
    print(f"  Token:    {DEV_TOKEN}")
    print(f"  Session:  valid for 1 year")
    print("\n⚡ The frontend will auto-login as John Wick when the backend isn't running.")
    print("   Start the backend for full functionality:\n")
    print("   source backend/.venv/bin/activate")
    print("   uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload\n")

if __name__ == "__main__":
    main()
