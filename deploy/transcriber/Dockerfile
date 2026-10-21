# Meeting transcriber for a small Pascal GPU (homeserver: Quadro P620, 2 GB).
# CUDA 12 on purpose: CUDA 13 dropped Pascal. PyTorch 2.5 + cu121 still ships
# compute 6.x kernels; newer PyTorch builds do not.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip ffmpeg && rm -rf /var/lib/apt/lists/*
# PyTorch only from its own index, everything else only from PyPI (no mixed
# indexes, so no package can be swapped in from the other one). The constraints
# keep pyannote from replacing the pinned Pascal-capable torch build.
RUN pip3 install --no-cache-dir --index-url https://download.pytorch.org/whl/cu121 \
    torch==2.5.1+cu121 torchaudio==2.5.1+cu121
COPY constraints.txt /tmp/constraints.txt
RUN pip3 install --no-cache-dir -c /tmp/constraints.txt "numpy<2" \
    pyannote.audio==3.3.2 "huggingface_hub<0.26" \
    faster-whisper==1.1.1 requests \
    fastapi==0.115.6 uvicorn==0.34.0 python-multipart==0.0.20
WORKDIR /app
COPY pipeline.py stage.py app.py ./
ENV HF_HOME=/models/hf PYTHONUNBUFFERED=1
EXPOSE 8790
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8790", "--workers", "1"]
