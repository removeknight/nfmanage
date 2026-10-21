from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .database import SessionLocal
from .models import Customer, Product
from .routers import all_routers, health_router
from .settings import settings
from .services.auth import require_owner


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        if not db.scalar(select(Product.id).limit(1)):
            db.add_all(
                [
                    Product(name="饮用天然水", brand="农夫山泉", category="瓶装水", capacity="550ml", package_type="瓶", color="#e9544d", stock=186, warning_stock=40, average_cost=1.05, sell_price=2.0),
                    Product(name="饮用天然矿泉水", brand="百岁山", category="瓶装水", capacity="570ml", package_type="瓶", color="#327cc7", stock=72, warning_stock=30, average_cost=1.55, sell_price=3.0),
                    Product(name="纯净水", brand="康师傅", category="桶装水", capacity="18.9L", package_type="桶", color="#ee9b39", stock=28, warning_stock=10, average_cost=7.2, sell_price=12.0),
                    Product(name="可口可乐", brand="可口可乐", category="罐装饮料", capacity="330ml", package_type="罐", color="#d94b45", stock=12, warning_stock=24, average_cost=2.2, sell_price=4.0),
                    Product(name="纯净水", brand="农夫山泉", category="大桶水", capacity="4.5L", package_type="桶", color="#4ba783", stock=0, warning_stock=8, average_cost=4.1, sell_price=7.0),
                ]
            )
            db.add_all(
                [
                    Customer(name="星河科技有限公司", kind="企业", phone="13800001234", address="科技园 A 座"),
                    Customer(name="小满便利店", kind="小店", phone="13900005678", address="幸福路 18 号"),
                    Customer(name="林女士", kind="个人", phone="13700009876", address="阳光花园 3 栋"),
                ]
            )
            db.commit()
    yield


app = FastAPI(title="农丰水站 API", version="1.5.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in all_routers:
    public = router is health_router or router.prefix in {"/api/mini", "/api/access", "/api/merchant"}
    app.include_router(router, dependencies=[] if public else [Depends(require_owner)])
