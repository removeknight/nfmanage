from .customers import router as customers_router
from .dashboard import router as dashboard_router
from .deliveries import router as deliveries_router
from .health import router as health_router
from .logs import router as logs_router
from .mini import router as mini_router
from .merchant import router as merchant_router, access_router
from .products import router as products_router
from .media import router as media_router
from .transactions import router as transactions_router

all_routers = [
    health_router,
    products_router,
    media_router,
    customers_router,
    transactions_router,
    deliveries_router,
    dashboard_router,
    logs_router,
    mini_router,
    merchant_router,
    access_router,
]
