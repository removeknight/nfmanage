from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Product
from ..schemas import ProductIn
from ..services.audit import write_log

router = APIRouter(prefix="/api/products", tags=["商品"])


@router.get("")
def list_products(
    active: bool | None = True,
    page: int | None = Query(default=None, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    sort_by: str = "name",
    sort_dir: str = "asc",
    ids: list[int] | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = select(Product)
    if active is not None:
        query = query.where(Product.active.is_(active))
    if ids is not None:
        query = query.where(Product.id.in_(ids))
    if page is None:
        return db.scalars(query.order_by(Product.id)).all()
    sort_columns = {
        "name": Product.name,
        "brand": Product.brand,
        "category": Product.category,
        "capacity": Product.capacity,
        "package_type": Product.package_type,
        "stock": Product.stock,
        "average_cost": Product.average_cost,
        "sell_price": Product.sell_price,
        "stock_status": case(
            (Product.stock == 0, 0),
            (Product.stock <= Product.warning_stock, 1),
            else_=2,
        ),
    }
    if sort_by not in sort_columns:
        raise HTTPException(400, "无效的商品排序字段")
    if sort_dir not in {"asc", "desc"}:
        raise HTTPException(400, "无效的排序方向")
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    order = sort_columns[sort_by].asc() if sort_dir == "asc" else sort_columns[sort_by].desc()
    rows = db.scalars(
        query.order_by(order, Product.id.asc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.post("")
def create_product(data: ProductIn, db: Session = Depends(get_db)):
    row = Product(**data.model_dump(exclude={"operator"}))
    db.add(row)
    db.flush()
    write_log(db, "product_create", row, data.operator, "商品不存在", f"已上架；初始库存 {row.stock} 件", "新增商品")
    db.commit()
    db.refresh(row)
    return row


@router.post("/{item_id}/deactivate")
def deactivate_product(item_id: int, operator: str = "管理员", db: Session = Depends(get_db)):
    row = db.get(Product, item_id)
    if not row or not row.active:
        raise HTTPException(404, "在售商品不存在")
    row.active = False
    write_log(db, "product_deactivate", row, operator, "在售", "已下架", "商品下架")
    db.commit()
    return {"status": "ok"}


@router.post("/{item_id}/reactivate")
def reactivate_product(item_id: int, operator: str = "管理员", db: Session = Depends(get_db)):
    row = db.get(Product, item_id)
    if not row or row.active:
        raise HTTPException(404, "已下架商品不存在")
    row.active = True
    write_log(db, "product_reactivate", row, operator, "已下架", "在售", "商品重新上架")
    db.commit()
    return {"status": "ok"}
