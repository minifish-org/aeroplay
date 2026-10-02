FROM python:3.12-slim

WORKDIR /service
COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
COPY server.py .
RUN useradd --uid 1000 --create-home player
USER 1000:1000
ENV HF_HOME=/cache XDG_CACHE_HOME=/cache TORCHINDUCTOR_CACHE_DIR=/tmp/inductor \
    TORCH_COMPILE_DISABLE=1 OMP_NUM_THREADS=4 PYTHONUNBUFFERED=1
EXPOSE 8771
ENTRYPOINT ["python", "server.py"]
