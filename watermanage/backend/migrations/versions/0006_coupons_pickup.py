"""Coupons, pickup codes, and customer-only order visibility."""
import secrets

from alembic import op
import sqlalchemy as sa

revision = "0006_coupons_pickup"
down_revision = "0005_mini_orders"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("customers", sa.Column("welcome_coupon_granted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table("coupon_settings", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("welcome_amount", sa.Numeric(14, 2), nullable=False),
                    sa.Column("welcome_validity_days", sa.Integer(), nullable=False))
    op.execute("INSERT INTO coupon_settings VALUES (1, 5.00, 7)")
    op.create_table("customer_coupons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("grant_key", sa.String(64), nullable=False),
        sa.Column("issued_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_order_id", sa.Integer(), sa.ForeignKey("mini_orders.id"), nullable=True),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("customer_id", "grant_key", name="uq_coupon_customer_grant"))
    for name in ("customer_id", "grant_key", "expires_at", "used_order_id"):
        op.create_index("ix_customer_coupons_" + name, "customer_coupons", [name])
    op.add_column("mini_orders", sa.Column("original_total", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("mini_orders", sa.Column("discount_amount", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("mini_orders", sa.Column("coupon_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_order_coupon", "mini_orders", "customer_coupons", ["coupon_id"], ["id"])
    op.add_column("mini_orders", sa.Column("hidden_by_customer", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("mini_orders", sa.Column("pickup_code", sa.String(6), nullable=True))
    op.add_column("mini_orders", sa.Column("redeemed_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE mini_orders SET original_total = total")
    conn = op.get_bind()
    codes = set()
    for order_id in conn.execute(sa.text("SELECT id FROM mini_orders ORDER BY id")).scalars().all():
        code = str(secrets.randbelow(900000) + 100000)
        while code in codes:
            code = str(secrets.randbelow(900000) + 100000)
        codes.add(code)
        conn.execute(sa.text("UPDATE mini_orders SET pickup_code=:code WHERE id=:id"), {"code": code, "id": order_id})
    op.alter_column("mini_orders", "pickup_code", nullable=False)
    op.create_index("ix_mini_orders_pickup_code", "mini_orders", ["pickup_code"], unique=True)
    op.add_column("deliveries", sa.Column("mini_order_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_delivery_mini_order", "deliveries", "mini_orders", ["mini_order_id"], ["id"])
    op.create_index("ix_deliveries_mini_order_id", "deliveries", ["mini_order_id"])
    op.execute("""UPDATE deliveries d SET mini_order_id=o.id FROM mini_orders o
                  WHERE d.note = '商城订单 ' || o.order_no
                     OR d.note LIKE '商城订单 ' || o.order_no || ' · %'""")


def downgrade():
    op.drop_index("ix_deliveries_mini_order_id", table_name="deliveries")
    op.drop_constraint("fk_delivery_mini_order", "deliveries", type_="foreignkey")
    op.drop_column("deliveries", "mini_order_id")
    op.drop_index("ix_mini_orders_pickup_code", table_name="mini_orders")
    op.drop_constraint("fk_order_coupon", "mini_orders", type_="foreignkey")
    for name in ("redeemed_at", "pickup_code", "hidden_by_customer", "coupon_id", "discount_amount", "original_total"):
        op.drop_column("mini_orders", name)
    op.drop_table("customer_coupons")
    op.drop_table("coupon_settings")
    op.drop_column("customers", "welcome_coupon_granted")
