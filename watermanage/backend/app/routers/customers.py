from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Customer, MerchantMember
from ..schemas import CustomerIn, MerchantRoleIn
from ..services.auth import ROLE_LABELS, require_manager
from ..services.merchant_access import eligible_customer, set_member_role

router = APIRouter(prefix="/api/customers", tags=["客户"])


@router.get("")
def list_customers(db: Session = Depends(get_db)):
    rows = db.scalars(select(Customer).order_by(Customer.id.desc())).all()
    members = {m.customer_id: m for m in db.scalars(select(MerchantMember)).all()}
    return [_customer_info(row, members.get(row.id)) for row in rows]


def _customer_info(row: Customer, member=None):
    role = member.role if member and member.active and member.role in ROLE_LABELS else "customer"
    return {"id": row.id, "name": row.name, "kind": row.kind, "phone": row.phone,
            "source": row.source, "source_label": "小程序" if row.source == "mini" else "线下电脑录入",
            "address": row.address, "note": row.note, "created_at": row.created_at,
            "merchant_role": role, "merchant_role_label": ROLE_LABELS[role],
            "merchant_eligible": eligible_customer(row)}


@router.post("")
def create_customer(data: CustomerIn, db: Session = Depends(get_db)):
    row = Customer(**data.model_dump(), source="offline")
    db.add(row)
    db.commit()
    db.refresh(row)
    return _customer_info(row)


@router.put("/{customer_id}/merchant-role")
def update_merchant_role(customer_id: int, data: MerchantRoleIn,
                         actor: Customer = Depends(require_manager), db: Session = Depends(get_db)):
    row = set_member_role(db, actor, customer_id, data.role)
    db.commit()
    return _customer_info(row, db.get(MerchantMember, row.id))
