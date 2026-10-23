"""Actual receipt ledger and durable idempotent order submissions.

Historical non-voided sales are fully paid, explicitly requested by the owner.
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_receipts_submissions"
down_revision = "0010_privacy_controls"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("transactions", "mini_orders"):
        op.add_column(table, sa.Column("received_total", sa.Numeric(14, 2), nullable=False, server_default="0"))
        op.add_column(table, sa.Column("paid_at", sa.DateTime(), nullable=True))
        op.add_column(table, sa.Column("request_key", sa.String(64), nullable=True))
        op.add_column(table, sa.Column("request_hash", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_mini_order_submission", "mini_orders", ["customer_id", "request_key"])
    op.create_unique_constraint("uq_transaction_submission", "transactions", ["request_key"])
    op.create_table("sale_receipts", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id"), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False), sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("cost_amount", sa.Numeric(18, 4), nullable=True), sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("dedupe_key", sa.String(80), nullable=False), sa.Column("operator", sa.String(120), nullable=False),
        sa.UniqueConstraint("dedupe_key", name="uq_sale_receipt_dedupe"))
    op.create_index("ix_sale_receipts_transaction_id", "sale_receipts", ["transaction_id"])
    op.create_index("ix_sale_receipts_occurred_at", "sale_receipts", ["occurred_at"])
    op.execute("""UPDATE transactions SET received_total=total,paid_at=created_at
                  WHERE kind='sale' AND voided_at IS NULL""")
    op.execute("""INSERT INTO sale_receipts(transaction_id,kind,amount,cost_amount,quantity,occurred_at,dedupe_key,operator)
                  SELECT id,'receipt',total,quantity*cost_price,quantity,created_at,'receipt:' || id::text,
                         COALESCE(NULLIF(operator,''),'历史订单迁移')
                  FROM transactions WHERE kind='sale' AND voided_at IS NULL""")
    op.execute("""UPDATE mini_orders SET received_total=total,paid_at=created_at
                  WHERE status NOT IN ('已取消','已拒绝','已超时')
                    AND EXISTS (SELECT 1 FROM transactions t WHERE t.mini_order_id=mini_orders.id
                                AND t.kind='sale' AND t.voided_at IS NULL)""")


def downgrade():
    op.drop_table("sale_receipts")
    op.drop_constraint("uq_transaction_submission", "transactions", type_="unique")
    op.drop_constraint("uq_mini_order_submission", "mini_orders", type_="unique")
    for table in ("transactions", "mini_orders"):
        for name in ("request_hash", "request_key", "paid_at", "received_total"):
            op.drop_column(table, name)
