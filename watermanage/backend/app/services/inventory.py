from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..models import Customer, Delivery, Product, Transaction
from ..schemas import StockIn
from ..serializers import transaction_info
from .audit import write_log
from .payments import collect_sale, fingerprint


def apply_stock(
    db: Session,
    kind: str,
    data: StockIn,
    customer_id: int | None = None,
    delivery: bool = False,
    address: str = "",
    actor: Customer | None = None,
):
    request_hash = None
    if kind == "sale":
        request_hash = fingerprint({"actor_id": actor.id if actor else None,
            "payload": data.model_dump(exclude={"request_key", "operator"})})
        if db.get_bind().dialect.name == "postgresql":
            lock_key = int.from_bytes(bytes.fromhex(fingerprint({"sale_key": data.request_key}))[:8], "big", signed=True)
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
        existing = db.scalar(select(Transaction).where(Transaction.request_key == data.request_key))
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(409, "该提交编号已用于另一笔电脑订单，请先查看订单结果")
            return transaction_info(existing)
    customer = db.get(Customer, customer_id) if kind == "sale" and customer_id else None
    if kind == "sale" and not customer:
        raise HTTPException(400, "请选择有效客户")
    product = db.scalar(
        select(Product)
        .where(Product.id == data.product_id, Product.active.is_(True))
        .with_for_update()
    )
    if not product:
        raise HTTPException(404, "在售商品不存在")
    available = product.stock - product.reserved_stock
    if kind == "sale" and available < data.quantity:
        raise HTTPException(400, f"可售库存不足，当前可售库存 {available}")

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
        source="offline",
        product_id=product.id,
        customer_id=customer_id,
        quantity=data.quantity,
        unit_price=data.unit_price,
        cost_price=before_cost if kind == "sale" else None,
        total=data.quantity * data.unit_price,
        note=data.note,
        operator=actor.name[:80] if actor else data.operator,
        request_key=data.request_key if kind == "sale" else None,
        request_hash=request_hash,
    )
    db.add(tx)
    write_log(
        db,
        kind,
        product,
        actor.name[:80] if actor else data.operator,
        f"库存 {before_stock} 件；移动均价 ¥{before_cost:.4f}",
        f"库存 {product.stock} 件；移动均价 ¥{product.average_cost:.4f}",
        f"{'采购入库' if kind == 'purchase' else '销售出库'} {data.quantity} 件；单价 ¥{data.unit_price:.2f}；{data.note}".strip(),
    )

    if delivery:
        task = Delivery(
            customer_id=customer_id,
            product_id=product.id,
            quantity=data.quantity,
            address=address or customer.address,
            note=data.note,
        )
        db.add(task)
        db.flush()
        tx.delivery_id = task.id

    if kind == "sale":
        db.flush()
        collect_sale(db, tx, actor.name if actor else data.operator)
    db.commit()
    db.refresh(tx)
    return transaction_info(tx)
