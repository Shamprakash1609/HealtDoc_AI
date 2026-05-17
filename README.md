# 🩺 HealthDoc AI — Local Medical Assistant

HealthDoc AI is a highly performant, fully local Medical AI Assistant and Retrieval-Augmented Generation (RAG) platform. It uses a structured Model-View-Controller (MVC) architecture, leverages local LLMs and Embeddings via **Ollama**, and is managed using the modern **uv** Python package manager for blazing-fast speed and efficiency.

---

## 🚀 Key Features
- **100% Local Processing:** Full privacy and security—your health reports and queries never leave your machine.
- **Advanced Medical Reasoning:** Utilizes the custom medical model **MedGemma** (`medgemma1.5:4b`) for accurate, structured clinical insights and conversational support.
- **Efficient Document Ingestion & RAG:** High-speed parsing, chunking, vector indexing, and semantic retrieval via local FAISS and the **Nomic Embed Text** model.
- **Modern MVC Architecture:** Clean, modular, and extremely maintainable FastAPI backend.

---

## 🛠️ Prerequisites

Before getting started, make sure you have the following installed on your system:

1. **[Ollama](https://ollama.com/)** (Ensure the Ollama application is running in the background)
2. **[uv](https://github.com/astral-sh/uv)** (Blazing-fast Python package and environment manager)

---

## 🧠 1. Ollama Model Setup

HealthDoc AI uses two local models that must be downloaded and run via Ollama:
- `medgemma1.5:4b` (for medical chat, reasoning, and report explanation)
- `nomic-embed-text` (for vector embeddings during PDF retrieval)

### Pull the Required Models:
Open your terminal or command prompt and run the following:

```bash
# Pull the Nomic Embed Text model (approx. 274 MB)
ollama pull nomic-embed-text

# Pull the MedGemma model (approx. 3.3 GB)
ollama pull medgemma1.5:4b
```

### Verify Your Installed Models:
You can verify they are ready by running:
```bash
ollama list
```

Your output should display them in the active models list:
```text
NAME                       ID              SIZE      MODIFIED     
nomic-embed-text:latest    0a109f422b47    274 MB    26 hours ago    
medgemma1.5:4b             433252621ab1    3.3 GB    27 hours ago    
```

---

## ⚙️ 2. Environment Setup

Copy the environment template to create your local `.env` configuration file:

### On macOS / Linux:
```bash
cp backend/.env.example backend/.env
```

### On Windows (CMD / PowerShell):
```cmd
copy backend\.env.example backend\.env
```

*(Note: If you are using the local Ollama models for everything, the `GOOGLE_API_KEY` in the `.env` file is optional).*

---

## 📦 3. Virtual Environment & Dependencies (via `uv`)

Initialize your Python virtual environment and install the required packages using `uv`.

### Create Virtual Environment:
```bash
# Create the virtual environment using uv
uv venv backend/.venv
```

### Install Dependencies:
```bash
# Sync and install the packages using uv
uv pip install -r backend/requirements.txt
```

---

## 🚦 4. Starting the Server

Follow the instructions below based on your operating system to activate the virtual environment and launch the FastAPI server.

### 🍎 On macOS / Linux:

```bash
# 1. Activate the virtual environment
source backend/.venv/bin/activate

# 2. Start the Uvicorn FastAPI server on port 8000 with hot-reloading
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 🪟 On Windows:

#### Using Command Prompt (CMD):
```cmd
:: 1. Activate the virtual environment
backend\.venv\Scripts\activate.bat

:: 2. Start the Uvicorn FastAPI server on port 8000 with hot-reloading
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Using PowerShell:
```powershell
# 1. Activate the virtual environment
.\backend\.venv\Scripts\Activate.ps1

# 2. Start the Uvicorn FastAPI server on port 8000 with hot-reloading
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Once started, the interactive API documentation (Swagger UI) will be available at:
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**

---

## 💻 5. Running the Frontend

To view and interact with the user interface:
1. Open the [Frontend](./Frontend) directory.
2. Double-click or open [index.html](./Frontend/index.html) in your favorite web browser.
3. Start chatting with **MedGemma** and uploading medical documents locally!
