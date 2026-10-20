from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
import json
import secrets
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from ..database import get_db
from ..models import Customer, CustomerCoupon, Delivery, MiniOrder, MiniOrderItem, Product
from ..schemas import CouponGrantIn, CouponSettingIn, MiniBindIn, MiniOrderIn, MiniProfileIn, PickupCodeIn
from ..services.audit import write_log
from ..services.coupons import coupon_info, coupon_settings, grant_welcome, iso_utc, utc_now
from ..services.mini_orders import ACTIVE_ORDER_STATUSES, cancel_sale, record_sale
from ..settings import settings

router = APIRouter(prefix="/api/mini", tags=["小程序与商家"])
CENT = Decimal("0.01")


def _wechat_openid(code):
    if not settings.wechat_app_id or not settings.wechat_app_secret:
        raise HTTPException(503, "服务端尚未配置微信小程序凭据")
    params = urlencode({"appid": settings.wechat_app_id, "secret": settings.wechat_app_secret,
                        "js_code": code, "grant_type": "authorization_code"})
    try:
        with urlopen(f"https://api.weixin.qq.com/sns/jscode2session?{params}", timeout=8) as response:
            data = json.loads(response.read())
    except Exception:
        raise HTTPException(502, "微信登录暂时不可用，请稍后重试")
    if not data.get("openid"):
        raise HTTPException(401, "微信登录凭据无效，请重新登录")
    return data["openid"]


def _customer(authorization, db):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "请先绑定账号")
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    row = db.scalar(select(Customer).where(Customer.mini_token_hash == digest, Customer.source == "mini"))
    if not row:
        raise HTTPException(401, "登录已过期，请重新绑定")
    return row


def _profile(customer):
    return {"id": customer.id, "name": customer.name, "phone": customer.phone, "address": customer.address,
            "source": customer.source, "source_label": "小程序" if customer.source == "mini" else "线下电脑录入"}


def _order_info(order):
    return {"id": order.id, "order_no": order.order_no, "status": order.status,
            "contact_name": order.customer.name, "contact_phone": order.customer.phone,
            "fulfillment": order.fulfillment, "fulfillment_label": "送货上门" if order.fulfillment == "delivery" else "到店提货",
            "source": order.source, "source_label": "小程序" if order.source == "mini" else "线下电脑录入",
            "total": float(order.total), "original_total": float(order.original_total),
            "discount_amount": float(order.discount_amount), "coupon_id": order.coupon_id,
            "pickup_code": order.pickup_code, "hidden_by_customer": order.hidden_by_customer,
            "address": order.address, "note": order.note, "created_at": iso_utc(order.created_at),
            "confirmed_at": iso_utc(order.confirmed_at), "redeemed_at": iso_utc(order.redeemed_at),
            "canceled_at": iso_utc(order.canceled_at), "coupon_usage_type": order.coupon_usage_type,
            "items": [{"product_id": item.product_id, "name": item.product_name, "brand": item.brand,
                       "category": item.category, "capacity": item.capacity, "quantity": item.quantity,
                       "unit_price": float(item.unit_price), "subtotal": float(item.subtotal)} for item in order.items]}


def _locked_order(db, order_id, customer_id=None):
    query = select(MiniOrder).where(MiniOrder.id == order_id).options(selectinload(MiniOrder.items)).with_for_update()
    if customer_id is not None:
        query = query.where(MiniOrder.customer_id == customer_id)
    order = db.scalar(query)
    if order is None:
        raise HTTPException(404, "订单不存在")
    return order


@router.post("/bind")
def bind(data: MiniBindIn, db: Session = Depends(get_db)):
    mode = settings.mini_auth_mode.strip().lower()
    if mode == "mock":
        if not data.phone.strip():
            raise HTTPException(400, "测试绑定需要联系电话")
        openid = "test_" + hashlib.sha256(data.phone.strip().encode()).hexdigest()
    elif mode == "wechat":
        if not data.code:
            raise HTTPException(400, "缺少微信登录凭据")
        openid = _wechat_openid(data.code)
    else:
        raise HTTPException(503, "小程序登录模式配置无效")
    customer = db.scalar(select(Customer).where(Customer.wechat_openid == openid, Customer.source == "mini").with_for_update())
    if customer is None:
        customer = Customer(name=data.name.strip(), phone=data.phone.strip(), address=data.address.strip(),
                            kind="个人", source="mini", wechat_openid=openid)
        db.add(customer)
        db.flush()
    else:
        customer.name, customer.phone, customer.address = data.name.strip(), data.phone.strip(), data.address.strip()
    grant_welcome(db, customer)
    token = secrets.token_urlsafe(32)
    customer.mini_token_hash = hashlib.sha256(token.encode()).hexdigest()
    db.commit()
    return {"token": token, "auth_mode": mode, "customer": _profile(customer)}


@router.get("/me")
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    return _profile(_customer(authorization, db))


@router.patch("/me")
def update_profile(data: MiniProfileIn, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    if not data.name.strip() or not data.phone.strip():
        raise HTTPException(400, "请填写称呼和联系电话")
    customer.name, customer.phone, customer.address = data.name.strip(), data.phone.strip(), data.address.strip()
    db.commit()
    return _profile(customer)


@router.get("/coupons")
def my_coupons(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    now = utc_now(db)
    coupons = db.scalars(select(CustomerCoupon).where(CustomerCoupon.customer_id == customer.id)
                         .order_by(CustomerCoupon.issued_at.desc(), CustomerCoupon.id.desc())).all()
    return [coupon_info(coupon, now) for coupon in coupons]


@router.get("/products")
def catalog(db: Session = Depends(get_db)):
    products = db.scalars(select(Product).where(Product.active.is_(True)).order_by(Product.category, Product.brand, Product.name)).all()
    return [{"id": p.id, "name": p.name, "brand": p.brand, "category": p.category, "capacity": p.capacity,
             "package_type": p.package_type, "color": p.color, "image_url": p.image_url,
             "sell_price": float(p.sell_price), "stock": max(0, p.stock - p.reserved_stock),
             "available": p.stock > p.reserved_stock} for p in products]


@router.post("/orders")
def place_order(data: MiniOrderIn, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    # Persist fulfillment for future delivery support; only pickup is open now.
    if data.fulfillment != "pickup":
        raise HTTPException(400, "小程序暂仅支持到店提货，送货上门尚未开放")
    if data.fulfillment == "delivery" and not data.address.strip():
        raise HTTPException(400, "选择送货上门时请填写配送地址")
    quantities = {}
    for line in data.items:
        quantities[line.product_id] = quantities.get(line.product_id, 0) + line.quantity
    products = db.scalars(select(Product).where(Product.id.in_(sorted(quantities))).order_by(Product.id).with_for_update()).all()
    if len(products) != len(quantities):
        raise HTTPException(400, "订单中包含已不存在的商品")
    total, lines = Decimal("0.00"), []
    for product in products:
        quantity = quantities[product.id]
        if not product.active:
            raise HTTPException(400, f"{product.name} 已下架")
        available = product.stock - product.reserved_stock
        if quantity > available:
            raise HTTPException(409, f"{product.name} 库存不足，当前可售 {max(available, 0)} 件")
        subtotal = (product.sell_price * quantity).quantize(CENT)
        total += subtotal
        lines.append((product, quantity, subtotal))
    coupon, discount = None, Decimal("0.00")
    if data.coupon_id:
        coupon = db.scalar(select(CustomerCoupon).where(CustomerCoupon.id == data.coupon_id,
                            CustomerCoupon.customer_id == customer.id).with_for_update())
        if coupon is None or coupon.used_order_id or coupon.expires_at <= utc_now(db):
            raise HTTPException(409, "优惠券不可用，请重新选择")
        eligible = sum((subtotal for product, quantity, subtotal in lines
                        if coupon.usage_type != "large_bucket" or product.category == "大桶水"), Decimal(0))
        if coupon.usage_type == "large_bucket" and eligible <= 0:
            raise HTTPException(400, "大桶水优惠券只能抵扣商品品类为“大桶水”的商品")
        discount = min(coupon.amount, eligible)
    order = None
    for _ in range(12):
        try:
            with db.begin_nested():
                candidate = MiniOrder(order_no=f"NF{datetime.now():%Y%m%d%H%M%S}{secrets.token_hex(3).upper()}",
                    customer_id=customer.id, source="mini", fulfillment=data.fulfillment,
                    status="待配送" if data.fulfillment == "delivery" else "待提货", original_total=total, discount_amount=discount,
                    total=total-discount, address=data.address.strip(), note=data.note.strip(),
                    coupon_id=coupon.id if coupon else None, coupon_usage_type=coupon.usage_type if coupon else None,
                    confirmed_at=utc_now(db), pickup_code=str(secrets.randbelow(900000)+100000))
                db.add(candidate)
                db.flush()
            order = candidate
            break
        except IntegrityError as error:
            if "pickup_code" not in str(error.orig):
                raise
    if order is None:
        raise HTTPException(503, "提货码生成繁忙，请重试")
    if coupon:
        coupon.used_order_id, coupon.used_at = order.id, utc_now(db)
    if data.address.strip():
        customer.address = data.address.strip()
    for product, quantity, subtotal in lines:
        order.items.append(MiniOrderItem(product_id=product.id, product_name=product.name, brand=product.brand,
                          category=product.category, capacity=product.capacity, quantity=quantity,
                          unit_price=product.sell_price, subtotal=subtotal))
    record_sale(db, order)
    db.commit()
    db.refresh(order)
    return _order_info(order)


@router.get("/orders")
def my_orders(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    orders = db.scalars(select(MiniOrder).where(MiniOrder.customer_id == customer.id,
                        MiniOrder.hidden_by_customer.is_(False)).options(selectinload(MiniOrder.items), selectinload(MiniOrder.customer))
                        .order_by(MiniOrder.created_at.desc()).limit(200)).all()
    return [_order_info(order) for order in orders]


@router.delete("/orders/{order_id}")
def hide_order(order_id: int, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    order = _locked_order(db, order_id, customer.id)
    order.hidden_by_customer = True
    db.commit()
    return {"hidden": True}


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    order = _locked_order(db, order_id, customer.id)
    if order.status == "配送中":
        raise HTTPException(409, "订单正在配送，请联系商家处理取消")
    cancel_sale(db, order, customer.name)
    db.commit()
    return {"status": order.status}


# Use the same administrative access boundary as product/customer/delivery APIs.
@router.get("/merchant/orders")
def merchant_orders(db: Session = Depends(get_db), phone: str | None = None, status: str | None = None):
    query = select(MiniOrder)
    if phone and phone.strip():
        if len(phone.strip()) > 40:
            raise HTTPException(400, "手机号搜索内容不能超过 40 个字符")
        query = query.join(Customer, Customer.id == MiniOrder.customer_id).where(
            Customer.phone.contains(phone.strip(), autoescape=True))
    if status:
        query = query.where(MiniOrder.status == status)
    orders = db.scalars(query.options(selectinload(MiniOrder.items), selectinload(MiniOrder.customer))
                        .order_by(MiniOrder.created_at.desc(), MiniOrder.id.desc()).limit(500)).all()
    return [{**_order_info(order), "customer": _profile(order.customer)} for order in orders]


@router.post("/merchant/orders/{order_id}/cancel")
def merchant_cancel_order(order_id: int, db: Session = Depends(get_db)):
    order = _locked_order(db, order_id)
    cancel_sale(db, order, "管理员")
    db.commit()
    return {"status": order.status}

@router.get("/merchant/pickup-by-phone")
def pickup_by_phone(phone_suffix: str, db: Session = Depends(get_db)):
    if len(phone_suffix) != 4 or any(char not in "0123456789" for char in phone_suffix):
        raise HTTPException(400, "请输入手机尾号后四位数字")
    orders = db.scalars(select(MiniOrder).join(Customer, Customer.id == MiniOrder.customer_id)
                        .where(MiniOrder.status.in_(ACTIVE_ORDER_STATUSES), Customer.source == "mini",
                               Customer.phone.endswith(phone_suffix, autoescape=True))
                        .options(selectinload(MiniOrder.items), selectinload(MiniOrder.customer))
                        .order_by(MiniOrder.created_at.desc(), MiniOrder.id.desc())).all()
    return [{**_order_info(order), "customer": _profile(order.customer)} for order in orders]


@router.get("/merchant/pickup/{code}")
def lookup_pickup(code: str, db: Session = Depends(get_db)):
    order = db.scalar(select(MiniOrder).where(MiniOrder.pickup_code == code)
                      .options(selectinload(MiniOrder.items), selectinload(MiniOrder.customer)))
    if order is None:
        raise HTTPException(404, "提货码不存在")
    return {**_order_info(order), "customer": _profile(order.customer)}


@router.post("/merchant/redeem")
def redeem(data: PickupCodeIn, db: Session = Depends(get_db)):
    order = db.scalar(select(MiniOrder).where(MiniOrder.pickup_code == data.code)
                      .options(selectinload(MiniOrder.items)).with_for_update())
    if order is None:
        raise HTTPException(404, "提货码不存在")
    if order.status not in ACTIVE_ORDER_STATUSES:
        raise HTTPException(409, "订单已完成、核销、取消或拒绝，不能重复核销")
    now = utc_now(db)
    previous = order.status
    order.status, order.redeemed_at = "已核销", now
    deliveries = db.scalars(select(Delivery).where(Delivery.mini_order_id == order.id).with_for_update()).all()
    for delivery in deliveries:
        delivery.status, delivery.completed_at = "已完成", now
    write_log(db, "mini_order_redeem", None, "管理员", previous, "已核销", f"商城订单 {order.order_no} 完成提货核销")
    db.commit()
    return _order_info(order)


@router.get("/merchant/customers")
def mini_customers(db: Session = Depends(get_db)):
    rows = db.scalars(select(Customer).where(Customer.source == "mini", Customer.wechat_openid.is_not(None)).order_by(Customer.id.desc())).all()
    return [_profile(customer) for customer in rows]


@router.get("/merchant/coupon-settings")
def get_coupon_settings(db: Session = Depends(get_db)):
    row = coupon_settings(db)
    return {"welcome_amount": float(row.welcome_amount), "welcome_validity_days": row.welcome_validity_days, "welcome_usage_type": row.welcome_usage_type}


@router.put("/merchant/coupon-settings")
def set_coupon_settings(data: CouponSettingIn, db: Session = Depends(get_db)):
    row = coupon_settings(db, lock=True)
    before = f"新用户券 ¥{row.welcome_amount}，有效 {row.welcome_validity_days} 天"
    row.welcome_amount, row.welcome_validity_days = data.welcome_amount, data.welcome_validity_days
    row.welcome_usage_type = data.welcome_usage_type
    write_log(db, "coupon_settings", None, "管理员", before,
              f"新用户券 ¥{row.welcome_amount}，有效 {row.welcome_validity_days} 天", "更新新用户优惠券配置")
    db.commit()
    return {"welcome_amount": float(row.welcome_amount), "welcome_validity_days": row.welcome_validity_days, "welcome_usage_type": row.welcome_usage_type}


@router.post("/merchant/coupons")
def issue_coupons(data: CouponGrantIn, db: Session = Depends(get_db)):
    coupon_settings(db, lock=True)
    key = "manual:" + hashlib.sha256(data.request_key.encode()).hexdigest()[:48]
    existing = db.scalars(select(CustomerCoupon.id).where(CustomerCoupon.grant_key == key)).all()
    if existing:
        return {"issued": len(existing), "duplicate_request": True}
    query, ids = select(Customer).where(Customer.source == "mini", Customer.wechat_openid.is_not(None)), set(data.customer_ids)
    if not data.all_users:
        if not ids:
            raise HTTPException(400, "请选择需要发券的用户")
        query = query.where(Customer.id.in_(ids))
    customers = db.scalars(query).all()
    if not data.all_users and len(customers) != len(ids):
        raise HTTPException(400, "部分用户尚未绑定小程序，请刷新用户列表")
    now = utc_now(db)
    for customer in customers:
        db.add(CustomerCoupon(customer_id=customer.id, title=data.title.strip(), amount=data.amount,
             source="manual", usage_type=data.usage_type, grant_key=key, issued_at=now, expires_at=now+timedelta(days=data.validity_days)))
    write_log(db, "coupon_grant", None, "管理员", "", f"已发放 {len(customers)} 张",
              f"{data.title}：每张 ¥{data.amount}，有效 {data.validity_days} 天")
    db.commit()
    return {"issued": len(customers), "duplicate_request": False}


@router.get("/merchant/coupons")
def issued_coupons(db: Session = Depends(get_db)):
    now = utc_now(db)
    rows = db.scalars(select(CustomerCoupon).options(selectinload(CustomerCoupon.customer))
                      .order_by(CustomerCoupon.id.desc()).limit(500)).all()
    return [{**coupon_info(coupon, now), "customer": _profile(coupon.customer)} for coupon in rows]
