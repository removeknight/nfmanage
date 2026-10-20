from datetime import timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import func, select
from ..models import CouponSetting, CustomerCoupon


def utc_now(db):
    value = db.scalar(select(func.now()))
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def iso_utc(value):
    return value.replace(tzinfo=timezone.utc) if value and not value.tzinfo else value


def coupon_settings(db, lock=False):
    query = select(CouponSetting).where(CouponSetting.id == 1)
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise HTTPException(503, "优惠券配置尚未初始化，请执行数据库升级")
    return row


def grant_welcome(db, customer):
    if customer.welcome_coupon_granted:
        return
    customer.welcome_coupon_granted = True
    existing = db.scalar(select(CustomerCoupon.id).where(CustomerCoupon.customer_id == customer.id,
                                                        CustomerCoupon.grant_key == "welcome"))
    config = coupon_settings(db)
    if not existing and config.welcome_amount > 0:
        now = utc_now(db)
        db.add(CustomerCoupon(customer_id=customer.id, title="新用户优惠券", amount=config.welcome_amount,
                              source="welcome", usage_type=config.welcome_usage_type, grant_key="welcome", issued_at=now,
                              expires_at=now + timedelta(days=config.welcome_validity_days)))


def coupon_info(coupon, now):
    status = "已使用" if coupon.used_order_id else "已过期" if coupon.expires_at <= now else "可使用"
    return {"id": coupon.id, "title": coupon.title, "amount": float(coupon.amount), "source": coupon.source,
            "usage_type": coupon.usage_type, "usage_label": "大桶水专用" if coupon.usage_type == "large_bucket" else "无门槛",
            "issued_at": iso_utc(coupon.issued_at), "expires_at": iso_utc(coupon.expires_at),
            "status": status, "used_order_id": coupon.used_order_id}


def release_coupon(db, order):
    if order.coupon_id:
        coupon = db.scalar(select(CustomerCoupon).where(CustomerCoupon.id == order.coupon_id).with_for_update())
        if coupon and coupon.used_order_id == order.id:
            coupon.used_order_id, coupon.used_at = None, None
