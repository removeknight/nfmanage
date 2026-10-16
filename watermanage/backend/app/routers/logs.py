from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import OperationLog, Transaction
from ..serializers import product_info

router = APIRouter(prefix="/api/logs", tags=["操作日志"])


@router.get("")
def list_logs(
    start_date: date | None = None,
    end_date: date | None = None,
    kind: str | None = None,
    product_id: int | None = None,
    db: Session = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    since = datetime.combine(start_date, time.min) if start_date else datetime.now() - timedelta(days=7)
    until = datetime.combine(end_date + timedelta(days=1), time.min) if end_date else None
    log_query = select(OperationLog).where(OperationLog.created_at >= since)
    tx_query = select(Transaction).where(Transaction.created_at >= since)
    if until:
        log_query = log_query.where(OperationLog.created_at < until)
        tx_query = tx_query.where(Transaction.created_at < until)
    if kind:
        log_query = log_query.where(OperationLog.action == kind)
        tx_query = tx_query.where(Transaction.kind == kind)
    if product_id:
        log_query = log_query.where(OperationLog.product_id == product_id)
        tx_query = tx_query.where(Transaction.product_id == product_id)
    recent = db.scalars(
        log_query.order_by(OperationLog.created_at.desc())
    ).all()
    legacy = db.scalars(
        tx_query
        .options(joinedload(Transaction.product))
        .order_by(Transaction.created_at.desc())
    ).all()
    legacy = [
        row
        for row in legacy
        if not any(
            entry.action == row.kind
            and entry.product_id == row.product_id
            and abs((entry.created_at - row.created_at).total_seconds()) < 5
            for entry in recent
        )
    ]

    result = [
        {
            "id": f"op-{row.id}",
            "kind": row.action,
            "product": {
                "brand": row.product_snapshot.split(" ", 1)[0],
                "name": row.product_snapshot.split(" ", 1)[1].split(" · ", 1)[0]
                if " " in row.product_snapshot
                else "",
                "capacity": row.product_snapshot.rsplit(" · ", 1)[-1]
                if " · " in row.product_snapshot
                else "",
            },
            "quantity": None,
            "unit_price": None,
            "total": None,
            "operator": row.operator,
            "before_value": row.before_value,
            "after_value": row.after_value,
            "note": row.detail,
            "created_at": row.created_at,
        }
        for row in recent
    ]
    result.extend(
        {
            "id": f"tx-{row.id}",
            "kind": row.kind,
            "product": product_info(row.product),
            "quantity": row.quantity,
            "unit_price": row.unit_price,
            "total": row.total,
            "operator": row.operator,
            "before_value": "",
            "after_value": "",
            "note": row.note,
            "created_at": row.created_at,
        }
        for row in legacy
    )
    return sorted(result, key=lambda row: row["created_at"], reverse=True)
