"""
Main Application Entry Point
Initializes the FastAPI application and includes routers from the MVC controllers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import shutil
import os

from backend.dependencies import vector_store_service
from backend.config import UPLOAD_DIR
from backend.controllers.document_controller import document_router
from backend.controllers.query_controller import query_router
from backend.controllers.medical_controller import medical_router
from backend.controllers.auth_controller import auth_router
from backend.controllers.user_controller import user_router

# Database paths
_DB_DIR = os.path.join(os.path.dirname(__file__), "database")
_PATIENTS_DIR = os.path.join(_DB_DIR, "patients")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — ensure directories exist
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    # Ensure file-based database directories exist
    os.makedirs(_DB_DIR, exist_ok=True)
    os.makedirs(_PATIENTS_DIR, exist_ok=True)
    for fname in ("users.json", "sessions.json"):
        fpath = os.path.join(_DB_DIR, fname)
        if not os.path.exists(fpath):
            with open(fpath, "w") as f:
                f.write("{}")
    print("HealthDoc AI: Database directory initialized.")
    yield
    # Shutdown
    print("Shutting down: Clearing uploads and vector store...")
    if os.path.exists(UPLOAD_DIR):
        shutil.rmtree(UPLOAD_DIR)
        os.makedirs(UPLOAD_DIR, exist_ok=True)

    vector_store_service.clear_index()
    print("Cleanup complete.")


app = FastAPI(title="HealthDoc AI", lifespan=lifespan)

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Controllers (Routers)
app.include_router(document_router)
app.include_router(query_router)
app.include_router(medical_router, prefix="/medical")
app.include_router(auth_router, prefix="/auth")
app.include_router(user_router, prefix="/user")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
