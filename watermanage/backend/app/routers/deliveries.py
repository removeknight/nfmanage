from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Delivery
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
    row = db.scalar(
        select(Delivery)
        .where(Delivery.id == delivery_id)
        .options(joinedload(Delivery.product), joinedload(Delivery.customer))
    )
    if not row:
        raise HTTPException(404, "配送单不存在")
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
