from .models import Customer, Delivery, Product, Transaction
from .services.coupons import iso_utc


def product_info(product: Product | None):
    if not product:
        return None
    return {
        "id": product.id,
        "name": product.name,
        "brand": product.brand,
        "category": product.category,
        "capacity": product.capacity,
        "package_type": product.package_type,
        "color": product.color,
        "stock": product.stock,
        "warning_stock": product.warning_stock,
        "average_cost": product.average_cost,
        "sell_price": product.sell_price,
    }


def transaction_info(row: Transaction):
    return {
        "id": row.id,
        "kind": row.kind,
        "source": row.source,
        "source_label": "小程序" if row.source == "mini" else "电脑订单",
        "mini_order_id": row.mini_order_id,
        "delivery_id": row.delivery_id,
        "fulfillment_label": "送货上门" if row.delivery_id else "到店提货" if row.source == "mini" else "无需配送",
        "voided_at": row.voided_at,
        "product_id": row.product_id,
        "customer_id": row.customer_id,
        "quantity": row.quantity,
        "unit_price": row.unit_price,
        "cost_price": row.cost_price,
        "total": row.total,
        "note": row.note,
        "operator": row.operator,
        "created_at": iso_utc(row.created_at),
        "product": product_info(row.product),
        "customer": {"id": row.customer.id, "name": row.customer.name, "kind": row.customer.kind, "source": row.customer.source, "phone": row.customer.phone, "address": row.customer.address} if row.customer else None,
    }


def delivery_info(row: Delivery):
    return {
        "id": row.id,
        "source": "mini" if row.mini_order_id else "offline",
        "source_label": "小程序" if row.mini_order_id else "电脑订单",
        "mini_order_id": row.mini_order_id,
        "customer_id": row.customer_id,
        "product_id": row.product_id,
        "quantity": row.quantity,
        "status": row.status,
        "address": row.address,
        "note": row.note,
        "created_at": row.created_at,
        "completed_at": row.completed_at,
        "customer": {"id": row.customer.id, "name": row.customer.name, "kind": row.customer.kind, "phone": row.customer.phone} if row.customer else None,
        "product": product_info(row.product),
    }
