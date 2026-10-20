from decimal import Decimal

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
    code: str | None = None
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=40)
    address: str = Field(default="", max_length=300)


class MiniOrderLineIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=999)


class MiniOrderIn(BaseModel):
    items: list[MiniOrderLineIn] = Field(min_length=1, max_length=50)
    address: str = Field(min_length=1, max_length=300)
    note: str = Field(default="", max_length=300)
