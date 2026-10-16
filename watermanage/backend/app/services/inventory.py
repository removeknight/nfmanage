from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Customer, Delivery, Product, Transaction
from ..schemas import StockIn
from ..serializers import transaction_info
from .audit import write_log


def apply_stock(
    db: Session,
    kind: str,
    data: StockIn,
    customer_id: int | None = None,
    delivery: bool = False,
    address: str = "",
):
    product = db.scalar(
        select(Product)
        .where(Product.id == data.product_id, Product.active.is_(True))
        .with_for_update()
    )
    if not product:
        raise HTTPException(404, "在售商品不存在")
    if kind == "sale" and product.stock < data.quantity:
        raise HTTPException(400, f"库存不足，当前库存 {product.stock}")

    before_stock, before_cost = product.stock, product.average_cost
    if kind == "purchase":
        product.average_cost = (
            Decimal(product.stock) * product.average_cost
            + Decimal(data.quantity) * data.unit_price
        ) / Decimal(product.stock + data.quantity)
        product.stock += data.quantity
    else:
        product.stock -= data.quantity

    tx = Transaction(
        kind=kind,
        product_id=product.id,
        customer_id=customer_id,
        quantity=data.quantity,
        unit_price=data.unit_price,
        cost_price=before_cost if kind == "sale" else None,
        total=data.quantity * data.unit_price,
        note=data.note,
        operator=data.operator,
    )
    db.add(tx)
    write_log(
        db,
        kind,
        product,
        data.operator,
        f"库存 {before_stock} 件；移动均价 ¥{before_cost:.4f}",
        f"库存 {product.stock} 件；移动均价 ¥{product.average_cost:.4f}",
        f"{'采购入库' if kind == 'purchase' else '销售出库'} {data.quantity} 件；单价 ¥{data.unit_price:.2f}；{data.note}".strip(),
    )

    if delivery:
        customer = db.get(Customer, customer_id) if customer_id else None
        if not customer:
            raise HTTPException(400, "请选择有效客户")
        db.add(
            Delivery(
                customer_id=customer_id,
                product_id=product.id,
                quantity=data.quantity,
                address=address or customer.address,
                note=data.note,
            )
        )

    db.commit()
    db.refresh(tx)
    return transaction_info(tx)
