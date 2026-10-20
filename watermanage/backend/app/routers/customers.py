from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Customer
from ..schemas import CustomerIn

router = APIRouter(prefix="/api/customers", tags=["客户"])


@router.get("")
def list_customers(db: Session = Depends(get_db)):
    rows = db.scalars(select(Customer).order_by(Customer.id.desc())).all()
    return [_customer_info(row) for row in rows]


def _customer_info(row: Customer):
    return {"id": row.id, "name": row.name, "kind": row.kind, "phone": row.phone,
            "source": row.source, "source_label": "小程序" if row.source == "mini" else "线下电脑录入",
            "address": row.address, "note": row.note, "created_at": row.created_at}


@router.post("")
def create_customer(data: CustomerIn, db: Session = Depends(get_db)):
    row = Customer(**data.model_dump(), source="offline")
    db.add(row)
    db.commit()
    db.refresh(row)
    return _customer_info(row)
