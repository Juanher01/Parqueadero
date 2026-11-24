FROM python:3.11-slim
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install -r requirements.txt
RUN pip install --index-url https://download.pytorch.org/whl/cpu \
    torch==2.15.0+cpu torchvision==0.29.2+cpu
COPY requirements-ai.txt .
RUN pip install -r requirements-ai.txt \
    && pip uninstall -y opencv-python opencv-python-headless nvidia-ml-py \
    && pip install --force-reinstall --no-deps opencv-contrib-python==4.10.0.84 \
    && python -c "import cv2, torch; from importlib import metadata; assert torch.version.cuda is None; assert not any(d.metadata['Name'].lower().startswith('nvidia-') for d in metadata.distributions()); print('CPU torch:', torch.__version__, 'OpenCV:', cv2.__version__)"
COPY . .
