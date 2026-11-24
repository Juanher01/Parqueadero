from datetime import datetime, timezone
from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

def now():
    return datetime.now(timezone.utc)

class Vehicle(Base):
    __tablename__ = "vehiculos"
    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class Space(Base):
    __tablename__ = "espacios"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    out_of_service: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    row_index: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    col_index: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    __table_args__ = (CheckConstraint("row_index >= 0"), CheckConstraint("col_index >= 0"),
                      UniqueConstraint("row_index", "col_index", name="uq_space_position"))

class ParkingSession(Base):
    __tablename__ = "sesiones_parqueo"
    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehiculos.id"))
    space_id: Mapped[int] = mapped_column(ForeignKey("espacios.id"))
    entry_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    exit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    vehicle: Mapped[Vehicle] = relationship()
    space: Mapped[Space] = relationship()
    __table_args__ = (
        CheckConstraint("exit_at IS NULL OR exit_at >= entry_at"),
        Index("uq_active_vehicle", "vehicle_id", unique=True, postgresql_where=text("exit_at IS NULL")),
        Index("uq_active_space", "space_id", unique=True, postgresql_where=text("exit_at IS NULL")),
    )

class RecognitionLog(Base):
    __tablename__ = "registros_reconocimiento"
    id: Mapped[int] = mapped_column(primary_key=True)
    recognized_plate: Mapped[str | None] = mapped_column(String(12))
    confirmed_plate: Mapped[str | None] = mapped_column(String(12))
    confidence: Mapped[float | None] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(12))
    event: Mapped[str] = mapped_column(String(12))
    result: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class Configuration(Base):
    __tablename__ = "configuracion"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    detection_threshold: Mapped[float] = mapped_column(Float, default=0.5)
    recognition_threshold: Mapped[float] = mapped_column(Float, default=0.5)
    layout_rows: Mapped[int] = mapped_column(Integer, default=5, server_default=text("5"))
    layout_cols: Mapped[int] = mapped_column(Integer, default=6, server_default=text("6"))
    __table_args__ = (CheckConstraint("detection_threshold BETWEEN 0 AND 1"), CheckConstraint("recognition_threshold BETWEEN 0 AND 1"))
