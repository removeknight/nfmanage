from datetime import datetime
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
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
    phone: Mapped[str] = mapped_column(String(40), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    wechat_openid: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True, index=True)
    mini_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)  # purchase, sale, adjustment
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
    customer: Mapped[Customer] = relationship()
    product: Mapped[Product] = relationship()

class MiniOrder(Base):
    __tablename__ = "mini_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="待商家确认", index=True)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
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
