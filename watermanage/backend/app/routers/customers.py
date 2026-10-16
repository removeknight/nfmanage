from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Customer
from ..schemas import CustomerIn

router = APIRouter(prefix="/api/customers", tags=["客户"])


@router.get("")
def list_customers(db: Session = Depends(get_db)):
    return db.scalars(select(Customer).order_by(Customer.id.desc())).all()


@router.post("")
def create_customer(data: CustomerIn, db: Session = Depends(get_db)):
    row = Customer(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
