"""Exercise the upgrade on a disposable database in the same PostgreSQL cluster.

Run explicitly with the current DATABASE_URL. Never migrates the shop database.
"""
import os
from pathlib import Path
import subprocess
import sys
import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def main():
    original = make_url(os.environ["DATABASE_URL"])
    name = "nf_features_check_" + uuid.uuid4().hex[:12]
    admin = create_engine(original, isolation_level="AUTOCOMMIT")
    test_url = original.set(database=name)
    env = {**os.environ, "DATABASE_URL": test_url.render_as_string(hide_password=False)}
    engine = None
    try:
        with admin.connect() as conn:
            conn.execute(text('CREATE DATABASE "' + name + '"'))
        alembic = Path(sys.executable).parent / "alembic"
        subprocess.run([str(alembic), "upgrade", "0005_mini_orders"], env=env, check=True)
        engine = create_engine(test_url)
        with engine.begin() as conn:
            conn.execute(text("""INSERT INTO customers(id,name,kind,phone,address,note,wechat_openid)
                                 VALUES(1,'旧订单测试','个人','test','地址','','legacy-mini')"""))
            conn.execute(text("""INSERT INTO products(id,name,brand,category,capacity,package_type,color,
                                stock,warning_stock,average_cost,sell_price,active)
                                VALUES(1,'水','农丰','桶装水','18.9L','桶','#356e60',10,1,1,10,true)"""))
            conn.execute(text("""INSERT INTO mini_orders(id,order_no,customer_id,status,total,address,note)
                                 VALUES(1,'LEGACY-CHECK',1,'已确认',10,'地址','')"""))
            conn.execute(text("""INSERT INTO deliveries(customer_id,product_id,quantity,status,address,note)
                                 VALUES(1,1,1,'待配送','地址','商城订单 LEGACY-CHECK')"""))
            conn.execute(text("""INSERT INTO transactions(kind,customer_id,product_id,quantity,unit_price,total,note,operator)
                                 VALUES('sale',1,1,1,10,10,'商城订单 LEGACY-CHECK','小程序订单'),
                                       ('sale',1,1,1,10,10,'OFFLINE-SHIPPING','管理员'),
                                       ('sale',1,1,1,10,10,'OFFLINE-PICKUP','管理员')"""))
            conn.execute(text("""INSERT INTO deliveries(customer_id,product_id,quantity,status,address,note)
                                 VALUES(1,1,1,'待配送','地址','OFFLINE-SHIPPING')"""))
        subprocess.run([str(alembic), "upgrade", "head"], env=env, check=True)
        with engine.connect() as conn:
            row = conn.execute(text("SELECT original_total,discount_amount,pickup_code,hidden_by_customer FROM mini_orders WHERE id=1")).one()
            assert row.original_total == 10 and row.discount_amount == 0 and not row.hidden_by_customer
            assert len(row.pickup_code) == 6 and row.pickup_code.isdigit()
            assert conn.scalar(text("SELECT mini_order_id FROM deliveries WHERE note='商城订单 LEGACY-CHECK'")) == 1
            assert conn.scalar(text("SELECT welcome_amount FROM coupon_settings WHERE id=1")) == 5
            assert conn.scalar(text("SELECT fulfillment FROM mini_orders WHERE id=1")) == 'delivery'
            assert conn.scalar(text("SELECT count(*) FROM transactions WHERE delivery_id IS NOT NULL")) == 2
            assert conn.scalar(text("SELECT count(*) FROM transactions WHERE source='offline' AND delivery_id IS NULL")) == 1
            assert conn.scalar(text("SELECT sum(total) FROM transactions WHERE kind='sale'")) == 30
        subprocess.run([str(alembic), "downgrade", "0005_mini_orders"], env=env, check=True)
        subprocess.run([str(alembic), "upgrade", "head"], env=env, check=True)
        print("PASS: fresh schema, legacy order backfill, delivery linkage, downgrade and re-upgrade")
    finally:
        if engine:
            engine.dispose()
        with admin.connect() as conn:
            conn.execute(text('DROP DATABASE IF EXISTS "' + name + '" WITH (FORCE)'))
        admin.dispose()


if __name__ == "__main__":
    main()
