"""Store the moving average cost on each sale."""

from alembic import op
import sqlalchemy as sa

revision = "0003_sales_cost_snapshot"
down_revision = "0002_operation_logs"
branch_labels = None
depends_on = None


def upgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("transactions")}
    if "cost_price" not in existing:
        op.add_column("transactions", sa.Column("cost_price", sa.Numeric(14, 4), nullable=True))


def downgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("transactions")}
    if "cost_price" in existing:
        op.drop_column("transactions", "cost_price")