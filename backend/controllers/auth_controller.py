"""
Auth Controller — FastAPI router for user registration, login, and session management.

POST /auth/register  →  Create new account
POST /auth/login     →  Authenticate and receive session token
POST /auth/logout    →  Invalidate session
GET  /auth/me        →  Get current user from token
"""
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, EmailStr
from typing import Optional

from backend.services.auth.auth_service import (
    register_user,
    login_user,
    validate_session,
    get_session_info,
    logout,
    get_user,
)

logger = logging.getLogger(__name__)
auth_router = APIRouter(tags=["Authentication"])


# ── Request/Response Models ────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_token_from_header(authorization: Optional[str]) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization[len("Bearer "):]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@auth_router.post("/register")
async def register(request: RegisterRequest):
    """Register a new user account."""
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Name is required.")
    if not request.email.strip():
        raise HTTPException(status_code=400, detail="Email is required.")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    try:
        user = register_user(request.name, request.email, request.password)
        # Auto-login after registration
        token = login_user(request.email, request.password)
        return {
            "message": "Account created successfully.",
            "token": token,
            "user": user,
        }
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.exception(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")


@auth_router.post("/login")
async def login(request: LoginRequest):
    """Authenticate a user and return a session token."""
    try:
        token = login_user(request.email, request.password)
        session = get_session_info(token)
        return {
            "message": "Login successful.",
            "token": token,
            "user": {
                "name": session.get("name"),
                "email": session.get("email"),
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        logger.exception(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Login failed. Please try again.")


@auth_router.post("/logout")
async def logout_endpoint(authorization: Optional[str] = Header(None)):
    """Invalidate the current session token."""
    token = _get_token_from_header(authorization)
    if token:
        logout(token)
    return {"message": "Logged out successfully."}


@auth_router.get("/me")
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Return the currently authenticated user's profile."""
    token = _get_token_from_header(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    user_id = validate_session(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")

    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return user
