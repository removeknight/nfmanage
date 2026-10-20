from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class ProductIn(BaseModel):
    name: str
    brand: str
    category: str
    capacity: str
    package_type: str = "瓶"
    color: str = "#2e88d1"
    stock: int = Field(default=0, ge=0)
    warning_stock: int = Field(default=20, ge=0)
    average_cost: Decimal = Field(default=Decimal("0"), ge=0)
    sell_price: Decimal = Field(default=Decimal("0"), ge=0)
    operator: str = "管理员"


class CustomerIn(BaseModel):
    name: str
    kind: str = "个人"
    phone: str = ""
    address: str = ""
    note: str = ""


class StockIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    note: str = ""
    operator: str = "管理员"


class SaleIn(StockIn):
    customer_id: int
    create_delivery: bool = True
    address: str = ""


class PriceIn(BaseModel):
    product_id: int
    unit_price: Decimal = Field(ge=0)
    note: str = ""
    operator: str = "管理员"


class StatusIn(BaseModel):
    status: str
    operator: str = "管理员"


class MiniBindIn(BaseModel):
    model_config = {"str_strip_whitespace": True}
    code: str | None = None
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=40)
    address: str = Field(default="", max_length=300)


class MiniOrderLineIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=999)


class MiniOrderIn(BaseModel):
    model_config = {"str_strip_whitespace": True}
    items: list[MiniOrderLineIn] = Field(min_length=1, max_length=50)
    address: str = Field(default="", max_length=300)
    fulfillment: Literal["pickup", "delivery"] = "pickup"
    note: str = Field(default="", max_length=300)
    coupon_id: int | None = Field(default=None, gt=0)


class MiniProfileIn(BaseModel):
    model_config = {"str_strip_whitespace": True}
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=40)
    address: str = Field(default="", max_length=300)


class CouponSettingIn(BaseModel):
    welcome_amount: Decimal = Field(ge=0, le=100000, decimal_places=2)
    welcome_validity_days: int = Field(default=7, ge=1, le=365)
    welcome_usage_type: Literal["unrestricted", "large_bucket"] = "unrestricted"


class CouponGrantIn(BaseModel):
    model_config = {"str_strip_whitespace": True}
    title: str = Field(default="水站优惠券", min_length=1, max_length=80)
    amount: Decimal = Field(gt=0, le=100000, decimal_places=2)
    usage_type: Literal["unrestricted", "large_bucket"] = "unrestricted"
    validity_days: int = Field(default=7, ge=1, le=365)
    all_users: bool = False
    customer_ids: list[int] = Field(default_factory=list, max_length=10000)
    request_key: str = Field(min_length=8, max_length=64)


class PickupCodeIn(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
