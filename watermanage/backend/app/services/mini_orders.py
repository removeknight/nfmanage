from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from sqlalchemy import select
from ..models import Delivery, Product, Transaction
from .audit import write_log
from .coupons import release_coupon, utc_now

CENT = Decimal("0.01")
ACTIVE_ORDER_STATUSES = ("待提货", "待配送", "配送中")


def record_sale(db, order):
    """Record immediate stock and financial effects inside the checkout transaction."""
    items = sorted(order.items, key=lambda item: item.product_id)
    restricted = order.coupon_usage_type == "large_bucket"
    eligible_total = sum((item.subtotal for item in items if not restricted or item.category == "大桶水"), Decimal(0))
    cumulative, allocated_total = Decimal(0), Decimal(0)
    for item in items:
        product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
        if not product or product.stock-product.reserved_stock < item.quantity:
            raise HTTPException(409, "商品库存不足，请刷新后重新下单")
        before = product.stock
        product.stock -= item.quantity
        allocated = Decimal(0)
        if eligible_total and (not restricted or item.category == "大桶水"):
            cumulative += item.subtotal
            target = (order.discount_amount*cumulative/eligible_total).quantize(CENT, rounding=ROUND_HALF_UP)
            allocated, allocated_total = target-allocated_total, target
        net_total = item.subtotal-allocated
        sale = Transaction(kind="sale", source="mini", mini_order_id=order.id,
            product_id=product.id, customer_id=order.customer_id, quantity=item.quantity,
            unit_price=(net_total/item.quantity).quantize(CENT, rounding=ROUND_HALF_UP),
            cost_price=product.average_cost, total=net_total,
            note=f"商城订单 {order.order_no}（优惠 ¥{allocated}）", operator="小程序订单")
        db.add(sale)
        if order.fulfillment == "delivery":
            task = Delivery(customer_id=order.customer_id, product_id=product.id, quantity=item.quantity,
                            mini_order_id=order.id, address=order.address, note=f"商城订单 {order.order_no}")
            db.add(task)
            db.flush()
            sale.delivery_id = task.id
        write_log(db, "mini_order_sale", product, "小程序用户", f"库存 {before}", f"库存 {product.stock}",
                  f"商城订单 {order.order_no} 下单成功，出库 {item.quantity} 件")


def cancel_sale(db, order, operator):
    """Restore stock/cost, void linked sales, and release the coupon exactly once."""
    if order.status == "已取消":
        return
    if order.status not in ACTIVE_ORDER_STATUSES:
        raise HTTPException(409, "只有未完成的订单可以取消，已核销或已完成订单不能取消")
    deliveries = db.scalars(select(Delivery).where(Delivery.mini_order_id == order.id).with_for_update()).all()
    if any(row.status == "已完成" for row in deliveries):
        raise HTTPException(409, "配送已完成，不能直接取消订单")
    sales = db.scalars(select(Transaction).where(Transaction.mini_order_id == order.id,
                        Transaction.kind == "sale", Transaction.voided_at.is_(None)).with_for_update()).all()
    now = utc_now(db)
    for item in sorted(order.items, key=lambda line: line.product_id):
        linked = [sale for sale in sales if sale.product_id == item.product_id]
        if sum(sale.quantity for sale in linked) != item.quantity:
            raise HTTPException(409, "订单销售流水不完整，请先核对，库存未提交变更")
        product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
        if product is None:
            raise HTTPException(409, "订单商品不存在，请先核对库存")
        before = product.stock
        returned_cost = sum((Decimal(sale.quantity)*(sale.cost_price if sale.cost_price is not None else product.average_cost)
                             for sale in linked), Decimal(0))
        product.average_cost = (Decimal(before)*product.average_cost+returned_cost)/Decimal(before+item.quantity)
        product.stock += item.quantity
        for sale in linked:
            sale.voided_at = now
        write_log(db, "mini_order_cancel", product, operator, f"库存 {before}", f"库存 {product.stock}",
                  f"商城订单 {order.order_no} 取消，退回 {item.quantity} 件并冲销销售流水")
    release_coupon(db, order)
    for delivery in deliveries:
        delivery.status, delivery.completed_at = "已取消", None
    order.status, order.canceled_at = "已取消", now
