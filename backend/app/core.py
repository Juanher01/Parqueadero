from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://parqueadero:parqueadero@localhost:5432/parqueadero"
    cors_origins: str = "http://localhost:5173"
    yolo_model_path: str = "backend/models/yolo/best.pt"
    ocr_model_path: str = "backend/models/ocr/modelo_ocr_exportado"
    max_image_bytes: int = 8 * 1024 * 1024
    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), extra="ignore")

settings = Settings()

def model_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path
