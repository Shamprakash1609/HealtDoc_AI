import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Configuration
# Ensure GOOGLE_API_KEY is set in your environment variables
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") # Optional if using Ollama for everything

# Vector Store and Uploads Path relative to the backend directory
VECTOR_STORE_PATH = os.path.join(os.path.dirname(__file__), "faiss_index")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
