from datetime import datetime, date
from pydantic import BaseModel, Field, field_validator
import re

def normalize_plate(value: str) -> str:
    plate = re.sub(r"[\s-]", "", value.upper())
    if not re.fullmatch(r"[A-Z0-9]{4,8}", plate):
        raise ValueError("La placa debe tener entre 4 y 8 caracteres alfanuméricos")
    return plate

class EntryIn(BaseModel):
    plate: str
    space_id: int | None = None
    recognized_plate: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    method: str = "manual"
    @field_validator("plate")
    @classmethod
    def plate_valid(cls, value: str) -> str:
        return normalize_plate(value)
    @field_validator("method")
    @classmethod
    def method_valid(cls, value: str) -> str:
        if value not in ("manual", "automatico"):
            raise ValueError("Método inválido")
        return value

class ExitIn(BaseModel):
    plate: str
    recognized_plate: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    method: str = "manual"
    @field_validator("plate")
    @classmethod
    def plate_valid(cls, value: str) -> str:
        return normalize_plate(value)

class SpaceIn(BaseModel):
    code: str = Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9-]+$")
    row_index: int = Field(ge=0, le=99)
    col_index: int = Field(ge=0, le=99)

class SpacePatch(BaseModel):
    out_of_service: bool | None = None
    row_index: int | None = Field(default=None, ge=0, le=99)
    col_index: int | None = Field(default=None, ge=0, le=99)

class ConfigPatch(BaseModel):
    detection_threshold: float | None = Field(default=None, ge=0, le=1)
    recognition_threshold: float | None = Field(default=None, ge=0, le=1)
    layout_rows: int | None = Field(default=None, ge=1, le=30)
    layout_cols: int | None = Field(default=None, ge=1, le=20)

class PlateConfirm(BaseModel):
    plate: str
    expected_action: str
    space_id: int | None = None
    recognized_plate: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    method: str = "manual"

    @field_validator("plate")
    @classmethod
    def plate_valid(cls, value: str) -> str:
        return normalize_plate(value)

    @field_validator("expected_action")
    @classmethod
    def action_valid(cls, value: str) -> str:
        if value not in ("entrada", "salida"):
            raise ValueError("Acción inválida")
        return value


    @field_validator("method")
    @classmethod
    def method_valid(cls, value: str) -> str:
        if value not in ("manual", "automatico"):
            raise ValueError("Método inválido")
        return value
