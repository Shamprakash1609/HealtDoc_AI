"""
OCR Document Parser — Extract text from PDFs & images using PaddleOCR.

Implements robust error handling and graceful degradation per err-handler.md.
"""

import os
import sys
import types
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# ─── Robust Error Handling Definitions ────────────────────────────────────────

class ApplicationError(Exception):
    """Base exception for all application errors."""
    def __init__(self, message: str, code: str = None, details: dict = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}
        self.timestamp = datetime.utcnow()

class ValidationError(ApplicationError):
    """Raised when validation fails (e.g., unsupported file type)."""
    pass

class ResourcesNotFoundError(ApplicationError):
    """Raised when requested file or resource is not found."""
    pass

class OCREngineError(ApplicationError):
    """Raised when PaddleOCR integration fails."""
    def __init__(self, message: str, **kwargs):
        super().__init__(message, code="OCR_ENGINE_ERROR", **kwargs)

# ─── PaddleOCR Dependency Monkeypatch ─────────────────────────────────────────

def _apply_paddleocr_monkeypatches():
    """
    PaddleOCR v2.7 uses obsolete LangChain imports (docstore, text_splitter)
    which break in newer Langchain versions. We mock them here to prevent crashes.
    """
    try:
        if 'langchain.docstore' not in sys.modules:
            from langchain_core.documents import Document
            docstore = types.ModuleType('langchain.docstore')
            doc_mod = types.ModuleType('langchain.docstore.document')
            doc_mod.Document = Document
            docstore.document = doc_mod
            sys.modules['langchain.docstore'] = docstore
            sys.modules['langchain.docstore.document'] = doc_mod

        if 'langchain.text_splitter' not in sys.modules:
            try:
                from langchain_text_splitters import RecursiveCharacterTextSplitter
            except ImportError:
                RecursiveCharacterTextSplitter = object # Dummy object
            text_splitter = types.ModuleType('langchain.text_splitter')
            text_splitter.RecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter
            sys.modules['langchain.text_splitter'] = text_splitter

    except Exception as e:
        logger.warning(f"[OCR] Failed to apply monkeypatches for PaddleOCR: {e}")

# Apply patches before importing PaddleOCR
_apply_paddleocr_monkeypatches()

# ─── OCR Engine Lazy Loader ───────────────────────────────────────────────────

_ocr_engine = None

def _get_ocr_engine():
    """Lazy-load PaddleOCR engine with proper error handling."""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from paddleocr import PaddleOCR
            # Using english language and disabling angle classification for speed
            _ocr_engine = PaddleOCR(
                use_textline_orientation=True,
                lang="en",
            )
            logger.info("[OCR] PaddleOCR engine initialized successfully.")
        except ImportError as e:
            if "numpy" in str(e).lower():
                raise OCREngineError(
                    "NumPy compatibility issue detected. PaddleOCR requires numpy<2.0.",
                    details={"error": str(e)}
                ) from e
            raise OCREngineError("Failed to import PaddleOCR", details={"error": str(e)}) from e
        except Exception as e:
            raise OCREngineError("Failed to initialize PaddleOCR", details={"error": str(e)}) from e
    return _ocr_engine

# ─── OCR Core Logic ───────────────────────────────────────────────────────────

def _run_paddleocr_on_file(file_path: str, is_pdf: bool = False) -> str:
    """Run OCR on a file (image or PDF) and return extracted text."""
    engine = _get_ocr_engine()
    all_text = []

    try:
        if is_pdf:
            import pypdfium2 as pdfium
            from PIL import Image
            import numpy as np

            logger.info(f"[OCR] Rendering PDF with pypdfium2: {file_path}")
            pdf = pdfium.PdfDocument(file_path)
            
            for i in range(len(pdf)):
                page = pdf[i]
                # Render to high-res image for OCR accuracy
                bitmap = page.render(scale=2) 
                pil_image = bitmap.to_pil()
                
                # Convert PIL to numpy for PaddleOCR
                img_array = np.array(pil_image)
                
                # Run OCR on this page image
                result = engine.ocr(img_array)
                
                if result and result[0]:
                    page_text = []
                    for line in result[0]:
                        # line[1][0] is the text string
                        page_text.append(line[1][0])
                    
                    if page_text:
                        all_text.append(f"--- Page {i + 1} ---\n" + "\n".join(page_text))
            
            pdf.close()
        else:
            # Handle direct image files
            result = engine.ocr(file_path)
            if result and result[0]:
                for line in result[0]:
                    all_text.append(line[1][0])

        return "\n\n".join(all_text)

    except Exception as e:
        logger.error(f"[OCR] PaddleOCR processing failed for {file_path}: {e}", exc_info=True)
        raise OCREngineError("OCR execution failed", details={"file": file_path, "error": str(e)}) from e

def extract_text_from_report(file_path: str) -> str:
    """
    Extract text from a medical report file (PDF or image).
    Utilizes pypdf first-pass and PaddleOCR fallback for scanned docs.

    Args:
        file_path: Absolute path to a PDF or image file.

    Returns:
        Raw extracted text from OCR or PDF parser.
    """
    if not os.path.exists(file_path):
        raise ResourcesNotFoundError(f"File not found: {file_path}", details={"path": file_path})

    ext = os.path.splitext(file_path)[1].lower()
    logger.info(f"[OCR] Processing file: {file_path} (type: {ext})")

    if ext == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(file_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            
            # If we got enough text, skip the expensive OCR
            if len(text.strip()) > 100:
                logger.info(f"[OCR] Successfully extracted {len(text)} chars using pypdf.")
                return text
            
            logger.info("[OCR] pypdf extracted minimal text, falling back to PaddleOCR.")
        except Exception as e:
            logger.warning(f"[OCR] pypdf extraction failed: {e}. Falling back to PaddleOCR.")

        return _run_paddleocr_on_file(file_path, is_pdf=True)

    elif ext in (".png", ".jpg", ".jpeg", ".tiff", ".bmp"):
        return _run_paddleocr_on_file(file_path, is_pdf=False)
    else:
        raise ValidationError(
            f"Unsupported file type: {ext}", 
            details={"allowed": [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"], "received": ext}
        )
