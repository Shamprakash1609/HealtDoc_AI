"""
Document Controller
Handles routes related to uploading, listing, and deleting documents for the RAG system.
"""

import os
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from backend.dependencies import ingestion_service, splitter_service, vector_store_service

document_router = APIRouter(tags=["Documents"])
logger = logging.getLogger(__name__)

@document_router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Uploads a PDF document, processes it, and adds it to the vector store."""
    try:
        # 1. Loading
        documents = await ingestion_service.process_upload(file)
        
        # 2. Splitting
        chunks = splitter_service.split_documents(documents)
        
        # 3. Storage
        vector_store_service.add_documents(chunks)
        
        return {"message": f"Successfully processed {file.filename}.", "chunks": len(chunks)}
    except Exception as e:
        logger.exception(f"Error uploading document {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@document_router.get("/documents")
async def list_documents():
    """Lists all uploaded documents."""
    if not os.path.exists(ingestion_service.upload_dir):
        return []
    files = os.listdir(ingestion_service.upload_dir)
    return [f for f in files if f.endswith('.pdf')]

@document_router.delete("/documents/{filename}")
async def delete_document(filename: str):
    """Deletes a document and rebuilds the vector index."""
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
        
        # Re-ingest all remaining
        for f_name in remaining_files:
            f_path = os.path.join(ingestion_service.upload_dir, f_name)
            docs = ingestion_service.load_pdf(f_path)
            chunks = splitter_service.split_documents(docs)
            vector_store_service.add_documents(chunks)
            processed_count += 1
            total_chunks += len(chunks)
            
        return {"message": f"Deleted {filename}. Re-indexed {processed_count} documents ({total_chunks} chunks)."}
        
    except Exception as e:
        logger.exception(f"Error deleting document {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")
