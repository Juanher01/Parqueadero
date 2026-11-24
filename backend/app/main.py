from datetime import date, datetime, timedelta, timezone
import csv
from io import StringIO
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select, func, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, joinedload
from app.core import settings
from app.db import get_db
from app.models import Vehicle, Space, ParkingSession, Configuration
from app.schemas import EntryIn, ExitIn, SpaceIn, SpacePatch, ConfigPatch, PlateConfirm, normalize_plate
from app.services import active_query, dashboard, list_spaces, record_entry, record_exit, serialize_session, plate_preview
from app import ai

app = FastAPI(title="Parqueader Jimenez API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",")],
                   allow_methods=["GET", "POST", "PATCH"], allow_headers=["*"])

def config(db: Session):
    value = db.get(Configuration, 1)
    if value is None:
        value = Configuration(id=1)
        db.add(value)
        db.commit()
        db.refresh(value)
    return value

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        database = "conectado"
    except OperationalError:
        database = "desconectado"
    return {"backend": "activo", "postgresql": database, "recognition": ai.state()}

@app.get("/api/dashboard/resumen")
def summary(db: Session = Depends(get_db)):
    return dashboard(db)

@app.get("/api/vehiculos")
def vehicles(db: Session = Depends(get_db)):
    return [{"id": v.id, "plate": v.plate, "created_at": v.created_at} for v in db.scalars(select(Vehicle).order_by(Vehicle.plate)).all()]

@app.get("/api/vehiculos/{vehicle_id}")
def vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    v = db.get(Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehículo no encontrado")
    return {"id": v.id, "plate": v.plate, "created_at": v.created_at}

@app.get("/api/espacios")
def spaces(db: Session = Depends(get_db)):
    return list_spaces(db)

@app.post("/api/espacios", status_code=201)
def create_space(data: SpaceIn, db: Session = Depends(get_db)):
    db.execute(text("SELECT pg_advisory_xact_lock(987654321)"))
    layout = config(db)
    if data.row_index >= layout.layout_rows or data.col_index >= layout.layout_cols:
        raise HTTPException(422, "La posición está fuera del plano configurado")
    item = Space(code=data.code.upper(), row_index=data.row_index, col_index=data.col_index)
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "El código o la posición ya está en uso")
    return next(s for s in list_spaces(db) if s["id"] == item.id)

@app.patch("/api/espacios/{space_id}")
def patch_space(space_id: int, data: SpacePatch, db: Session = Depends(get_db)):
    db.execute(text("SELECT pg_advisory_xact_lock(987654321)"))
    item = db.scalar(select(Space).where(Space.id == space_id).with_for_update())
    if not item:
        raise HTTPException(404, "Espacio no encontrado")
    if data.out_of_service is True and db.scalar(select(ParkingSession.id).where(ParkingSession.space_id == space_id, ParkingSession.exit_at.is_(None))):
        raise HTTPException(409, "No se puede deshabilitar un espacio ocupado")
    if data.out_of_service is not None:
        item.out_of_service = data.out_of_service
    if (data.row_index is None) != (data.col_index is None):
        raise HTTPException(422, "Indique fila y columna")
    if data.row_index is not None and (item.row_index, item.col_index) != (data.row_index, data.col_index):
        layout = config(db)
        if data.row_index >= layout.layout_rows or data.col_index >= layout.layout_cols:
            raise HTTPException(422, "La posición está fuera del plano configurado")
        other = db.scalar(select(Space).where(Space.row_index == data.row_index, Space.col_index == data.col_index).with_for_update())
        old_row, old_col = item.row_index, item.col_index
        if other:
            item.row_index, item.col_index = 1000000 + item.id, 0
            db.flush()
            other.row_index, other.col_index = old_row, old_col
            db.flush()
        item.row_index, item.col_index = data.row_index, data.col_index
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "La posición ya está en uso")
    return next(s for s in list_spaces(db) if s["id"] == space_id)

@app.post("/api/entradas", status_code=201)
def entry(data: EntryIn, db: Session = Depends(get_db)):
    return record_entry(db, data)

@app.post("/api/salidas")
def exit_parking(data: ExitIn, db: Session = Depends(get_db)):
    return record_exit(db, data)

@app.get("/api/placas/preparar/{plate}")
def prepare_plate(plate: str, db: Session = Depends(get_db)):
    try:
        normalized = normalize_plate(plate)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return plate_preview(db, normalized)

@app.post("/api/placas/confirmar")
def confirm_plate(data: PlateConfirm, db: Session = Depends(get_db)):
    # Recheck under a plate lock: a preview is informative, never an authorization to write stale state.
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:plate))"), {"plate": data.plate})
    current = plate_preview(db, data.plate)
    if current["action"] != data.expected_action:
        db.rollback()
        raise HTTPException(409, "El estado de la placa cambió. Consulte de nuevo antes de confirmar")
    if current["action"] == "entrada":
        result = record_entry(db, EntryIn(plate=data.plate, space_id=data.space_id,
                                          recognized_plate=data.recognized_plate, confidence=data.confidence,
                                          method=data.method))
    else:
        result = record_exit(db, ExitIn(plate=data.plate, recognized_plate=data.recognized_plate,
                                        confidence=data.confidence, method=data.method))
    return {"action": current["action"], "session": result}

def filtered_sessions(db: Session, plate: str | None, status: str | None, from_date: date | None, to_date: date | None):
    q = select(ParkingSession).join(Vehicle).options(joinedload(ParkingSession.vehicle), joinedload(ParkingSession.space))
    if plate:
        q = q.where(Vehicle.plate.ilike(f"%{plate.strip()}%"))
    if status == "activo":
        q = q.where(ParkingSession.exit_at.is_(None))
    elif status == "finalizado":
        q = q.where(ParkingSession.exit_at.is_not(None))
    if from_date:
        q = q.where(ParkingSession.entry_at >= datetime.combine(from_date, datetime.min.time(), timezone(timedelta(hours=-5))))
    if to_date:
        q = q.where(ParkingSession.entry_at < datetime.combine(to_date + timedelta(days=1), datetime.min.time(), timezone(timedelta(hours=-5))))
    return q

@app.get("/api/sesiones")
def sessions(plate: str | None = None, status: str | None = None, from_date: date | None = None, to_date: date | None = None,
             page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    q = filtered_sessions(db, plate, status, from_date, to_date)
    count = db.scalar(select(func.count()).select_from(q.order_by(None).subquery()))
    items = db.scalars(q.order_by(ParkingSession.entry_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [serialize_session(x) for x in items], "total": count, "page": page, "page_size": page_size}

@app.get("/api/sesiones/exportar")
def export_sessions(plate: str | None = None, status: str | None = None, from_date: date | None = None, to_date: date | None = None, db: Session = Depends(get_db)):
    items = db.scalars(filtered_sessions(db, plate, status, from_date, to_date).order_by(ParkingSession.entry_at.desc())).all()
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Placa", "Espacio", "Entrada", "Salida", "Duración (segundos)", "Estado"])
    for item in items:
        x = serialize_session(item)
        writer.writerow([x["plate"], x["space_code"], x["entry_at"], x["exit_at"], x["duration_seconds"], x["status"]])
    return StreamingResponse(iter(["\ufeff" + output.getvalue()]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="historial.csv"'})

@app.get("/api/sesiones/activas")
def active_sessions(db: Session = Depends(get_db)):
    return [serialize_session(x) for x in db.scalars(active_query().order_by(ParkingSession.entry_at.desc())).all()]

@app.get("/api/sesiones/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    item = db.scalar(select(ParkingSession).options(joinedload(ParkingSession.vehicle), joinedload(ParkingSession.space)).where(ParkingSession.id == session_id))
    if not item:
        raise HTTPException(404, "Sesión no encontrada")
    return serialize_session(item)

@app.get("/api/reconocimiento/estado")
def recognition_state():
    return ai.state()

@app.post("/api/reconocimiento/procesar")
async def recognize(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, "Use JPEG, PNG o WebP")
    data = await file.read(settings.max_image_bytes + 1)
    if len(data) > settings.max_image_bytes:
        raise HTTPException(413, "La imagen excede el tamaño máximo")
    cfg = config(db)
    return await run_in_threadpool(ai.process_image, data, cfg.detection_threshold, cfg.recognition_threshold)

@app.get("/api/configuracion")
def get_configuration(db: Session = Depends(get_db)):
    x = config(db)
    return {"detection_threshold": x.detection_threshold, "recognition_threshold": x.recognition_threshold,
            "layout_rows": x.layout_rows, "layout_cols": x.layout_cols,
            "recognition": ai.state()}

@app.patch("/api/configuracion")
def update_configuration(data: ConfigPatch, db: Session = Depends(get_db)):
    db.execute(text("SELECT pg_advisory_xact_lock(987654321)"))
    x = config(db)
    max_row = db.scalar(select(func.max(Space.row_index))) or 0
    max_col = db.scalar(select(func.max(Space.col_index))) or 0
    if data.layout_rows is not None and data.layout_rows <= max_row:
        raise HTTPException(409, "El plano tiene espacios fuera del número de filas solicitado")
    if data.layout_cols is not None and data.layout_cols <= max_col:
        raise HTTPException(409, "El plano tiene espacios fuera del número de columnas solicitado")
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(x, key, value)
    db.commit()
    return get_configuration(db)
