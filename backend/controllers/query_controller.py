"""
Query Controller
Handles routes related to querying the RAG system.
"""

import os
import logging
from fastapi import APIRouter, HTTPException
from backend.models.schemas import QueryRequest
from backend.views.responses import QueryResponse
from backend.dependencies import retrieval_service, generation_service

query_router = APIRouter(tags=["Query"])
logger = logging.getLogger(__name__)

@query_router.post("/query", response_model=QueryResponse)
async def query_document(request: QueryRequest):
    """Queries the RAG system and returns an answer with sources."""
    try:
        # 4. Retrieval
        relevant_docs = retrieval_service.retrieve(request.question)
        
        if not relevant_docs:
            return QueryResponse(
                answer="No relevant documents found. Please upload a document first.",
                sources=[]
            )

        # 5. Generation
        answer = generation_service.generate_answer(request.question, relevant_docs)
        
        # Extract sources for response
        sources = []
        for doc in relevant_docs:
            sources.append({
                "source": os.path.basename(doc.metadata.get("source", "Unknown")),
                "page": str(doc.metadata.get("page", "Unknown"))
            })

        return QueryResponse(
            answer=answer,
            sources=sources
        )

    except Exception as e:
        logger.exception(f"Error querying document: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process query: {str(e)}")
