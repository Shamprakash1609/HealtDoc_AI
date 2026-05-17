"""
Pydantic Models for Responses (Views)
Defines all outgoing response structures for the API.
"""
from pydantic import BaseModel
from typing import List, Dict, Any

class QueryResponse(BaseModel):
    """Outgoing response for a RAG query."""
    answer: str
    sources: List[Dict[str, str]]

class ImageAnalysisResponse(BaseModel):
    """Response for medical image analysis."""
    filename: str
    description: str
    findings: List[str]
    explanation: str
    importance: str
    analysis: str

class ReportAnalysisResponse(BaseModel):
    """Response for medical report analysis."""
    filename: str
    metrics: Dict[str, Any]
    risks: List[Dict[str, Any]]
    explanation: str
    report_id: str

class ChatQueryResponse(BaseModel):
    """Outgoing response for a medical chat query."""
    answer: str
    suggestions: List[str]
