"""Unified spaces and persistent floor positions; keeps vehicles and history."""
from alembic import op
import sqlalchemy as sa

revision = "0002_unified_spaces"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("configuracion", sa.Column("layout_rows", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("configuracion", sa.Column("layout_cols", sa.Integer(), nullable=False, server_default="6"))
    op.add_column("espacios", sa.Column("row_index", sa.Integer(), nullable=True))
    op.add_column("espacios", sa.Column("col_index", sa.Integer(), nullable=True))
    op.execute("""WITH numbered AS (
        SELECT id, row_number() OVER (ORDER BY code, id) - 1 AS n FROM espacios
    ) UPDATE espacios AS e SET row_index = numbered.n / 6,
      col_index = numbered.n % 6 FROM numbered WHERE e.id = numbered.id""")
    op.alter_column("espacios", "row_index", nullable=False, server_default="0")
    op.alter_column("espacios", "col_index", nullable=False, server_default="0")
    op.create_check_constraint("ck_space_row_nonnegative", "espacios", "row_index >= 0")
    op.create_check_constraint("ck_space_col_nonnegative", "espacios", "col_index >= 0")
    op.create_unique_constraint("uq_space_position", "espacios", ["row_index", "col_index"])
    op.execute("ALTER TABLE espacios DROP CONSTRAINT IF EXISTS espacios_kind_check")
    op.execute("ALTER TABLE vehiculos DROP CONSTRAINT IF EXISTS vehiculos_kind_check")
    op.drop_column("espacios", "kind")
    op.drop_column("vehiculos", "kind")

def downgrade():
    op.drop_column("configuracion", "layout_cols")
    op.drop_column("configuracion", "layout_rows")
    op.add_column("vehiculos", sa.Column("kind", sa.String(12), nullable=False, server_default="automovil"))
    op.add_column("espacios", sa.Column("kind", sa.String(12), nullable=False, server_default="automovil"))
    op.create_check_constraint("vehiculos_kind_check", "vehiculos", "kind IN ('automovil','motocicleta')")
    op.create_check_constraint("espacios_kind_check", "espacios", "kind IN ('automovil','motocicleta')")
    op.drop_constraint("uq_space_position", "espacios", type_="unique")
    op.drop_constraint("ck_space_row_nonnegative", "espacios", type_="check")
    op.drop_constraint("ck_space_col_nonnegative", "espacios", type_="check")
    op.drop_column("espacios", "row_index")
    op.drop_column("espacios", "col_index")
