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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — ensure directories exist
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    yield
    # Shutdown
    print("Shutting down: Clearing uploads and vector store...")
    if os.path.exists(UPLOAD_DIR):
        shutil.rmtree(UPLOAD_DIR)
        os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    vector_store_service.clear_index()
    print("Cleanup complete.")

app = FastAPI(title="DocQuery RAG System", lifespan=lifespan)

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
