"""Add detailed operation audit trail."""

from alembic import op
import sqlalchemy as sa


revision = "0002_operation_logs"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "operation_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("product_snapshot", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("operator", sa.String(length=80), nullable=False, server_default="管理员"),
        sa.Column("before_value", sa.Text(), nullable=False, server_default=""),
        sa.Column("after_value", sa.Text(), nullable=False, server_default=""),
        sa.Column("detail", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
    )
    op.create_index("ix_operation_logs_action", "operation_logs", ["action"])
    op.create_index("ix_operation_logs_product_id", "operation_logs", ["product_id"])
    op.create_index("ix_operation_logs_created_at", "operation_logs", ["created_at"])


def downgrade():
    op.drop_index("ix_operation_logs_created_at", table_name="operation_logs")
    op.drop_index("ix_operation_logs_product_id", table_name="operation_logs")
    op.drop_index("ix_operation_logs_action", table_name="operation_logs")
    op.drop_table("operation_logs")
