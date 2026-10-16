from datetime import date, datetime, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Customer, Product, Transaction
from ..schemas import PriceIn, SaleIn, StockIn
from ..serializers import transaction_info
from ..services.audit import write_log
from ..services.inventory import apply_stock

router = APIRouter(prefix="/api", tags=["采购与销售"])


@router.get("/transactions")
def list_transactions(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Transaction)
        .options(joinedload(Transaction.product), joinedload(Transaction.customer))
        .order_by(Transaction.created_at.desc())
        .limit(100)
    ).all()
    return [transaction_info(row) for row in rows]


@router.post("/purchases")
def purchase(data: StockIn, db: Session = Depends(get_db)):
    return apply_stock(db, "purchase", data)


@router.get("/purchases")
def list_purchases(
    start_date: date | None = None,
    end_date: date | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    query = select(Transaction).where(Transaction.kind == "purchase")
    if start_date:
        query = query.where(Transaction.created_at >= datetime.combine(start_date, time.min))
    if end_date:
        query = query.where(Transaction.created_at < datetime.combine(end_date + timedelta(days=1), time.min))
    if category:
        query = query.join(Product, Product.id == Transaction.product_id).where(Product.category == category)
    rows = db.scalars(
        query
        .options(joinedload(Transaction.product), joinedload(Transaction.customer))
        .order_by(Transaction.created_at.desc())
    ).all()
    return [transaction_info(row) for row in rows]


@router.post("/sales")
def sale(data: SaleIn, db: Session = Depends(get_db)):
    return apply_stock(db, "sale", data, data.customer_id, data.create_delivery, data.address)


@router.get("/sales")
def list_sales(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Transaction)
        .where(Transaction.kind == "sale")
        .options(joinedload(Transaction.product), joinedload(Transaction.customer))
        .order_by(Transaction.created_at.desc())
    ).all()
    return [transaction_info(row) for row in rows]


@router.get("/sales/overview")
def sales_overview(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    if start_date > end_date:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    start = datetime.combine(start_date, time.min)
    end = datetime.combine(end_date + timedelta(days=1), time.min)
    totals = db.execute(
        select(
            func.coalesce(func.sum(Transaction.quantity), 0),
            func.coalesce(func.sum(Transaction.total), 0),
            func.count(Transaction.id),
        ).where(Transaction.kind == "sale", Transaction.created_at >= start, Transaction.created_at < end)
    ).one()
    product_rows = db.execute(
        select(Product.id, Product.name, Product.brand, Product.category, Product.capacity,
               func.sum(Transaction.quantity).label("quantity"),
               func.sum(Transaction.total).label("amount"), func.count(Transaction.id).label("orders"))
        .join(Product, Product.id == Transaction.product_id)
        .where(Transaction.kind == "sale", Transaction.created_at >= start, Transaction.created_at < end)
        .group_by(Product.id, Product.name, Product.brand, Product.category, Product.capacity)
        .order_by(func.sum(Transaction.quantity).desc(), func.sum(Transaction.total).desc()).limit(10)
    ).all()
    brand_rows = db.execute(
        select(Product.brand, func.sum(Transaction.quantity).label("quantity"),
               func.sum(Transaction.total).label("amount"), func.count(Transaction.id).label("orders"))
        .join(Product, Product.id == Transaction.product_id)
        .where(Transaction.kind == "sale", Transaction.created_at >= start, Transaction.created_at < end)
        .group_by(Product.brand)
        .order_by(func.sum(Transaction.quantity).desc(), func.sum(Transaction.total).desc()).limit(10)
    ).all()
    customer_rows = db.execute(
        select(Customer.id, Customer.name, Customer.kind,
               func.sum(Transaction.quantity).label("quantity"),
               func.sum(Transaction.total).label("amount"), func.count(Transaction.id).label("orders"))
        .join(Customer, Customer.id == Transaction.customer_id)
        .where(Transaction.kind == "sale", Transaction.created_at >= start, Transaction.created_at < end)
        .group_by(Customer.id, Customer.name, Customer.kind)
        .order_by(func.sum(Transaction.quantity).desc(), func.sum(Transaction.total).desc()).limit(10)
    ).all()

    def amount(value):
        return float(value or 0)

    def ranked(row, fields):
        return {**fields(row), "quantity": int(row.quantity or 0), "amount": amount(row.amount), "orders": int(row.orders or 0)}

    return {
        "total_quantity": int(totals[0] or 0),
        "total_amount": amount(totals[1]),
        "order_count": int(totals[2] or 0),
        "products": [ranked(r, lambda x: {"id": x.id, "name": x.name, "brand": x.brand, "category": x.category, "capacity": x.capacity}) for r in product_rows],
        "brands": [ranked(r, lambda x: {"brand": x.brand}) for r in brand_rows],
        "customers_by_quantity": [ranked(r, lambda x: {"id": x.id, "name": x.name, "kind": x.kind}) for r in customer_rows],
        "customers_by_amount": [ranked(r, lambda x: {"id": x.id, "name": x.name, "kind": x.kind}) for r in sorted(customer_rows, key=lambda x: (x.amount or 0, x.quantity or 0), reverse=True)[:10]],
    }


@router.post("/adjustments")
def adjustment(data: PriceIn, db: Session = Depends(get_db)):
    product = db.scalar(
        select(Product)
        .where(Product.id == data.product_id, Product.active.is_(True))
        .with_for_update()
    )
    if not product:
        raise HTTPException(404, "在售商品不存在")
    previous = product.sell_price
    product.sell_price = data.unit_price
    tx = Transaction(
        kind="adjustment",
        product_id=product.id,
        quantity=0,
        unit_price=data.unit_price,
        total=0,
        note=data.note or "调整售价",
        operator=data.operator,
    )
    db.add(tx)
    write_log(
        db,
        "adjustment",
        product,
        data.operator,
        f"销售单价 ¥{previous:.2f}",
        f"销售单价 ¥{product.sell_price:.2f}",
        data.note or "调整售价",
    )
    db.commit()
    return transaction_info(tx)
