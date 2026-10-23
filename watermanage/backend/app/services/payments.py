"""Automatic full settlement at PC opening / mini pickup, without manual entry."""
import hashlib
import json
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select

from ..models import SaleReceipt, Transaction
from .audit import write_log
from .coupons import iso_utc, utc_now


def fingerprint(payload):
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def payment_info(row, cancelled=False):
    status = "已退款" if cancelled and row.paid_at else "已取消" if cancelled else "已收款" if row.paid_at else "未收款"
    return {"payment_status": status, "received_total": float(row.received_total or 0), "paid_at": iso_utc(row.paid_at)}


def collect_sale(db, sale, operator, now=None):
    if sale.paid_at:
        return
    if sale.voided_at:
        raise HTTPException(409, "已取消销售不能登记收款")
    now = now or utc_now(db)
    sale.received_total, sale.paid_at = sale.total, now
    db.add(SaleReceipt(transaction_id=sale.id, kind="receipt", amount=sale.total,
        cost_amount=Decimal(sale.quantity)*sale.cost_price if sale.cost_price is not None else None,
        quantity=sale.quantity, occurred_at=now, dedupe_key=f"receipt:{sale.id}", operator=operator[:80]))


def collect_order(db, order, operator):
    if order.paid_at:
        return
    sales = db.scalars(select(Transaction).where(Transaction.mini_order_id == order.id,
        Transaction.kind == "sale", Transaction.voided_at.is_(None)).order_by(Transaction.id).with_for_update()).all()
    if not sales or sum((sale.total for sale in sales), Decimal(0)) != order.total:
        raise HTTPException(409, "订单销售流水不完整，未登记收款，请联系管理员核对")
    now = utc_now(db)
    for sale in sales:
        collect_sale(db, sale, operator, now)
    order.received_total, order.paid_at = order.total, now
    write_log(db, "order_payment", None, operator[:80], "未收款", f"实收 ¥{order.total:.2f}",
              f"订单 {order.order_no} 提货核销时按优惠后金额自动登记收款")


def refund_sales(db, order, sales, operator, now):
    if not order.paid_at:
        return
    for sale in sales:
        if not sale.paid_at:
            raise HTTPException(409, "收款流水状态不一致，请先核对")
        db.add(SaleReceipt(transaction_id=sale.id, kind="refund", amount=-sale.received_total,
            cost_amount=-Decimal(sale.quantity)*sale.cost_price if sale.cost_price is not None else None,
            quantity=-sale.quantity, occurred_at=now, dedupe_key=f"refund:{sale.id}", operator=operator[:80]))
        sale.received_total = Decimal(0)
    refunded = order.received_total
    order.received_total = Decimal(0)
    write_log(db, "order_refund", None, operator[:80], f"实收 ¥{refunded:.2f}", "已退款",
              f"订单 {order.order_no} 商家取消，登记线下退款并冲减实收及利润")
