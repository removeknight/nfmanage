from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Customer, MerchantMember, MiniOrder, Product, Transaction
from ..schemas import AccessCodeIn, CouponGrantIn, PickupCodeIn
from ..services.audit import write_log
from ..services.auth import MANAGER_ROLES, ROLE_LABELS, get_session, identity_profile, issue_session, require_merchant, require_manager, role_for
from ..services.coupons import iso_utc, utc_now
from ..services.merchant_access import consume_code, eligible_customer, new_code, set_member_role
from ..services.reporting_time import SHOP_TIMEZONE, start_of_day_utc
from . import mini

access_router = APIRouter(prefix="/api/access", tags=["商家登录授权"])
router = APIRouter(prefix="/api/merchant", tags=["小程序商家"], dependencies=[Depends(require_merchant)])


@access_router.post("/claim")
def claim(data: AccessCodeIn, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    raise HTTPException(410, "商家授权码入口已关闭，请由店主在电脑后台的客户管理中授权")


@access_router.post("/web-login")
def web_login(data: AccessCodeIn, db: Session = Depends(get_db)):
    code = consume_code(db, data.code, {"web"})
    customer = db.get(Customer, code.created_by)
    # Also enforce the current authentication realm (mock / real WeChat).
    from ..settings import settings
    mode = settings.mini_auth_mode.strip().lower()
    if customer.auth_provider != mode or (mode == "wechat" and customer.auth_app_id != settings.wechat_app_id):
        raise HTTPException(403, "账号登录环境已切换，请重新登录小程序生成登录码")
    code.used_by = customer.id
    token = issue_session(db, customer, "admin")
    write_log(db, "merchant_login", None, customer.name, "", "登录成功", "通过一次性电脑登录码登录")
    db.commit()
    return {"token": token, "customer": identity_profile(db, customer)}


@access_router.get("/me")
def web_me(customer: Customer = Depends(require_manager), db: Session = Depends(get_db)):
    return identity_profile(db, customer)


@access_router.post("/logout")
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    session = get_session(authorization, db)
    session.revoked_at = utc_now(db)
    db.commit()
    return {"ok": True}


@router.get("/summary")
def summary(customer: Customer = Depends(require_merchant), db: Session = Depends(get_db)):
    start = start_of_day_utc(datetime.now(SHOP_TIMEZONE).date())
    pending = db.scalar(select(func.count()).select_from(MiniOrder).where(MiniOrder.status == "待提货"))
    today = db.scalar(select(func.count()).select_from(MiniOrder).where(MiniOrder.created_at >= start, MiniOrder.canceled_at.is_(None)))
    redeemed = db.scalar(select(func.count()).select_from(MiniOrder).where(MiniOrder.redeemed_at >= start))
    low = db.scalar(select(func.count()).select_from(Product).where(Product.active.is_(True), Product.stock - Product.reserved_stock <= Product.warning_stock))
    result = {"customer": identity_profile(db, customer), "pending": pending, "today_orders": today, "today_redeemed": redeemed, "low_stock": low}
    if role_for(db, customer) in MANAGER_ROLES:
        total = db.scalar(select(func.sum(Transaction.total)).where(
            Transaction.kind == "sale", Transaction.voided_at.is_(None), Transaction.created_at >= start))
        result["today_sales"] = float(total or 0)
    return result


@router.get("/orders")
def orders(phone: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    return mini.merchant_orders(db=db, phone=phone, status=status)


@router.get("/orders/{order_id}")
def order_detail(order_id: int, db: Session = Depends(get_db)):
    order = db.scalar(select(MiniOrder).where(MiniOrder.id == order_id).options(selectinload(MiniOrder.items), selectinload(MiniOrder.customer)))
    if not order:
        raise HTTPException(404, "订单不存在")
    return mini._order_info(order)


@router.get("/lookup")
def lookup(value: str = Query(min_length=4, max_length=6), db: Session = Depends(get_db)):
    if len(value) == 4:
        return mini.pickup_by_phone(value, db)
    if len(value) == 6 and value.isascii() and value.isdigit():
        return [mini.lookup_pickup(value, db)]
    raise HTTPException(400, "请输入 6 位核销码或手机尾号后 4 位")


@router.post("/redeem")
def redeem(data: PickupCodeIn, customer: Customer = Depends(require_merchant), db: Session = Depends(get_db)):
    return mini.redeem(data, db, customer)


@router.post("/orders/{order_id}/cancel")
def cancel(order_id: int, customer: Customer = Depends(require_manager), db: Session = Depends(get_db)):
    return mini.merchant_cancel_order(order_id, db, customer)


@router.get("/stock")
def stock(db: Session = Depends(get_db)):
    rows = db.scalars(select(Product).where(Product.active.is_(True)).order_by(Product.category, Product.brand, Product.name)).all()
    return [{"id": p.id, "name": p.name, "brand": p.brand, "category": p.category, "capacity": p.capacity,
             "unit": p.package_type, "stock": max(0, p.stock-p.reserved_stock), "warning_stock": p.warning_stock,
             "sell_price": float(p.sell_price)} for p in rows]


@router.get("/customers", dependencies=[Depends(require_manager)])
def customers(q: str = Query(default="", max_length=40), db: Session = Depends(get_db)):
    query = select(Customer).where(Customer.source == "mini")
    if q.strip():
        query = query.where(Customer.phone.contains(q.strip(), autoescape=True) | Customer.name.contains(q.strip(), autoescape=True))
    rows = db.scalars(query.order_by(Customer.id.desc()).limit(100)).all()
    return [{"id": c.id, "name": c.name, "phone": c.phone} for c in rows]


@router.post("/coupons")
def coupons(data: CouponGrantIn, customer: Customer = Depends(require_manager), db: Session = Depends(get_db)):
    if data.all_users or len(set(data.customer_ids)) != 1:
        raise HTTPException(400, "小程序商家端每次请选择一位客户发券，批量发放请使用电脑后台")
    return mini.issue_coupons(data, db, customer)


@router.get("/members", dependencies=[Depends(require_manager)])
def members(db: Session = Depends(get_db)):
    rows = db.scalars(select(MerchantMember).options(selectinload(MerchantMember.customer)).order_by(MerchantMember.created_at)).all()
    return [{"customer_id": m.customer_id, "name": m.customer.name, "phone": m.customer.phone,
             "role": m.role, "role_label": ROLE_LABELS.get(m.role, "普通客户"),
             "active": m.active, "created_at": iso_utc(m.created_at)} for m in rows if eligible_customer(m.customer)]


@router.post("/invites")
def invite(customer: Customer = Depends(require_manager)):
    raise HTTPException(410, "请在电脑后台的客户管理中直接授权")


@router.post("/web-code")
def web_code(customer: Customer = Depends(require_manager), db: Session = Depends(get_db)):
    result = new_code(db, "web", customer)
    db.commit()
    return result


@router.delete("/members/{customer_id}")
def revoke(customer_id: int, customer: Customer = Depends(require_manager), db: Session = Depends(get_db)):
    set_member_role(db, customer, customer_id, "customer")
    db.commit()
    return {"ok": True}
