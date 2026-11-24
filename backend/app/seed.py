from sqlalchemy import select
from app.db import SessionLocal
from app.models import Space, Configuration

def seed():
    with SessionLocal.begin() as db:
        existing = set(db.scalars(select(Space.code)).all())
        if not existing:
            for index in range(30):
                code = f"{chr(65 + index // 6)}-{index % 6 + 1:02}"
                db.add(Space(code=code, row_index=index // 6, col_index=index % 6))
        if db.get(Configuration, 1) is None:
            db.add(Configuration(id=1, detection_threshold=0.5, recognition_threshold=0.5))

if __name__ == "__main__":
    seed()
