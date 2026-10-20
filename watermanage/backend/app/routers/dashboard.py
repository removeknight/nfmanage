from datetime import timezone

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Delivery, Product, Transaction
from ..services.coupons import utc_now
from ..services.reporting_time import SHOP_TIMEZONE, start_of_day_utc

router = APIRouter(prefix="/api", tags=["经营概览"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = start_of_day_utc(utc_now(db).replace(tzinfo=timezone.utc).astimezone(SHOP_TIMEZONE).date())
    sale_total = db.scalar(
        select(func.coalesce(func.sum(Transaction.total), 0)).where(
            Transaction.kind == "sale", Transaction.voided_at.is_(None), Transaction.created_at >= today
        )
    ) or 0
    sale_count = db.scalar(
        select(func.coalesce(func.sum(Transaction.quantity), 0)).where(
            Transaction.kind == "sale", Transaction.voided_at.is_(None), Transaction.created_at >= today
        )
    ) or 0
    pending = db.scalar(
        select(func.count(Delivery.id)).where(Delivery.status.in_(["待配送", "配送中"]))
    ) or 0
    low = db.scalars(
        select(Product)
        .where(Product.active.is_(True), Product.stock <= Product.warning_stock)
        .order_by(Product.stock)
    ).all()
    inventory = db.scalars(
        select(Product)
        .where(Product.active.is_(True))
        .order_by(
            case((Product.stock == 0, 0), (Product.stock <= Product.warning_stock, 1), else_=2),
            Product.stock,
            Product.id,
        )
    ).all()
    inventory_balance = db.scalar(
        select(func.coalesce(func.sum(Product.stock * Product.average_cost), 0))
    ) or 0
    return {
        "sales_today": round(float(sale_total), 2),
        "units_today": sale_count,
        "pending_deliveries": pending,
        "low_stock": low,
        "inventory": inventory,
        "inventory_balance": round(float(inventory_balance), 2),
    }
