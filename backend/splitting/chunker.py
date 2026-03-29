from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

class TextSplitter:
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            is_separator_regex=False,
        )

    def split_documents(self, documents: List[Document]) -> List[Document]:
        """Splits documents into smaller chunks."""
        chunks = self.splitter.split_documents(documents)
        # Enhance metadata if needed (e.g., adding chunk IDs, though FAISS handles IDs internally mostly)
        for i, chunk in enumerate(chunks):
             chunk.metadata["chunk_id"] = i
        return chunks
