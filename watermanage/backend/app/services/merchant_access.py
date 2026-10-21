from datetime import timedelta
import secrets

from fastapi import HTTPException
from sqlalchemy import select

from ..models import AuthSession, Customer, MerchantCode, MerchantControl, MerchantMember
from ..settings import settings
from .auth import MANAGER_ROLES, ROLE_LABELS, current_identity, digest, role_for
from .audit import write_log
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
    if kind == "invite":
        raise HTTPException(410, "请在电脑后台的客户管理中直接授权")
    if kind == "bootstrap":
        if has_owner(db):
            raise HTTPException(409, "已有店主，不能再次初始化")
    elif not creator or role_for(db, creator) not in MANAGER_ROLES:
        raise HTTPException(403, "此操作仅店主或副店长可用")
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
        if not creator or not current_identity(creator) or role_for(db, creator) not in MANAGER_ROLES:
            raise HTTPException(403, "发起登录的商家权限已失效")
    code.used_at = utc_now(db)
    return code


def eligible_customer(customer):
    return customer.source == "mini" and bool(customer.wechat_openid) and current_identity(customer)


def set_member_role(db, actor, customer_id, role):
    """Serialize role edits and recheck both accounts after acquiring the lock."""
    lock_access(db)
    actor_role = role_for(db, actor)
    if not current_identity(actor) or actor_role not in MANAGER_ROLES:
        raise HTTPException(403, "此操作仅店主或副店长可用")
    target = db.get(Customer, customer_id)
    if not target:
        raise HTTPException(404, "客户不存在")
    if not eligible_customer(target):
        raise HTTPException(400, "只能授权当前小程序中已绑定的客户账号")
    previous = role_for(db, target)
    if target.id == actor.id or previous == "owner":
        raise HTTPException(403, "不能调整自己或店主的权限")
    if role not in {"staff", "deputy", "customer"}:
        raise HTTPException(400, "请选择店员、副店长或普通客户")
    if actor_role == "deputy" and (role == "deputy" or previous == "deputy"):
        raise HTTPException(403, "副店长只能授权或停用店员，不能调整副店长")
    if previous == role:
        return target
    member = db.get(MerchantMember, target.id)
    if member:
        if role != "customer":
            member.role = role
        member.active, member.granted_by = role != "customer", actor.id
        member.updated_at = utc_now(db)
    elif role != "customer":
        db.add(MerchantMember(customer_id=target.id, role=role, active=True, granted_by=actor.id))
    # Keep the mini session so its profile can refresh, but revoke old PC sessions/codes.
    now = utc_now(db)
    for session in db.scalars(select(AuthSession).where(AuthSession.customer_id == target.id,
                              AuthSession.kind == "admin", AuthSession.revoked_at.is_(None))).all():
        session.revoked_at = now
    for code in db.scalars(select(MerchantCode).where(MerchantCode.created_by == target.id,
                           MerchantCode.used_at.is_(None))).all():
        code.used_at = now
    write_log(db, "merchant_revoke" if role == "customer" else "merchant_grant", None,
              actor.name, ROLE_LABELS[previous], ROLE_LABELS[role],
              f"{ROLE_LABELS[actor_role]} #{actor.id} 调整客户 #{target.id} {target.name} 的商家权限")
    db.flush()
    return target
