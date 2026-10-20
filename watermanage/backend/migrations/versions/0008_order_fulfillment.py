"""Link sales to delivery tasks and persist the mini-program fulfillment choice."""
from alembic import op
import sqlalchemy as sa

revision = "0008_order_fulfillment"
down_revision = "0007_direct_pickup"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("transactions", sa.Column("delivery_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_transaction_delivery", "transactions", "deliveries", ["delivery_id"], ["id"])
    op.create_index("ix_transactions_delivery_id", "transactions", ["delivery_id"], unique=True)
    op.add_column("mini_orders", sa.Column("fulfillment", sa.String(20), nullable=False, server_default="pickup"))
    # Old desktop sales and tasks shared one database transaction and timestamp.
    # Rank duplicate signatures so one task is linked to one sales record.
    op.execute("""WITH sales AS (
        SELECT id,customer_id,product_id,quantity,created_at,note,
        row_number() OVER (PARTITION BY customer_id,product_id,quantity,created_at,note ORDER BY id) AS seq
        FROM transactions WHERE kind='sale' AND source='offline'
    ), tasks AS (
        SELECT id,customer_id,product_id,quantity,created_at,note,
        row_number() OVER (PARTITION BY customer_id,product_id,quantity,created_at,note ORDER BY id) AS seq
        FROM deliveries WHERE mini_order_id IS NULL
    ) UPDATE transactions t SET delivery_id=d.id FROM sales s JOIN tasks d
        ON s.customer_id=d.customer_id AND s.product_id=d.product_id AND s.quantity=d.quantity
        AND s.created_at=d.created_at AND s.note=d.note AND s.seq=d.seq WHERE t.id=s.id""")
    op.execute("""WITH sales AS (
        SELECT id,mini_order_id,product_id, row_number() OVER (PARTITION BY mini_order_id,product_id ORDER BY id) AS seq
        FROM transactions WHERE kind='sale' AND source='mini' AND mini_order_id IS NOT NULL
    ), tasks AS (
        SELECT id,mini_order_id,product_id, row_number() OVER (PARTITION BY mini_order_id,product_id ORDER BY id) AS seq
        FROM deliveries WHERE mini_order_id IS NOT NULL
    ) UPDATE transactions t SET delivery_id=d.id FROM sales s JOIN tasks d
        ON s.mini_order_id=d.mini_order_id AND s.product_id=d.product_id AND s.seq=d.seq WHERE t.id=s.id""")
    op.execute("""UPDATE mini_orders o SET fulfillment='delivery' WHERE EXISTS
                  (SELECT 1 FROM deliveries d WHERE d.mini_order_id=o.id)""")
    op.execute("""UPDATE mini_orders SET status='待配送' WHERE status='待提货' AND fulfillment='delivery'""")


def downgrade():
    op.execute("UPDATE mini_orders SET status='待提货' WHERE status IN ('待配送','配送中')")
    op.drop_column("mini_orders", "fulfillment")
    op.drop_index("ix_transactions_delivery_id", table_name="transactions")
    op.drop_constraint("fk_transaction_delivery", "transactions", type_="foreignkey")
    op.drop_column("transactions", "delivery_id")
