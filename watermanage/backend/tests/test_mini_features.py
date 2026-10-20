"""Business checks on isolated SQLite databases; no shop database is accessed."""
import unittest
import hashlib
from datetime import timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, event, select, func
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CouponSetting, Customer, CustomerCoupon, Delivery, MiniOrder, Product, Transaction
from app.routers import mini, transactions, deliveries, dashboard
from app.schemas import CouponGrantIn, CouponSettingIn, MiniBindIn, MiniOrderIn, PickupCodeIn, SaleIn
from app.services.coupons import utc_now
from app.services.reporting_time import SHOP_TIMEZONE


class MiniFeaturesTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        @event.listens_for(self.engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)()
        self.db.add(CouponSetting(id=1, welcome_amount=Decimal("5.00"), welcome_validity_days=7))
        self.db.commit()
        self.mode = mini.settings.mini_auth_mode
        mini.settings.mini_auth_mode = "mock"

    def tearDown(self):
        mini.settings.mini_auth_mode = self.mode
        self.db.close()
        self.engine.dispose()

    def bind_user(self, phone="18800000001"):
        result = mini.bind(MiniBindIn(name="测试用户", phone=phone, address="测试地址"), self.db)
        return result["customer"]["id"], "Bearer " + result["token"]

    def product(self, price="12.00"):
        item = Product(name="测试水", brand="农丰", category="桶装水", capacity="18.9L", stock=100,
                       reserved_stock=0, sell_price=Decimal(price), average_cost=Decimal("1"))
        self.db.add(item)
        self.db.commit()
        return item

    def order(self, auth, product, coupon_id=None):
        return mini.place_order(MiniOrderIn(items=[{"product_id": product.id, "quantity": 2}],
                    address="测试地址", coupon_id=coupon_id), auth, self.db)

    def assert_http(self, status, action):
        with self.assertRaises(HTTPException) as error:
            action()
        self.assertEqual(error.exception.status_code, status)
        self.db.rollback()

    def test_welcome_once_and_configurable(self):
        offline = Customer(name="同手机号线下客户", phone="18800000001", source="offline",
                           wechat_openid="test_"+hashlib.sha256(b"18800000001").hexdigest())
        self.db.add(offline); self.db.commit()
        customer_id, auth = self.bind_user()
        self.assertNotEqual(customer_id, offline.id)
        self.assertEqual(self.db.get(Customer, customer_id).source, "mini")
        self.assertEqual(offline.name, "同手机号线下客户")
        coupons = mini.my_coupons(auth, self.db)
        self.assertEqual(len(coupons), 1)
        self.assertEqual(coupons[0]["amount"], 5)
        self.bind_user()
        self.assertEqual(self.db.scalar(select(func.count()).select_from(CustomerCoupon)), 1)
        mini.set_coupon_settings(CouponSettingIn(welcome_amount="8.50", welcome_validity_days=10), self.db)
        _, auth2 = self.bind_user("18800000002")
        new = mini.my_coupons(auth2, self.db)[0]
        self.assertEqual(new["amount"], 8.5)
        self.assertEqual((new["expires_at"]-new["issued_at"]).days, 10)

    def test_immediate_sale_and_cancel_refund(self):
        _, auth = self.bind_user()
        product = self.product()
        coupon_id = mini.my_coupons(auth, self.db)[0]["id"]
        order = self.order(auth, product, coupon_id)
        self.assertEqual((order["original_total"], order["discount_amount"], order["total"]), (24, 5, 19))
        self.assertEqual(order["status"], "待提货")
        self.assertEqual((product.stock, product.reserved_stock), (98, 0))
        self.assert_http(409, lambda: self.order(auth, product, coupon_id))
        mini.cancel_order(order["id"], auth, self.db)
        self.assertEqual((product.stock, product.reserved_stock), (100, 0))
        mini.merchant_cancel_order(order["id"], self.db)
        self.assertEqual(product.stock, 100)
        self.assertEqual(self.db.scalar(select(func.sum(Transaction.total)).where(Transaction.voided_at.is_(None))), None)
        self.assertEqual(mini.my_coupons(auth, self.db)[0]["status"], "可使用")
        next_order = self.order(auth, product, coupon_id)
        mini.merchant_cancel_order(next_order["id"], self.db)
        self.assertEqual(mini.my_coupons(auth, self.db)[0]["status"], "可使用")

    def test_welcome_disabled_at_first_bind_is_not_reissued(self):
        mini.set_coupon_settings(CouponSettingIn(welcome_amount="0"), self.db)
        _, auth = self.bind_user()
        self.assertEqual(mini.my_coupons(auth, self.db), [])
        mini.set_coupon_settings(CouponSettingIn(welcome_amount="5"), self.db)
        _, auth = self.bind_user()
        self.assertEqual(mini.my_coupons(auth, self.db), [])

    def test_coupon_ownership_expiry_and_discount_cap(self):
        _, auth1 = self.bind_user()
        _, auth2 = self.bind_user("18800000002")
        product = self.product("1")
        coupon_id = mini.my_coupons(auth1, self.db)[0]["id"]
        self.assert_http(409, lambda: self.order(auth2, product, coupon_id))
        order = self.order(auth1, product, coupon_id)
        self.assertEqual((order["discount_amount"], order["total"]), (2, 0))
        mini.cancel_order(order["id"], auth1, self.db)
        coupon = self.db.get(CustomerCoupon, coupon_id)
        coupon.expires_at = utc_now(self.db)-timedelta(seconds=1)
        self.db.commit()
        self.assert_http(409, lambda: self.order(auth1, product, coupon_id))
        customer_id = mini.me(auth1, self.db)["id"]
        bucket_coupon = CustomerCoupon(customer_id=customer_id, title="大桶水券", amount=Decimal("5"),
            usage_type="large_bucket", grant_key="bucket", expires_at=utc_now(self.db)+timedelta(days=7))
        self.db.add(bucket_coupon); self.db.commit()
        self.assert_http(400, lambda: self.order(auth1, product, bucket_coupon.id))  # 桶装水不适用
        product.category = "大桶水"
        bottled = self.product("10")
        mixed = mini.place_order(MiniOrderIn(items=[{"product_id": product.id, "quantity": 2},
                    {"product_id": bottled.id, "quantity": 1}], address="地址", coupon_id=bucket_coupon.id), auth1, self.db)
        self.assertEqual((mixed["discount_amount"], mixed["total"]), (2, 10))
        linked = self.db.scalars(select(Transaction).where(Transaction.mini_order_id == mixed["id"])).all()
        self.assertEqual({row.product_id: row.total for row in linked}, {product.id: Decimal(0), bottled.id: Decimal(10)})
        mini.merchant_cancel_order(mixed["id"], self.db)
        restored = next(row for row in mini.my_coupons(auth1, self.db) if row["id"] == bucket_coupon.id)
        self.assertEqual(restored["status"], "可使用")

    def test_hidden_orders_stay_in_merchant_and_do_not_expire(self):
        _, auth = self.bind_user()
        product = self.product()
        order = self.order(auth, product)
        entity = self.db.get(MiniOrder, order["id"])
        entity.created_at = utc_now(self.db)-timedelta(days=365)
        self.db.commit()
        mini.catalog(self.db)
        self.assertEqual(mini.my_orders(auth, self.db)[0]["status"], "待提货")
        _, stranger = self.bind_user("18800000002")
        self.assert_http(404, lambda: mini.hide_order(order["id"], stranger, self.db))
        mini.hide_order(order["id"], auth, self.db)
        self.assertEqual(mini.my_orders(auth, self.db), [])
        self.assertTrue(mini.merchant_orders(self.db)[0]["hidden_by_customer"])
        self.assertEqual((product.stock, product.reserved_stock), (98, 0))

    def test_pickup_from_pending_and_no_double_deduction(self):
        _, auth = self.bind_user()
        product = self.product()
        coupon_id = mini.my_coupons(auth, self.db)[0]["id"]
        order = self.order(auth, product, coupon_id)
        self.assertRegex(order["pickup_code"], r"^\d{6}$")
        self.assertEqual(mini.lookup_pickup(order["pickup_code"], self.db)["id"], order["id"])
        redeemed = mini.redeem(PickupCodeIn(code=order["pickup_code"]), self.db)
        self.assertEqual(redeemed["status"], "已核销")
        self.assertEqual((product.stock, product.reserved_stock), (98, 0))
        self.assertEqual(self.db.scalar(select(func.sum(Transaction.total))), Decimal("19.00"))
        self.assertIsNone(self.db.scalar(select(Delivery)))
        self.assertIsNotNone(redeemed["redeemed_at"])
        self.assert_http(409, lambda: mini.redeem(PickupCodeIn(code=order["pickup_code"]), self.db))
        self.assertEqual(product.stock, 98)

    def test_pickup_cannot_be_canceled_and_does_not_sell_twice(self):
        _, auth = self.bind_user()
        product = self.product()
        order = self.order(auth, product)
        mini.redeem(PickupCodeIn(code=order["pickup_code"]), self.db)
        self.assert_http(409, lambda: mini.merchant_cancel_order(order["id"], self.db))
        self.assertEqual(product.stock, 98)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(Transaction)), 1)

    def test_manual_grants_selected_all_and_request_retry(self):
        customer1, _ = self.bind_user()
        self.bind_user("18800000002")
        data = CouponGrantIn(amount="3.25", customer_ids=[customer1], request_key="request-selected-1")
        self.assertEqual(mini.issue_coupons(data, self.db)["issued"], 1)
        self.assertTrue(mini.issue_coupons(data, self.db)["duplicate_request"])
        self.assertEqual(mini.issue_coupons(CouponGrantIn(amount="6", all_users=True, request_key="request-all-users"), self.db)["issued"], 2)
        manual = self.db.scalars(select(CustomerCoupon).where(CustomerCoupon.source == "manual")).all()
        self.assertEqual(len(manual), 3)
        self.assertEqual((manual[0].expires_at-manual[0].issued_at).days, 7)
        self.assert_http(400, lambda: mini.issue_coupons(CouponGrantIn(amount="1", request_key="request-no-users"), self.db))

    def test_pickup_collision_retries(self):
        _, auth = self.bind_user()
        product = self.product()
        with patch.object(mini.secrets, "randbelow", return_value=12345):
            first = self.order(auth, product)
        with patch.object(mini.secrets, "randbelow", side_effect=[12345, 23456]):
            second = self.order(auth, product)
        self.assertNotEqual(first["pickup_code"], second["pickup_code"])

    def test_discount_allocation_never_makes_negative_sales(self):
        customer, auth = self.bind_user()
        products = [self.product("0.01") for _ in range(50)]
        coupon = CustomerCoupon(customer_id=customer, title="小额券", amount=Decimal("0.03"), source="manual",
            grant_key="tiny", expires_at=utc_now(self.db)+timedelta(days=1))
        self.db.add(coupon); self.db.commit()
        order = mini.place_order(MiniOrderIn(items=[{"product_id": p.id, "quantity": 1} for p in products],
                                address="地址", coupon_id=coupon.id), auth, self.db)
        totals = self.db.scalars(select(Transaction.total)).all()
        self.assertTrue(all(value >= 0 for value in totals))
        self.assertEqual(sum(totals), Decimal("0.47"))

    def test_all_order_sources_share_sales_without_duplicates(self):
        _, auth = self.bind_user()
        customer = Customer(name="电脑客户", phone="18800001234", source="offline", address="电脑地址")
        self.db.add(customer); self.db.commit()
        product = self.product("12")
        computer = transactions.sale(SaleIn(product_id=product.id, customer_id=customer.id, quantity=2,
                                     unit_price="12", create_delivery=False), self.db)
        shipping = transactions.sale(SaleIn(product_id=product.id, customer_id=customer.id, quantity=3,
                                     unit_price="12", create_delivery=True), self.db)
        coupon_id = mini.my_coupons(auth, self.db)[0]["id"]
        pickup = self.order(auth, product, coupon_id)
        rows = transactions.list_sales(self.db)
        self.assertEqual(len(rows), 3)
        self.assertEqual(sum(row["total"] for row in rows), Decimal("79"))  # 24 + 36 + (24 - 5)
        self.assertEqual({row["source"] for row in rows}, {"offline", "mini"})
        self.assertEqual({row["source_label"] for row in rows}, {"电脑订单", "小程序"})
        self.assertEqual(product.stock, 93)
        self.assertEqual([row["id"] for row in transactions.list_computer_orders(self.db)], [computer["id"]])
        self.assertIsNone(computer["delivery_id"])
        self.assertIsNotNone(shipping["delivery_id"])
        tasks = deliveries.list_deliveries(self.db)
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["source"], "offline")
        today = utc_now(self.db).replace(tzinfo=timezone.utc).astimezone(SHOP_TIMEZONE).date()
        overview = transactions.sales_overview(today, today, self.db)
        self.assertEqual(overview["total_amount"], 79)
        self.assertEqual(dashboard.dashboard(self.db)["sales_today"], 79)
        mini.redeem(PickupCodeIn(code=pickup["pickup_code"]), self.db)
        self.assertEqual(sum(row["total"] for row in transactions.list_sales(self.db)), Decimal("79"))
        self.assertEqual(len(transactions.list_sales(self.db)), 3)
        self.assertEqual(product.stock, 93)

    def test_mini_cancel_reverses_sales_totals_once(self):
        _, auth = self.bind_user()
        product = self.product("12")
        coupon_id = mini.my_coupons(auth, self.db)[0]["id"]
        order = self.order(auth, product, coupon_id)
        self.assertEqual(sum(row["total"] for row in transactions.list_sales(self.db)), Decimal("19"))
        mini.merchant_cancel_order(order["id"], self.db)
        mini.merchant_cancel_order(order["id"], self.db)
        self.assertEqual(transactions.list_sales(self.db), [])
        self.assertEqual(product.stock, 100)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(Transaction)), 1)
        self.assertIsNotNone(self.db.scalar(select(Transaction)).voided_at)
        self.assertEqual(mini.my_coupons(auth, self.db)[0]["status"], "可使用")

    def test_mini_delivery_is_closed_and_pickup_needs_no_address(self):
        _, auth = self.bind_user()
        product = self.product()
        self.assert_http(400, lambda: mini.place_order(MiniOrderIn(items=[{"product_id": product.id, "quantity": 1}],
            fulfillment="delivery", address="配送地址"), auth, self.db))
        self.assertEqual(product.stock, 100)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(Delivery)), 0)
        order = mini.place_order(MiniOrderIn(items=[{"product_id": product.id, "quantity": 1}]), auth, self.db)
        self.assertEqual((order["fulfillment"], order["status"]), ("pickup", "待提货"))
        self.assertEqual(self.db.scalar(select(func.count()).select_from(Delivery)), 0)

    def test_phone_search_and_suffix_collisions_require_selection(self):
        _, auth1 = self.bind_user("18800001234")
        _, auth2 = self.bind_user("19999991234")
        product = self.product()
        first, second = self.order(auth1, product), self.order(auth2, product)
        self.assertEqual(len(mini.merchant_orders(self.db, phone="880000")), 1)
        self.assertEqual(mini.merchant_orders(self.db, phone="%"), [])
        candidates = mini.pickup_by_phone("1234", self.db)
        self.assertEqual({row["id"] for row in candidates}, {first["id"], second["id"]})
        self.assertEqual({row["contact_phone"] for row in candidates}, {"18800001234", "19999991234"})
        mini.redeem(PickupCodeIn(code=first["pickup_code"]), self.db)
        self.assertEqual([row["id"] for row in mini.pickup_by_phone("1234", self.db)], [second["id"]])
        self.assert_http(400, lambda: mini.pickup_by_phone("123", self.db))
        self.assertEqual(len(transactions.list_sales(self.db)), 2)


if __name__ == "__main__":
    unittest.main()
