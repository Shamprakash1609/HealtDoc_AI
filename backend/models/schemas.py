"""
Pydantic Models (Schemas) for the Backend
Defines all incoming request structures.
"""
from pydantic import BaseModel
from typing import Optional

class QueryRequest(BaseModel):
    """Incoming request for querying the RAG system."""
    question: str

class ChatQueryRequest(BaseModel):
    """Incoming request for a medical chat query."""
    query: str
    context: Optional[str] = None
