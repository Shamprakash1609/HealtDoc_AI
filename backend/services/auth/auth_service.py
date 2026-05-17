"""
Auth Service — File-based user management.
Uses stdlib only: hashlib for password hashing, uuid for tokens/user IDs.
Data stored in backend/database/users.json and sessions.json.
"""
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────
_DB_DIR      = os.path.join(os.path.dirname(__file__), "..", "..", "database")
_USERS_FILE  = os.path.join(_DB_DIR, "users.json")
_SESSIONS_FILE = os.path.join(_DB_DIR, "sessions.json")
SESSION_TTL_HOURS = 24 * 7  # 7-day sessions


def _ensure_db():
    """Ensure the database directory and files exist."""
    os.makedirs(_DB_DIR, exist_ok=True)
    if not os.path.exists(_USERS_FILE):
        with open(_USERS_FILE, "w") as f:
            json.dump({}, f)
    if not os.path.exists(_SESSIONS_FILE):
        with open(_SESSIONS_FILE, "w") as f:
            json.dump({}, f)


def _read_json(path: str) -> dict:
    _ensure_db()
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}


def _write_json(path: str, data: dict):
    _ensure_db()
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _hash_password(password: str, salt: str) -> str:
    combined = f"{salt}{password}".encode("utf-8")
    return hashlib.sha256(combined).hexdigest()


# ── Public API ─────────────────────────────────────────────────────────────────

def register_user(name: str, email: str, password: str) -> dict:
    """
    Register a new user.
    Returns: { user_id, name, email }
    Raises: ValueError if email already exists.
    """
    users = _read_json(_USERS_FILE)

    # Check email uniqueness (case-insensitive)
    email_lower = email.strip().lower()
    for uid, user in users.items():
        if user.get("email", "").lower() == email_lower:
            raise ValueError("An account with this email already exists.")

    # Create user
    user_id = str(uuid.uuid4())
    salt = str(uuid.uuid4())
    password_hash = _hash_password(password, salt)

    users[user_id] = {
        "name": name.strip(),
        "email": email_lower,
        "password_hash": password_hash,
        "salt": salt,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_json(_USERS_FILE, users)

    # Create patient folder
    from backend.services.database.db_service import _ensure_patient_dir
    _ensure_patient_dir(user_id)

    logger.info(f"[Auth] Registered new user: {email_lower} ({user_id})")
    return {"user_id": user_id, "name": name.strip(), "email": email_lower}


def login_user(email: str, password: str) -> str:
    """
    Authenticate user by email and password.
    Returns: session_token string.
    Raises: ValueError on invalid credentials.
    """
    users = _read_json(_USERS_FILE)
    email_lower = email.strip().lower()

    matched_uid = None
    matched_user = None
    for uid, user in users.items():
        if user.get("email", "").lower() == email_lower:
            matched_uid = uid
            matched_user = user
            break

    if matched_user is None:
        raise ValueError("Invalid email or password.")

    expected_hash = _hash_password(password, matched_user["salt"])
    if expected_hash != matched_user["password_hash"]:
        raise ValueError("Invalid email or password.")

    # Create session token
    token = str(uuid.uuid4())
    sessions = _read_json(_SESSIONS_FILE)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)).isoformat()
    sessions[token] = {
        "user_id": matched_uid,
        "expires_at": expires_at,
        "name": matched_user["name"],
        "email": email_lower,
    }
    _write_json(_SESSIONS_FILE, sessions)

    logger.info(f"[Auth] User logged in: {email_lower}")
    return token


def validate_session(token: str) -> Optional[str]:
    """
    Validate a session token. Returns user_id if valid, None if expired/invalid.
    Also prunes expired sessions lazily.
    """
    if not token:
        return None

    sessions = _read_json(_SESSIONS_FILE)
    session = sessions.get(token)
    if not session:
        return None

    # Check expiry
    try:
        expires_at = datetime.fromisoformat(session["expires_at"])
        if datetime.now(timezone.utc) > expires_at:
            # Expired — remove and return None
            del sessions[token]
            _write_json(_SESSIONS_FILE, sessions)
            return None
    except (ValueError, KeyError):
        return None

    return session["user_id"]


def get_user(user_id: str) -> Optional[dict]:
    """Return user profile dict (without password fields)."""
    users = _read_json(_USERS_FILE)
    user = users.get(user_id)
    if not user:
        return None
    return {
        "user_id": user_id,
        "name": user.get("name"),
        "email": user.get("email"),
        "created_at": user.get("created_at"),
    }


def get_session_info(token: str) -> Optional[dict]:
    """Return session info including name and email for the given token."""
    sessions = _read_json(_SESSIONS_FILE)
    return sessions.get(token)


def logout(token: str):
    """Invalidate a session token."""
    sessions = _read_json(_SESSIONS_FILE)
    if token in sessions:
        del sessions[token]
        _write_json(_SESSIONS_FILE, sessions)
