"""Separate customer/order sources and switch checkout to immediate pickup sales."""
from decimal import Decimal, ROUND_HALF_UP

from alembic import op
import sqlalchemy as sa

revision = "0007_direct_pickup"
down_revision = "0006_coupons_pickup"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("customers", sa.Column("source", sa.String(20), nullable=False, server_default="offline"))
    op.execute("UPDATE customers SET source='mini' WHERE wechat_openid IS NOT NULL")
    op.drop_index("ix_customers_wechat_openid", table_name="customers")
    op.create_index("ix_customers_wechat_openid", "customers", ["wechat_openid"])
    op.create_index("ix_customers_source", "customers", ["source"])
    op.create_unique_constraint("uq_customer_source_openid", "customers", ["source", "wechat_openid"])
    op.add_column("transactions", sa.Column("source", sa.String(20), nullable=False, server_default="offline"))
    op.add_column("transactions", sa.Column("mini_order_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_transaction_mini_order", "transactions", "mini_orders", ["mini_order_id"], ["id"])
    op.create_index("ix_transactions_source", "transactions", ["source"])
    op.create_index("ix_transactions_mini_order_id", "transactions", ["mini_order_id"])
    op.add_column("transactions", sa.Column("voided_at", sa.DateTime(), nullable=True))
    op.add_column("mini_orders", sa.Column("source", sa.String(20), nullable=False, server_default="mini"))
    op.create_index("ix_mini_orders_source", "mini_orders", ["source"])
    op.add_column("mini_orders", sa.Column("canceled_at", sa.DateTime(), nullable=True))
    op.add_column("mini_orders", sa.Column("coupon_usage_type", sa.String(20), nullable=True))
    op.add_column("coupon_settings", sa.Column("welcome_usage_type", sa.String(20), nullable=False, server_default="unrestricted"))
    op.add_column("customer_coupons", sa.Column("usage_type", sa.String(20), nullable=False, server_default="unrestricted"))
    op.execute("UPDATE mini_orders SET coupon_usage_type='unrestricted' WHERE coupon_id IS NOT NULL")
    op.execute("""UPDATE transactions t SET source='mini', mini_order_id=o.id FROM mini_orders o
                  WHERE t.kind='sale' AND t.operator='小程序订单'
                  AND (t.note='商城订单 ' || o.order_no OR t.note LIKE '商城订单 ' || o.order_no || '（%')""")
    conn = op.get_bind()
    meta = sa.MetaData()
    tables = {name: sa.Table(name, meta, autoload_with=conn) for name in
              ("mini_orders", "mini_order_items", "products", "transactions", "operation_logs")}
    orders, items, products, sales, logs = [tables[n] for n in tables]
    # Old confirmed orders have already left stock. Never deduct those again.
    op.execute("UPDATE mini_orders SET status='待提货' WHERE status='已确认'")
    # Finish pending orders inside the same migration transaction, consuming reservations once.
    for order in conn.execute(sa.select(orders).where(orders.c.status == "待商家确认").order_by(orders.c.id).with_for_update()).mappings().all():
        cumulative, allocated_total = Decimal(0), Decimal(0)
        for item in conn.execute(sa.select(items).where(items.c.order_id == order["id"]).order_by(items.c.product_id)).mappings().all():
            product = conn.execute(sa.select(products).where(products.c.id == item["product_id"]).with_for_update()).mappings().one()
            quantity = item["quantity"]
            if product["stock"] < quantity or product["reserved_stock"] < quantity:
                raise RuntimeError(f"Order {order['id']} has inconsistent inventory reservations; upgrade rolled back")
            cumulative += item["subtotal"]
            target = (order["discount_amount"]*cumulative/order["original_total"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if order["original_total"] else Decimal(0)
            allocated, allocated_total = target-allocated_total, target
            net = item["subtotal"]-allocated
            conn.execute(products.update().where(products.c.id == product["id"]).values(
                stock=product["stock"]-quantity, reserved_stock=product["reserved_stock"]-quantity))
            conn.execute(sales.insert().values(kind="sale", source="mini", mini_order_id=order["id"],
                product_id=product["id"], customer_id=order["customer_id"], quantity=quantity,
                unit_price=(net/quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                cost_price=product["average_cost"], total=net, operator="小程序订单",
                note=f"商城订单 {order['order_no']}（升级转为待提货）"))
            conn.execute(logs.insert().values(action="mini_order_sale", product_id=product["id"],
                product_snapshot=f"{product['brand']} {product['name']} · {product['capacity']}", operator="系统升级",
                before_value=f"库存 {product['stock']} / 预留 {product['reserved_stock']}",
                after_value=f"库存 {product['stock']-quantity} / 预留 {product['reserved_stock']-quantity}",
                detail=f"商城订单 {order['order_no']} 自动完成下单出库"))
        conn.execute(orders.update().where(orders.c.id == order["id"]).values(status="待提货", confirmed_at=sa.func.now()))
    op.alter_column("mini_orders", "status", server_default="待提货")


def downgrade():
    conn = op.get_bind()
    if conn.scalar(sa.text("SELECT count(*) FROM transactions WHERE voided_at IS NOT NULL")):
        raise RuntimeError("Canceled sales exist. Restore the pre-upgrade backup instead of discarding reversal records.")
    if conn.scalar(sa.text("SELECT count(*) FROM customers a JOIN customers b ON a.wechat_openid=b.wechat_openid AND a.id<b.id")):
        raise RuntimeError("Cross-source identities exist; restore the pre-upgrade backup.")
    op.execute("UPDATE mini_orders SET status='已确认' WHERE status='待提货'")
    op.alter_column("mini_orders", "status", server_default="待商家确认")
    op.drop_column("customer_coupons", "usage_type")
    op.drop_column("coupon_settings", "welcome_usage_type")
    for name in ("coupon_usage_type", "canceled_at"):
        op.drop_column("mini_orders", name)
    op.drop_index("ix_mini_orders_source", table_name="mini_orders")
    op.drop_column("mini_orders", "source")
    op.drop_index("ix_transactions_mini_order_id", table_name="transactions")
    op.drop_index("ix_transactions_source", table_name="transactions")
    op.drop_constraint("fk_transaction_mini_order", "transactions", type_="foreignkey")
    for name in ("mini_order_id", "voided_at", "source"):
        op.drop_column("transactions", name)
    op.drop_constraint("uq_customer_source_openid", "customers", type_="unique")
    op.drop_index("ix_customers_source", table_name="customers")
    op.drop_index("ix_customers_wechat_openid", table_name="customers")
    op.create_index("ix_customers_wechat_openid", "customers", ["wechat_openid"], unique=True)
    op.drop_column("customers", "source")
