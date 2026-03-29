"""
MedGemma Model Loader — Singleton pattern.

Loads google/medgemma-4b-it once on first use with MPS/CUDA/CPU auto-detection.
Model weights are cached locally to avoid re-downloading.

NOTE: All heavy imports (torch, transformers) are deferred to first model use
to keep server startup fast.
"""

import os
from threading import Lock

# ─── Constants ────────────────────────────────────────────────────────────────
MODEL_ID = "google/medgemma-4b-it"
LOCAL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "medgemma")

# ─── Singleton State ──────────────────────────────────────────────────────────
_model = None
_processor = None
_device = None
_lock = Lock()


def _detect_device():
    """Auto-detect the best available compute device."""
    import torch

    if torch.cuda.is_available():
        return torch.device("cuda")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _load_model():
    """Load model and processor exactly once."""
    global _model, _processor, _device

    with _lock:
        if _model is not None:
            return  # Already loaded

        import torch
        from transformers import AutoProcessor, AutoModelForImageTextToText

        _device = _detect_device()
        cache_dir = os.path.abspath(LOCAL_CACHE_DIR)
        os.makedirs(cache_dir, exist_ok=True)

        print(f"[MedGemma] Loading model from '{cache_dir}' on device: {_device}")

        # Auto-detect precision
        if _device.type == "mps":
            # M2/M3 support bfloat16, Gemma 3 heavily prefers it over fp16
            dtype = torch.bfloat16
        elif _device.type == "cuda":
            dtype = torch.bfloat16
        else:
            dtype = torch.float32

        # Token required for gated HF models
        hf_token = os.environ.get("HF_TOKEN", "")

        _processor = AutoProcessor.from_pretrained(
            "google/medgemma-1.5-4b-it",
            cache_dir=cache_dir,
            token=hf_token,
        )

        _model = AutoModelForImageTextToText.from_pretrained(
            "google/medgemma-1.5-4b-it",
            cache_dir=cache_dir,
            token=hf_token,
            torch_dtype=dtype,
            device_map="auto" if _device.type != "mps" else None,
            attn_implementation="sdpa",  # Significantly faster on MPS/CUDA
        )

        # For MPS, manually move model to device
        # If device_map="auto" was skipped for MPS
        if _device.type == "mps":
            _model = _model.to(_device)

        _model.eval()
        print(f"[MedGemma] Model loaded successfully on {_device}.")


def get_model():
    """Return the loaded model instance (loads on first call)."""
    if _model is None:
        _load_model()
    return _model


def get_processor():
    """Return the loaded processor instance (loads on first call)."""
    if _processor is None:
        _load_model()
    return _processor


def get_device():
    """Return the detected compute device."""
    if _device is None:
        _load_model()
    return _device
