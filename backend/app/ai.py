from io import BytesIO
from importlib.util import find_spec
import logging
from threading import Lock
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException
from app.core import settings, model_path
from app.schemas import normalize_plate

_detector = None
_recognizer = None
_runtime_error = None
_inference_lock = Lock()
logger = logging.getLogger(__name__)

def state():
    yolo = model_path(settings.yolo_model_path)
    ocr = model_path(settings.ocr_model_path)
    ocr_export = all((ocr / filename).is_file() for filename in ("inference.json", "inference.pdiparams", "inference.yml"))
    dependencies = all(find_spec(name) is not None for name in ("ultralytics", "paddleocr", "paddle", "numpy"))
    return {"yolo_file": yolo.is_file(), "ocr_export": ocr_export,
            "yolo_loaded": _detector is not None, "ocr_loaded": _recognizer is not None,
            "dependencies_installed": dependencies,
            "available": yolo.is_file() and ocr_export and dependencies and _runtime_error is None}

def load_models():
    global _detector, _recognizer, _runtime_error
    try:
        if _detector is None:
            from ultralytics import YOLO
            _detector = YOLO(str(model_path(settings.yolo_model_path)))
        if _recognizer is None:
            from paddleocr import TextRecognition
            _recognizer = TextRecognition(model_name="PP-OCRv5_mobile_rec",
                                          model_dir=str(model_path(settings.ocr_model_path)), device="cpu")
        _runtime_error = None
    except Exception as exc:
        _runtime_error = str(exc)
        logger.exception("No se pudieron cargar los modelos de reconocimiento")
        raise HTTPException(503, "Reconocimiento automático no disponible") from exc

def process_image(data: bytes, detection_threshold: float, recognition_threshold: float):
    with _inference_lock:
        return _process_image_locked(data, detection_threshold, recognition_threshold)

def _process_image_locked(data: bytes, detection_threshold: float, recognition_threshold: float):
    if not state()["available"]:
        raise HTTPException(503, "El reconocimiento automático aún no está disponible; use la placa manual")
    try:
        image = Image.open(BytesIO(data))
        image.verify()
        # Apply EXIF orientation so box coordinates match the image as browsers display it.
        image = ImageOps.exif_transpose(Image.open(BytesIO(data))).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(422, "Imagen inválida")
    load_models()
    try:
        import numpy as np
        boxes = _detector.predict(source=np.asarray(image), conf=detection_threshold, device="cpu", verbose=False)[0].boxes
        candidates = []
        for box in boxes:
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            crop = np.asarray(image.crop((max(0, x1), max(0, y1), min(image.width, x2), min(image.height, y2))))
            if crop.size == 0:
                continue
            # PaddleOCR's standalone recognizer expects an image of the detected text line.
            results = _recognizer.predict(input=crop[:, :, ::-1].copy(), batch_size=1)
            for result in results:
                payload = result.json if hasattr(result, "json") else result
                payload = payload.get("res", payload)
                raw, score = payload.get("rec_text", ""), payload.get("rec_score", 0)
                if not raw or float(score) < recognition_threshold:
                    continue
                try:
                    plate = normalize_plate(raw)
                except ValueError:
                    continue
                candidates.append({"plate": plate, "confidence": round(float(score), 3),
                                   "detection_confidence": round(float(box.conf[0]), 3),
                                   "box": [x1, y1, x2, y2]})
        return {"candidates": candidates, "image_width": image.width, "image_height": image.height}
    except Exception as exc:
        logger.exception("Falló el procesamiento de una imagen")
        raise HTTPException(503, "No fue posible reconocer la placa. Ingrésela manualmente") from exc
