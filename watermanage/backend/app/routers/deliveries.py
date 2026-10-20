from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Delivery, MiniOrder
from ..schemas import StatusIn
from ..serializers import delivery_info
from ..services.audit import write_log

router = APIRouter(prefix="/api/deliveries", tags=["配送"])


@router.get("")
def list_deliveries(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Delivery)
        .options(joinedload(Delivery.customer), joinedload(Delivery.product))
        .order_by(Delivery.created_at.desc())
        .limit(500)
    ).all()
    return [delivery_info(row) for row in rows]


@router.patch("/{delivery_id}")
def update_delivery(delivery_id: int, data: StatusIn, db: Session = Depends(get_db)):
    linked_id = db.scalar(select(Delivery.mini_order_id).where(Delivery.id == delivery_id))
    # Keep the same lock order as cancellation/redemption: order, then deliveries.
    if linked_id:
        db.scalar(select(MiniOrder).where(MiniOrder.id == linked_id).with_for_update())
    row = db.scalar(
        select(Delivery)
        .where(Delivery.id == delivery_id)
        .options(joinedload(Delivery.product), joinedload(Delivery.customer))
        .with_for_update(of=Delivery)
    )
    if not row:
        raise HTTPException(404, "配送单不存在")
    if row.mini_order_id:
        raise HTTPException(409, "小程序订单请在“小程序订单”页面取消或核销，库存与优惠券会同步处理")
    if data.status not in {"待配送", "配送中", "已完成", "已取消"}:
        raise HTTPException(400, "配送状态无效")
    previous = row.status
    row.status = data.status
    if data.status == "已完成" and previous != "已完成":
        row.completed_at = datetime.now()
    elif data.status != "已完成":
        row.completed_at = None
    write_log(
        db,
        "delivery_status",
        row.product,
        data.operator,
        previous,
        data.status,
        f"配送单 #{row.id:05d} · 客户 {row.customer.name}",
    )
    db.commit()
    return delivery_info(row)
