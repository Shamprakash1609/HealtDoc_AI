from fastapi import FastAPI, UploadFile, File, HTTPException
from contextlib import asynccontextmanager
import shutil
import os
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict

from backend.ingestion.loader import PDFIngestion
from backend.splitting.chunker import TextSplitter
from backend.vector_store.store import VectorStore
from backend.retrieval.search import RetrievalService
from backend.generation.llm import GenerationService
from backend.medical_ai.routes.medical_routes import medical_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — ensure directories exist
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("medical_uploads", exist_ok=True)
    os.makedirs("medical_reports", exist_ok=True)
    yield
    # Shutdown
    print("Shutting down: Clearing uploads and vector store...")
    if os.path.exists("uploads"):
        shutil.rmtree("uploads")
        os.makedirs("uploads", exist_ok=True)
    
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

# Register Medical AI router
app.include_router(medical_router, prefix="/medical")

# Services Initialization
ingestion_service = PDFIngestion()
splitter_service = TextSplitter()
vector_store_service = VectorStore()
retrieval_service = RetrievalService(vector_store_service)
generation_service = GenerationService()

class QueryRequest(BaseModel):
    question: str

class QueryResponse(BaseModel):
    answer: str
    sources: List[Dict[str, str]]

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    try:
        # 1. Loading
        documents = await ingestion_service.process_upload(file)
        
        # 2. Splitting
        chunks = splitter_service.split_documents(documents)
        
        # 3. Storage
        vector_store_service.add_documents(chunks)
        
        return {"message": f"Successfully processed {file.filename}.", "chunks": len(chunks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents")
async def list_documents():
    """Lists all uploaded documents."""
    if not os.path.exists(ingestion_service.upload_dir):
        return []
    files = os.listdir(ingestion_service.upload_dir)
    return [f for f in files if f.endswith('.pdf')]

@app.delete("/documents/{filename}")
async def delete_document(filename: str):
    """Deletes a document and rebuilds the index."""
    file_path = os.path.join(ingestion_service.upload_dir, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # 1. Remove the file
        os.remove(file_path)
        
        # 2. Rebuild Index
        # Clear existing
        vector_store_service.clear_index()
        
        # Get remaining files
        remaining_files = [f for f in os.listdir(ingestion_service.upload_dir) if f.endswith('.pdf')]
        
        processed_count = 0
        total_chunks = 0
        
        # Re-ingest all
        for f_name in remaining_files:
            f_path = os.path.join(ingestion_service.upload_dir, f_name)
            # We can use ingestion_service.load_pdf directly since it's already saved
            docs = ingestion_service.load_pdf(f_path)
            chunks = splitter_service.split_documents(docs)
            vector_store_service.add_documents(chunks)
            processed_count += 1
            total_chunks += len(chunks)
            
        return {"message": f"Deleted {filename}. Re-indexed {processed_count} documents ({total_chunks} chunks)."}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query", response_model=QueryResponse)
async def query_document(request: QueryRequest):
    try:
        # 4. Retrieval
        relevant_docs = retrieval_service.retrieve(request.question)
        
        if not relevant_docs:
            return {
                "answer": "No relevant documents found. Please upload a document first.",
                "sources": []
            }

        # 5. Generation
        answer = generation_service.generate_answer(request.question, relevant_docs)
        
        # Extract sources for response
        sources = []
        for doc in relevant_docs:
            sources.append({
                "source": os.path.basename(doc.metadata.get("source", "Unknown")),
                "page": str(doc.metadata.get("page", "Unknown"))
            })

        return {
            "answer": answer,
            "sources": sources
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


import os
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
