"""
Service instances are initialized here so they can be injected into or imported by the controllers.
"""
from backend.services.rag.ingestion.loader import PDFIngestion
from backend.services.rag.splitting.chunker import TextSplitter
from backend.services.rag.vector_store.store import VectorStore
from backend.services.rag.retrieval.search import RetrievalService
from backend.services.rag.generation.llm import GenerationService
from backend.config import UPLOAD_DIR

ingestion_service = PDFIngestion(upload_dir=UPLOAD_DIR)
splitter_service = TextSplitter()
vector_store_service = VectorStore()
retrieval_service = RetrievalService(vector_store_service)
generation_service = GenerationService()
