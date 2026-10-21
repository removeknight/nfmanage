from datetime import timedelta
import hashlib
import secrets

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuthSession, Customer, MerchantMember
from ..settings import settings
from .coupons import utc_now

ROLE_LABELS = {"customer": "普通客户", "staff": "店员", "deputy": "副店长", "owner": "店主"}
MANAGER_ROLES = {"owner", "deputy"}


def current_identity(customer):
    mode = settings.mini_auth_mode.strip().lower()
    return customer.auth_provider == mode and (mode != "wechat" or customer.auth_app_id == settings.wechat_app_id)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def role_for(db, customer):
    member = db.scalar(select(MerchantMember).where(MerchantMember.customer_id == customer.id)
                       .execution_options(populate_existing=True))
    return member.role if member and member.active and member.role in {"staff", "deputy", "owner"} else "customer"


def identity_profile(db, customer):
    role = role_for(db, customer)
    return {"id": customer.id, "name": customer.name, "phone": customer.phone, "address": customer.address,
            "source": customer.source, "source_label": "小程序" if customer.source == "mini" else "线下电脑录入",
            "role": role, "role_label": ROLE_LABELS[role], "is_merchant": role != "customer",
            "auth_provider": customer.auth_provider}


def issue_session(db, customer, kind="mini"):
    token = secrets.token_urlsafe(32)
    expires = utc_now(db) + (timedelta(hours=8) if kind == "admin" else timedelta(days=7))
    db.add(AuthSession(token_hash=digest(token), customer_id=customer.id, kind=kind, expires_at=expires))
    return token


def get_session(authorization, db):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "请先登录")
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == digest(authorization[7:]),
                        AuthSession.revoked_at.is_(None), AuthSession.expires_at > utc_now(db)))
    if not session or session.customer.source != "mini":
        raise HTTPException(401, "登录已过期，请重新登录")
    customer = session.customer
    if not current_identity(customer):
        raise HTTPException(401, "登录环境已切换，请重新登录")
    return session


def mini_customer(authorization, db):
    session = get_session(authorization, db)
    if session.kind != "mini":
        raise HTTPException(403, "请使用小程序登录")
    return session.customer


def require_merchant(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = get_session(authorization, db).customer
    if role_for(db, customer) not in {"owner", "deputy", "staff"}:
        raise HTTPException(403, "此操作需要商家授权")
    return customer


def require_manager(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = get_session(authorization, db).customer
    if role_for(db, customer) not in MANAGER_ROLES:
        raise HTTPException(403, "此操作仅店主或副店长可用")
    return customer


def require_owner(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = get_session(authorization, db).customer
    if role_for(db, customer) != "owner":
        raise HTTPException(403, "此操作仅店主可用")
    return customer
