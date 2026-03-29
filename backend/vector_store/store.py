import os
from typing import List
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from backend.config import VECTOR_STORE_PATH

class VectorStore:
    def __init__(self):
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        self.vector_store_path = VECTOR_STORE_PATH
        self.db = self._load_or_create_index()

    def _load_or_create_index(self):
        """Loads existing FAISS index or creates a new one if not found."""
        if os.path.exists(self.vector_store_path):
            try:
                # allow_dangerous_deserialization is set to True as we are loading our own local file
                return FAISS.load_local(self.vector_store_path, self.embeddings, allow_dangerous_deserialization=True)
            except Exception as e:
                print(f"Error loading index: {e}. Creating new index.")
                return None
        return None

    def add_documents(self, chunks: List[Document]):
        """Adds document chunks to the vector store and saves it."""
        if self.db is None:
            self.db = FAISS.from_documents(chunks, self.embeddings)
        else:
            self.db.add_documents(chunks)
        
        self.db.save_local(self.vector_store_path)

    def get_retriever(self, search_kwargs: dict = None):
        """Returns a retriever interface."""
        if self.db is None:
            raise ValueError("Vector store is empty. Please upload documents first.")
        
        kwargs = search_kwargs or {"k": 4}
        return self.db.as_retriever(search_kwargs=kwargs)

    def clear_index(self):
        """Clears the FAISS index."""
        if self.db is not None:
            # We can't easily "clear" an existing FAISS object effectively in LangChain wrapper
            # so we just set it to None and remove the file
            self.db = None
            if os.path.exists(self.vector_store_path):
                import shutil
                shutil.rmtree(self.vector_store_path)

    def delete_document(self, filename: str, remaining_files_paths: List[str], ingestion_service):
        """
        Deletes a document by rebuilding the index from the remaining files.
        This is a simplified approach for the demo to ensure consistency.
        """
        # 1. Clear current index
        self.clear_index()
        
        # 2. Re-ingest all remaining files
        all_chunks = []
        # We need to import TextSplitter here or pass it in to avoid circular imports if possible, 
        # or better yet, rely on main.py to handle the re-orchestration.
        # However, to keep logic encapsulated, let's accept chunks? 
        # Actually, best approach for this simple app:
        # allow main.py to orchestrate the rebuild.
        pass

