from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
import hmac
import json
import secrets
import time
import base64
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Customer, Delivery, MiniOrder, MiniOrderItem, Product, Transaction
from ..schemas import MiniBindIn, MiniOrderIn
from ..services.audit import write_log
from ..settings import settings

router = APIRouter(prefix="/api/mini", tags=["微信小程序"])
ORDER_CONFIRMATION_TIMEOUT = timedelta(hours=2)


def _wechat_openid(code: str) -> str:
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


def _customer(authorization: str | None, db: Session) -> Customer:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "请先绑定微信账号")
    token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
    row = db.scalar(select(Customer).where(Customer.mini_token_hash == token_hash))
    if not row:
        raise HTTPException(401, "登录已过期，请重新绑定")
    return row


def _merchant_token() -> str:
    if not settings.merchant_api_key:
        raise HTTPException(503, "服务端尚未配置商家管理密钥")
    payload = str(int(time.time()) + 12 * 60 * 60)
    encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    signature = hmac.new(settings.merchant_api_key.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def _require_merchant(authorization: str | None):
    if not settings.merchant_api_key:
        raise HTTPException(503, "服务端尚未配置商家管理密钥")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "请先登录商家账号")
    try:
        encoded, signature = authorization[7:].split(".", 1)
        expected = hmac.new(settings.merchant_api_key.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        expires_at = int(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode())
    except (ValueError, TypeError):
        raise HTTPException(401, "商家登录凭据无效")
    if not hmac.compare_digest(signature, expected) or expires_at < int(time.time()):
        raise HTTPException(401, "商家登录已过期，请重新登录")


def _order_info(order: MiniOrder):
    return {
        "id": order.id, "order_no": order.order_no, "status": order.status,
        "total": float(order.total), "address": order.address, "note": order.note,
        "created_at": order.created_at, "confirmed_at": order.confirmed_at,
        "items": [{"product_id": item.product_id, "name": item.product_name,
                   "brand": item.brand, "category": item.category, "capacity": item.capacity,
                   "quantity": item.quantity, "unit_price": float(item.unit_price),
                   "subtotal": float(item.subtotal)} for item in order.items],
    }


def _expire_pending_orders(db: Session):
    cutoff = datetime.now() - ORDER_CONFIRMATION_TIMEOUT
    orders = db.scalars(select(MiniOrder).where(MiniOrder.status == "待商家确认", MiniOrder.created_at < cutoff)
                        .options(selectinload(MiniOrder.items)).with_for_update()).all()
    for order in orders:
        for item in order.items:
            product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
            if product:
                product.reserved_stock = max(0, product.reserved_stock - item.quantity)
                write_log(db, "order_expire", product, "系统", "订单预留", "已释放",
                          f"商城订单 {order.order_no} 超时，释放 {item.quantity} 件")
        order.status = "已超时"
    if orders:
        db.commit()


@router.post("/bind")
def bind(data: MiniBindIn, db: Session = Depends(get_db)):
    openid = _wechat_openid(data.code)
    customer = db.scalar(select(Customer).where(Customer.wechat_openid == openid).with_for_update())
    if customer is None:
        customer = Customer(name=data.name, phone=data.phone, address=data.address, kind="个人", wechat_openid=openid)
        db.add(customer)
    else:
        customer.name, customer.phone, customer.address = data.name, data.phone, data.address
    token = secrets.token_urlsafe(32)
    customer.mini_token_hash = hashlib.sha256(token.encode()).hexdigest()
    db.commit()
    return {"token": token, "customer": {"id": customer.id, "name": customer.name,
            "phone": customer.phone, "address": customer.address}}


@router.get("/me")
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    return {"id": customer.id, "name": customer.name, "phone": customer.phone, "address": customer.address}


@router.get("/products")
def catalog(db: Session = Depends(get_db)):
    _expire_pending_orders(db)
    products = db.scalars(select(Product).where(Product.active.is_(True)).order_by(Product.category, Product.brand, Product.name)).all()
    return [{"id": p.id, "name": p.name, "brand": p.brand, "category": p.category,
             "capacity": p.capacity, "package_type": p.package_type, "color": p.color,
             "image_url": p.image_url, "sell_price": float(p.sell_price),
             "stock": max(0, p.stock - p.reserved_stock), "available": p.stock > p.reserved_stock}
            for p in products]


@router.post("/orders")
def place_order(data: MiniOrderIn, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    _expire_pending_orders(db)
    quantities: dict[int, int] = {}
    for line in data.items:
        quantities[line.product_id] = quantities.get(line.product_id, 0) + line.quantity
    products = db.scalars(select(Product).where(Product.id.in_(sorted(quantities))).order_by(Product.id).with_for_update()).all()
    by_id = {p.id: p for p in products}
    if len(by_id) != len(quantities):
        raise HTTPException(400, "订单中包含已不存在的商品")
    lines = []
    total = Decimal("0.00")
    for product_id, quantity in quantities.items():
        product = by_id[product_id]
        available = product.stock - product.reserved_stock
        if not product.active:
            raise HTTPException(400, f"{product.name} 已下架")
        if available < quantity:
            raise HTTPException(409, f"{product.name} 库存不足，当前可售 {max(available, 0)} 件")
        subtotal = product.sell_price * quantity
        total += subtotal
        lines.append((product, quantity, subtotal))
    order = MiniOrder(order_no=f"WM{datetime.now():%Y%m%d%H%M%S}{secrets.token_hex(3).upper()}",
                      customer_id=customer.id, status="待商家确认", total=total,
                      address=data.address, note=data.note)
    db.add(order)
    customer.address = data.address
    db.flush()
    for product, quantity, subtotal in lines:
        before = product.reserved_stock
        product.reserved_stock += quantity
        order.items.append(MiniOrderItem(product_id=product.id, product_name=product.name,
            brand=product.brand, category=product.category, capacity=product.capacity,
            quantity=quantity, unit_price=product.sell_price, subtotal=subtotal))
        write_log(db, "order_reserve", product, customer.name, f"预留库存 {before}",
                  f"预留库存 {product.reserved_stock}", f"商城订单 {order.order_no} 下单预留 {quantity} 件")
    db.commit()
    db.refresh(order)
    return _order_info(order)


@router.get("/orders")
def my_orders(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    _expire_pending_orders(db)
    orders = db.scalars(select(MiniOrder).where(MiniOrder.customer_id == customer.id)
                        .options(selectinload(MiniOrder.items)).order_by(MiniOrder.created_at.desc()).limit(100)).all()
    return [_order_info(order) for order in orders]


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    customer = _customer(authorization, db)
    _expire_pending_orders(db)
    order = db.scalar(select(MiniOrder).where(MiniOrder.id == order_id, MiniOrder.customer_id == customer.id)
                      .options(selectinload(MiniOrder.items)).with_for_update())
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.status != "待商家确认":
        raise HTTPException(409, "当前订单状态不支持取消，请联系商家")
    for item in order.items:
        product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
        if product:
            product.reserved_stock = max(0, product.reserved_stock - item.quantity)
            write_log(db, "order_release", product, customer.name, "订单预留", "已释放",
                      f"商城订单 {order.order_no} 取消，释放 {item.quantity} 件")
    order.status = "已取消"
    db.commit()
    return {"status": order.status}


@router.post("/merchant/session")
def merchant_login(password: str = Body(..., embed=True)):
    if not settings.merchant_api_key:
        raise HTTPException(503, "服务端尚未配置商家管理密钥")
    if not hmac.compare_digest(password.encode(), settings.merchant_api_key.encode()):
        raise HTTPException(401, "商家密钥不正确")
    return {"token": _merchant_token(), "expires_in": 43200}


@router.get("/merchant/orders")
def merchant_orders(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    _require_merchant(authorization)
    _expire_pending_orders(db)
    orders = db.scalars(select(MiniOrder).options(selectinload(MiniOrder.items), selectinload(MiniOrder.customer))
                        .order_by(MiniOrder.created_at.desc()).limit(300)).all()
    return [{**_order_info(order), "customer": {"id": order.customer.id, "name": order.customer.name,
            "phone": order.customer.phone}} for order in orders]


@router.post("/merchant/orders/{order_id}/confirm")
def confirm_order(order_id: int, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    _require_merchant(authorization)
    _expire_pending_orders(db)
    order = db.scalar(select(MiniOrder).where(MiniOrder.id == order_id)
                      .options(selectinload(MiniOrder.items), selectinload(MiniOrder.customer)).with_for_update())
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.status != "待商家确认":
        raise HTTPException(409, "只有待确认订单可以确认")
    # Reservations guarantee that confirmed quantities remain available.
    for item in order.items:
        product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
        if not product or product.stock < item.quantity or product.reserved_stock < item.quantity:
            raise HTTPException(409, "订单预留库存异常，请先核对库存")
        before_stock, before_cost = product.stock, product.average_cost
        product.stock -= item.quantity
        product.reserved_stock -= item.quantity
        db.add(Transaction(kind="sale", product_id=product.id, customer_id=order.customer_id,
            quantity=item.quantity, unit_price=item.unit_price, cost_price=before_cost,
            total=item.subtotal, note=f"商城订单 {order.order_no}", operator="小程序订单"))
        db.add(Delivery(customer_id=order.customer_id, product_id=product.id, quantity=item.quantity,
            address=order.address, note=f"商城订单 {order.order_no} · {order.note}".strip(" ·")))
        write_log(db, "mini_order_confirm", product, "管理员", f"库存 {before_stock} 件；预留 {product.reserved_stock + item.quantity} 件",
            f"库存 {product.stock} 件；预留 {product.reserved_stock} 件",
            f"确认商城订单 {order.order_no}，出库 {item.quantity} 件")
    order.status = "已确认"
    order.confirmed_at = datetime.now()
    db.commit()
    return {"status": order.status, "order_no": order.order_no}


@router.post("/merchant/orders/{order_id}/reject")
def reject_order(order_id: int, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    _require_merchant(authorization)
    order = db.scalar(select(MiniOrder).where(MiniOrder.id == order_id)
                      .options(selectinload(MiniOrder.items)).with_for_update())
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.status != "待商家确认":
        raise HTTPException(409, "只有待确认订单可以拒绝")
    for item in order.items:
        product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
        if product:
            product.reserved_stock = max(0, product.reserved_stock - item.quantity)
            write_log(db, "order_reject", product, "管理员", "订单预留", "已释放",
                      f"商城订单 {order.order_no} 被拒绝，释放 {item.quantity} 件")
    order.status = "已拒绝"
    db.commit()
    return {"status": order.status, "order_no": order.order_no}
