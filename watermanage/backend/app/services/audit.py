from sqlalchemy.orm import Session

from ..models import OperationLog, Product


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
