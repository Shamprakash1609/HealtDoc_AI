import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Configuration
# Ensure GOOGLE_API_KEY is set in your environment variables
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY environment variable not set. Please set it to use Gemini.")

# Vector Store Path
VECTOR_STORE_PATH = "faiss_index"
