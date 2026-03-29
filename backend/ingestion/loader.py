import os
import shutil
from typing import List, Tuple
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document
from fastapi import UploadFile

class PDFIngestion:
    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)

    async def save_file(self, file: UploadFile) -> str:
        """Saves the uploaded file to disk and returns the file path."""
        file_path = os.path.join(self.upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return file_path

    def load_pdf(self, file_path: str) -> List[Document]:
        """Loads a PDF and extracts text with metadata."""
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        
        # PyPDFLoader is 0-indexed, so we add 1 to the page number
        for doc in documents:
            if "page" in doc.metadata and isinstance(doc.metadata["page"], int):
                doc.metadata["page"] += 1
                
        return documents

    async def process_upload(self, file: UploadFile) -> List[Document]:
        """Orchestrates saving and loading of a PDF."""
        file_path = await self.save_file(file)
        return self.load_pdf(file_path)
