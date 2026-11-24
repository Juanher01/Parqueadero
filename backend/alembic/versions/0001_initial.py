"""Initial PostgreSQL schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("vehiculos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plate", sa.String(12), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('automovil','motocicleta')"), sa.UniqueConstraint("plate"))
    op.create_index("ix_vehiculos_plate", "vehiculos", ["plate"])
    op.create_table("espacios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(16), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("out_of_service", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.CheckConstraint("kind IN ('automovil','motocicleta')"), sa.UniqueConstraint("code"))
    op.create_table("sesiones_parqueo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehiculos.id"), nullable=False),
        sa.Column("space_id", sa.Integer(), sa.ForeignKey("espacios.id"), nullable=False),
        sa.Column("entry_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exit_at", sa.DateTime(timezone=True)),
        sa.Column("duration_seconds", sa.Integer()),
        sa.CheckConstraint("exit_at IS NULL OR exit_at >= entry_at"))
    op.create_index("uq_active_vehicle", "sesiones_parqueo", ["vehicle_id"], unique=True, postgresql_where=sa.text("exit_at IS NULL"))
    op.create_index("uq_active_space", "sesiones_parqueo", ["space_id"], unique=True, postgresql_where=sa.text("exit_at IS NULL"))
    op.create_table("registros_reconocimiento",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recognized_plate", sa.String(12)),
        sa.Column("confirmed_plate", sa.String(12)),
        sa.Column("confidence", sa.Float()),
        sa.Column("method", sa.String(12), nullable=False),
        sa.Column("event", sa.String(12), nullable=False),
        sa.Column("result", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("configuracion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("detection_threshold", sa.Float(), nullable=False),
        sa.Column("recognition_threshold", sa.Float(), nullable=False),
        sa.CheckConstraint("detection_threshold BETWEEN 0 AND 1"),
        sa.CheckConstraint("recognition_threshold BETWEEN 0 AND 1"))

def downgrade():
    op.drop_table("configuracion")
    op.drop_table("registros_reconocimiento")
    op.drop_index("uq_active_space", table_name="sesiones_parqueo")
    op.drop_index("uq_active_vehicle", table_name="sesiones_parqueo")
    op.drop_table("sesiones_parqueo")
    op.drop_table("espacios")
    op.drop_index("ix_vehiculos_plate", table_name="vehiculos")
    op.drop_table("vehiculos")
