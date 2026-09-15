# ─── SUPERNAT · production image ──────────────────────────────────────────
# Works on Hugging Face Spaces (Docker), Render, Fly.io, or any container host.
# Single uvicorn worker on purpose: game rooms live in process memory.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .

EXPOSE 7860
# Hosts inject $PORT (Render and Hugging Face both do); default 7860.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-7860}"]
