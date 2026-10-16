"""Track when a delivery is completed."""

from alembic import op
import sqlalchemy as sa

revision = "0004_delivery_completion_time"
down_revision = "0003_sales_cost_snapshot"
branch_labels = None
depends_on = None


def upgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("deliveries")}
    if "completed_at" not in existing:
        op.add_column("deliveries", sa.Column("completed_at", sa.DateTime(), nullable=True))


def downgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("deliveries")}
    if "completed_at" in existing:
        op.drop_column("deliveries", "completed_at")
