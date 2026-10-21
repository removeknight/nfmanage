from datetime import datetime
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    brand: Mapped[str] = mapped_column(String(80), index=True)
    category: Mapped[str] = mapped_column(String(40), default="瓶装水")
    capacity: Mapped[str] = mapped_column(String(40), default="550ml")
    package_type: Mapped[str] = mapped_column(String(40), default="瓶")
    color: Mapped[str] = mapped_column(String(20), default="#2e88d1")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    reserved_stock: Mapped[int] = mapped_column(Integer, default=0)
    warning_stock: Mapped[int] = mapped_column(Integer, default=20)
    average_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), default=0)
    sell_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="个人")
    source: Mapped[str] = mapped_column(String(20), default="offline", index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    wechat_openid: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    auth_provider: Mapped[str] = mapped_column(String(12), default="")
    auth_app_id: Mapped[str] = mapped_column(String(80), default="")
    __table_args__ = (UniqueConstraint("source", "auth_app_id", "wechat_openid", name="uq_customer_app_openid"),)
    mini_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    welcome_coupon_granted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)  # purchase, sale, adjustment
    source: Mapped[str] = mapped_column(String(20), default="offline", index=True)
    mini_order_id: Mapped[int | None] = mapped_column(ForeignKey("mini_orders.id"), nullable=True, index=True)
    delivery_id: Mapped[int | None] = mapped_column(ForeignKey("deliveries.id"), nullable=True, index=True, unique=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    note: Mapped[str] = mapped_column(String(300), default="")
    operator: Mapped[str] = mapped_column(String(80), default="管理员")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    product: Mapped[Product] = relationship()
    customer: Mapped[Customer | None] = relationship()

class OperationLog(Base):
    __tablename__ = "operation_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    action: Mapped[str] = mapped_column(String(40), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)
    product_snapshot: Mapped[str] = mapped_column(String(300), default="")
    operator: Mapped[str] = mapped_column(String(80), default="管理员")
    before_value: Mapped[str] = mapped_column(Text, default="")
    after_value: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

class Delivery(Base):
    __tablename__ = "deliveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="待配送", index=True)
    address: Mapped[str] = mapped_column(String(300), default="")
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    mini_order_id: Mapped[int | None] = mapped_column(ForeignKey("mini_orders.id"), nullable=True, index=True)
    customer: Mapped[Customer] = relationship()
    product: Mapped[Product] = relationship()

class MiniOrder(Base):
    __tablename__ = "mini_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="待提货", index=True)
    source: Mapped[str] = mapped_column(String(20), default="mini", index=True)
    fulfillment: Mapped[str] = mapped_column(String(20), default="pickup")
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    original_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    coupon_id: Mapped[int | None] = mapped_column(ForeignKey("customer_coupons.id"), nullable=True)
    coupon_usage_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hidden_by_customer: Mapped[bool] = mapped_column(Boolean, default=False)
    pickup_code: Mapped[str] = mapped_column(String(6), unique=True, index=True)
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    address: Mapped[str] = mapped_column(String(300), default="")
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    customer: Mapped[Customer] = relationship()
    items: Mapped[list["MiniOrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")

class MiniOrderItem(Base):
    __tablename__ = "mini_order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("mini_orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(120))
    brand: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(40))
    capacity: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    order: Mapped[MiniOrder] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()


class CouponSetting(Base):
    __tablename__ = "coupon_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    welcome_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=5)
    welcome_validity_days: Mapped[int] = mapped_column(Integer, default=7)
    welcome_usage_type: Mapped[str] = mapped_column(String(20), default="unrestricted")


class CustomerCoupon(Base):
    __tablename__ = "customer_coupons"
    __table_args__ = (UniqueConstraint("customer_id", "grant_key", name="uq_coupon_customer_grant"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    title: Mapped[str] = mapped_column(String(80))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    source: Mapped[str] = mapped_column(String(20), default="manual")
    usage_type: Mapped[str] = mapped_column(String(20), default="unrestricted")
    grant_key: Mapped[str] = mapped_column(String(64), index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    used_order_id: Mapped[int | None] = mapped_column(ForeignKey("mini_orders.id"), nullable=True, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    customer: Mapped[Customer] = relationship()


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12), default="mini")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    customer: Mapped[Customer] = relationship()


class MerchantMember(Base):
    __tablename__ = "merchant_members"
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(12))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    granted_by: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    customer: Mapped[Customer] = relationship(foreign_keys=[customer_id])


class MerchantCode(Base):
    __tablename__ = "merchant_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(12))  # bootstrap, invite, web
    created_by: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    used_by: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class MerchantControl(Base):
    __tablename__ = "merchant_control"
    id: Mapped[int] = mapped_column(primary_key=True)
