from datetime import timedelta
import secrets

from fastapi import HTTPException
from sqlalchemy import select

from ..models import Customer, MerchantCode, MerchantControl, MerchantMember
from ..settings import settings
from .auth import current_identity, digest, role_for
from .coupons import utc_now


def lock_access(db):
    # One row serializes owner bootstrap, invitations and revocations across workers.
    db.scalar(select(MerchantControl).where(MerchantControl.id == 1).with_for_update())


def has_owner(db):
    mode = settings.mini_auth_mode.strip().lower()
    query = select(MerchantMember.customer_id).join(Customer, Customer.id == MerchantMember.customer_id).where(
        MerchantMember.active.is_(True), MerchantMember.role == "owner", Customer.auth_provider == mode,
        Customer.auth_app_id == ("mock" if mode == "mock" else settings.wechat_app_id))
    return db.scalar(query.limit(1)) is not None


def new_code(db, kind, creator=None):
    lock_access(db)
    if kind == "bootstrap":
        if has_owner(db):
            raise HTTPException(409, "已有店主，不能再次初始化")
    elif not creator or role_for(db, creator) != "owner":
        raise HTTPException(403, "此操作仅店主可用")
    now = utc_now(db)
    # Replacing a code invalidates all previous unclaimed codes of this kind/issuer.
    query = select(MerchantCode).where(MerchantCode.kind == kind, MerchantCode.used_at.is_(None))
    if creator:
        query = query.where(MerchantCode.created_by == creator.id)
    for old in db.scalars(query).all():
        old.used_at = now
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    raw = "".join(secrets.choice(alphabet) for _ in range(12 if kind == "web" else 24))
    expires = now + timedelta(minutes=5 if kind == "web" else 30)
    db.add(MerchantCode(code_hash=digest(raw), kind=kind, created_by=creator.id if creator else None, expires_at=expires))
    return {"code": raw, "expires_at": expires.isoformat() + "Z", "validity_minutes": 5 if kind == "web" else 30}


def consume_code(db, raw, kinds):
    lock_access(db)
    normalized = raw.strip().upper().replace("-", "").replace(" ", "")
    code = db.scalar(select(MerchantCode).where(MerchantCode.code_hash == digest(normalized)).with_for_update())
    if not code or code.kind not in kinds or code.used_at or code.expires_at <= utc_now(db):
        raise HTTPException(400, "授权码无效、已使用或已过期")
    if code.kind != "bootstrap":
        creator = db.get(Customer, code.created_by)
        if not creator or not current_identity(creator) or role_for(db, creator) != "owner":
            raise HTTPException(403, "发起授权的店主权限已失效")
    code.used_at = utc_now(db)
    return code
