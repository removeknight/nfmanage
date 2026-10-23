from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Customer, LegalConsent, LegalDocument
from ..schemas import PrivacySettingIn
from ..services.audit import write_log
from ..services.auth import require_manager
from ..services.coupons import iso_utc
from ..services.privacy import legal_info, privacy_settings

# Public documents are served under /api/mini/legal, management uses this guarded router.
router = APIRouter(prefix="/api/privacy", tags=["隐私与协议"], dependencies=[Depends(require_manager)])


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return legal_info(db)


@router.put("/settings")
def update_settings(data: PrivacySettingIn, actor: Customer = Depends(require_manager), db: Session = Depends(get_db)):
    config = privacy_settings(db, lock=True)
    config.operator_name, config.contact_phone = data.operator_name, data.contact_phone
    write_log(db, "privacy_settings", None, actor.name, "", "已更新", "更新隐私指引运营主体或商家联系方式，协议版本同步更新")
    db.commit()
    return legal_info(db)


@router.get("/consents")
def consents(customer_id: int | None = None, limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)):
    query = select(LegalConsent, Customer).join(Customer, Customer.id == LegalConsent.customer_id)
    if customer_id is not None:
        query = query.where(LegalConsent.customer_id == customer_id)
    rows = db.execute(query.order_by(LegalConsent.id.desc()).limit(limit)).all()
    return [{"id": row.id, "customer_id": customer.id, "customer_name": customer.name,
             "privacy_version": row.privacy_version, "terms_version": row.terms_version,
             "address_allowed": row.address_allowed, "source": row.source, "accepted_at": iso_utc(row.accepted_at)}
            for row, customer in rows]


@router.get("/documents/{kind}/{version}")
def archived_document(kind: str, version: str, db: Session = Depends(get_db)):
    import json
    row = db.scalar(select(LegalDocument).where(LegalDocument.kind == kind, LegalDocument.version == version))
    if row is None:
        raise HTTPException(404, "协议存档不存在")
    return {"version": row.version, **json.loads(row.content)}
