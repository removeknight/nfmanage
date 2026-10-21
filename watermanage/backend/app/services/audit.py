from sqlalchemy.orm import Session

from ..models import OperationLog, Product

ACTION_LABELS = {
    "purchase": "采购入库", "sale": "销售开单", "adjustment": "价格调整",
    "product_create": "新增商品", "product_deactivate": "商品下架", "product_reactivate": "商品重新上架",
    "product_image": "商品图片设置",
    "delivery_status": "配送状态", "order_reserve": "订单预留库存", "order_release": "释放预留库存",
    "mini_order_confirm": "商家确认订单（历史）", "mini_order_reject": "商家拒绝订单（历史）",
    "mini_order_sale": "小程序下单出库", "mini_order_cancel": "取消订单并退库", "mini_order_redeem": "提货核销",
    "coupon_grant": "发放优惠券", "coupon_settings": "优惠券设置",
    "merchant_grant": "商家账号授权", "merchant_revoke": "停用商家权限", "merchant_login": "商家登录",
}


def write_log(
    db: Session,
    action: str,
    product: Product | None,
    operator: str,
    before: str,
    after: str,
    detail: str = "",
):
    db.add(
        OperationLog(
            action=action,
            product_id=product.id if product else None,
            product_snapshot=f"{product.brand} {product.name} · {product.capacity}" if product else "",
            operator=operator or "管理员",
            before_value=before,
            after_value=after,
            detail=detail,
        )
    )
