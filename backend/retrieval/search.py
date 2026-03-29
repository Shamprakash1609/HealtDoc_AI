from typing import List
from langchain_core.documents import Document
from backend.vector_store.store import VectorStore

class RetrievalService:
    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store

    def retrieve(self, query: str, k: int = 10) -> List[Document]:
        """Retrieves top-k relevant documents for a given query."""
        # Check if vector store has data
        if self.vector_store.db is None:
            return []
            
        retriever = self.vector_store.get_retriever(search_kwargs={"k": k})
        return retriever.invoke(query)
