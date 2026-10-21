"""Server-only first owner selection; no public activation page is required."""
import argparse

from fastapi import HTTPException
from sqlalchemy import select

from .database import SessionLocal
from .models import Customer, MerchantCode, MerchantMember
from .services.auth import ROLE_LABELS, role_for
from .services.audit import write_log
from .services.coupons import utc_now
from .services.merchant_access import eligible_customer, has_owner, lock_access


def main():
    parser = argparse.ArgumentParser(description="农丰水站首位店主初始化；必须明确指定已绑定的小程序客户 ID")
    parser.add_argument("command", choices=["bootstrap"], help="查看候选账号或指定首位店主")
    parser.add_argument("--customer-id", type=int, help="明确指定首位店主的客户 ID")
    args = parser.parse_args()
    with SessionLocal() as db:
        try:
            lock_access(db)
            if has_owner(db):
                raise HTTPException(409, "已有店主，无需重复初始化；请在电脑后台客户管理中授权副店长或店员")
            if args.customer_id is None:
                print("当前可指定的小程序客户（请核对身份后再授权）：")
                rows = db.scalars(select(Customer).where(Customer.source == "mini").order_by(Customer.id)).all()
                for row in rows:
                    if eligible_customer(row):
                        print(f"客户 ID {row.id} | {row.name} | {row.phone}")
                print("指定首位店主：bash deploy/merchant-bootstrap.sh --customer-id 客户ID")
                return
            target = db.get(Customer, args.customer_id)
            if not target or not eligible_customer(target):
                raise HTTPException(400, "请选择当前小程序中已经绑定的客户 ID")
            previous = role_for(db, target)
            member = db.get(MerchantMember, target.id)
            if member:
                member.role, member.active, member.granted_by = "owner", True, None
                member.updated_at = utc_now(db)
            else:
                db.add(MerchantMember(customer_id=target.id, role="owner", active=True))
            for code in db.scalars(select(MerchantCode).where(MerchantCode.kind == "bootstrap",
                                    MerchantCode.used_at.is_(None))).all():
                code.used_at = utc_now(db)
            write_log(db, "merchant_grant", None, "服务器管理员", ROLE_LABELS[previous], "店主",
                      f"通过服务器初始化首位店主，客户 #{target.id} {target.name}")
            db.commit()
        except HTTPException as error:
            parser.exit(1, error.detail + "\n")
    print(f"已将客户 #{target.id} {target.name} 设置为首位店主。")
    print("请使用该微信账号打开小程序『我的』，商家工作台会自动显示；后续人员在电脑后台客户管理中授权。")


if __name__ == "__main__":
    main()
