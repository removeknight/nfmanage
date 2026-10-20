"""Add mini program identities, inventory reservations, and order snapshots."""

from alembic import op
import sqlalchemy as sa

revision = "0005_mini_orders"
down_revision = "0004_delivery_completion_time"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    customer_columns = {col["name"] for col in sa.inspect(bind).get_columns("customers")}
    product_columns = {col["name"] for col in sa.inspect(bind).get_columns("products")}
    if "wechat_openid" not in customer_columns:
        op.add_column("customers", sa.Column("wechat_openid", sa.String(80), nullable=True))
    if "mini_token_hash" not in customer_columns:
        op.add_column("customers", sa.Column("mini_token_hash", sa.String(64), nullable=True))
    if "reserved_stock" not in product_columns:
        op.add_column("products", sa.Column("reserved_stock", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_customers_wechat_openid", "customers", ["wechat_openid"], unique=True, if_not_exists=True)
    if not sa.inspect(bind).has_table("mini_orders"):
        op.create_table(
            "mini_orders",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_no", sa.String(40), nullable=False),
            sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="待商家确认"),
            sa.Column("total", sa.Numeric(14, 2), nullable=False),
            sa.Column("address", sa.String(300), nullable=False, server_default=""),
            sa.Column("note", sa.String(300), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_mini_orders_order_no", "mini_orders", ["order_no"], unique=True)
        op.create_index("ix_mini_orders_customer_id", "mini_orders", ["customer_id"])
        op.create_index("ix_mini_orders_status", "mini_orders", ["status"])
        op.create_index("ix_mini_orders_created_at", "mini_orders", ["created_at"])
    if not sa.inspect(bind).has_table("mini_order_items"):
        op.create_table(
            "mini_order_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("mini_orders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
            sa.Column("product_name", sa.String(120), nullable=False),
            sa.Column("brand", sa.String(80), nullable=False),
            sa.Column("category", sa.String(40), nullable=False),
            sa.Column("capacity", sa.String(40), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
            sa.Column("subtotal", sa.Numeric(14, 2), nullable=False),
        )
        op.create_index("ix_mini_order_items_order_id", "mini_order_items", ["order_id"])
        op.create_index("ix_mini_order_items_product_id", "mini_order_items", ["product_id"])


def downgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table("mini_order_items"):
        op.drop_table("mini_order_items")
    if sa.inspect(bind).has_table("mini_orders"):
        op.drop_table("mini_orders")
    op.drop_index("ix_customers_wechat_openid", table_name="customers", if_exists=True)
    product_columns = {col["name"] for col in sa.inspect(bind).get_columns("products")}
    customer_columns = {col["name"] for col in sa.inspect(bind).get_columns("customers")}
    if "reserved_stock" in product_columns:
        op.drop_column("products", "reserved_stock")
    if "mini_token_hash" in customer_columns:
        op.drop_column("customers", "mini_token_hash")
    if "wechat_openid" in customer_columns:
        op.drop_column("customers", "wechat_openid")
