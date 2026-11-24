from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from app.models import Vehicle, Space, ParkingSession, RecognitionLog, Configuration
from app.schemas import EntryIn, ExitIn

BOGOTA = timezone(timedelta(hours=-5))

def serialize_session(item: ParkingSession):
    return {"id": item.id, "plate": item.vehicle.plate,
            "space_id": item.space_id, "space_code": item.space.code,
            "entry_at": item.entry_at, "exit_at": item.exit_at,
            "duration_seconds": item.duration_seconds,
            "status": "activo" if item.exit_at is None else "finalizado"}

def serialize_space(item: Space, session: ParkingSession | None = None):
    return {"id": item.id, "code": item.code, "row_index": item.row_index, "col_index": item.col_index,
            "out_of_service": item.out_of_service,
            "status": "fuera_servicio" if item.out_of_service else "ocupado" if session else "disponible",
            "plate": session.vehicle.plate if session else None,
            "entry_at": session.entry_at if session else None}

def list_spaces(db: Session):
    spaces = db.scalars(select(Space).order_by(Space.code)).all()
    active = db.scalars(select(ParkingSession).options(joinedload(ParkingSession.vehicle)).where(ParkingSession.exit_at.is_(None))).all()
    occupied = {s.space_id: s for s in active}
    return [serialize_space(space, occupied.get(space.id)) for space in spaces]

def active_query():
    return select(ParkingSession).options(joinedload(ParkingSession.vehicle), joinedload(ParkingSession.space)).where(ParkingSession.exit_at.is_(None))

def plate_preview(db: Session, plate: str):
    active = db.scalar(active_query().join(Vehicle).where(Vehicle.plate == plate))
    if active:
        return {"plate": plate, "action": "salida", "active_session": serialize_session(active),
                "suggested_space": None}
    free = next((s for s in list_spaces(db) if s["status"] == "disponible"), None)
    suggested = {"id": free["id"], "code": free["code"]} if free else None
    return {"plate": plate, "action": "entrada", "active_session": None,
            "suggested_space": suggested}

def record_entry(db: Session, data: EntryIn):
    try:
        # Serializes concurrent entries for the same plate, including a plate not yet in vehicles.
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:plate))"), {"plate": data.plate})
        vehicle = db.scalar(select(Vehicle).where(Vehicle.plate == data.plate))
        if vehicle and db.scalar(active_query().where(ParkingSession.vehicle_id == vehicle.id)):
            raise HTTPException(409, "El vehículo ya tiene una entrada activa")
        if not vehicle:
            vehicle = Vehicle(plate=data.plate)
            db.add(vehicle)
            db.flush()
        spaces = select(Space).where(Space.out_of_service.is_(False))
        if data.space_id:
            spaces = spaces.where(Space.id == data.space_id)
        space = db.scalar(spaces.order_by(Space.code).with_for_update(skip_locked=True))
        while space and db.scalar(select(ParkingSession.id).where(ParkingSession.space_id == space.id, ParkingSession.exit_at.is_(None))):
            if data.space_id:
                space = None
                break
            spaces = spaces.where(Space.id > space.id)
            space = db.scalar(spaces.order_by(Space.code).with_for_update(skip_locked=True))
        if not space:
            raise HTTPException(409, "No hay espacios disponibles")
        item = ParkingSession(vehicle=vehicle, space=space)
        db.add(item)
        db.add(RecognitionLog(recognized_plate=data.recognized_plate, confirmed_plate=data.plate,
                              confidence=data.confidence, method=data.method, event="entrada", result="confirmado"))
        db.commit()
        db.refresh(item)
        return serialize_session(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "El vehículo o espacio ya tiene una sesión activa")
    except Exception:
        db.rollback()
        raise

def record_exit(db: Session, data: ExitIn):
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:plate))"), {"plate": data.plate})
        item = db.scalar(active_query().join(Vehicle).where(Vehicle.plate == data.plate).with_for_update(of=ParkingSession))
        if not item:
            raise HTTPException(404, "No hay una entrada activa para esta placa")
        item.exit_at = datetime.now(timezone.utc)
        item.duration_seconds = max(0, int((item.exit_at - item.entry_at).total_seconds()))
        db.add(RecognitionLog(recognized_plate=data.recognized_plate, confirmed_plate=data.plate,
                              confidence=data.confidence, method=data.method, event="salida", result="confirmado"))
        db.commit()
        db.refresh(item)
        return serialize_session(item)
    except Exception:
        db.rollback()
        raise

def dashboard(db: Session):
    spaces = list_spaces(db)
    today = datetime.now(BOGOTA).date()
    start = datetime.combine(today, datetime.min.time(), BOGOTA).astimezone(timezone.utc)
    end = start + timedelta(days=1)
    active = db.scalars(active_query().order_by(ParkingSession.entry_at.desc())).all()
    recent = db.scalars(select(ParkingSession).options(joinedload(ParkingSession.vehicle), joinedload(ParkingSession.space)).order_by(ParkingSession.entry_at.desc()).limit(6)).all()
    total = len(spaces)
    available = sum(s["status"] == "disponible" for s in spaces)
    occupied = sum(s["status"] == "ocupado" for s in spaces)
    return {"total": total, "available": available, "occupied": occupied,
            "out_of_service": total - available - occupied,
            "occupancy_percent": round(100 * occupied / max(1, total - (total - available - occupied))),
            "inside": len(active), "entries_today": db.scalar(select(func.count()).select_from(ParkingSession).where(ParkingSession.entry_at >= start, ParkingSession.entry_at < end)),
            "exits_today": db.scalar(select(func.count()).select_from(ParkingSession).where(ParkingSession.exit_at >= start, ParkingSession.exit_at < end)),
            "recent": [serialize_session(x) for x in recent], "spaces": spaces}
