"""Server-only first owner bootstrap: python -m app.merchant_admin bootstrap."""
import argparse

from fastapi import HTTPException

from .database import SessionLocal
from .services.merchant_access import new_code


def main():
    parser = argparse.ArgumentParser(description="农丰水站商家初始化工具；不会自动提升任何客户的权限")
    parser.add_argument("command", choices=["bootstrap"], help="生成首位店主一次性授权码，有效 30 分钟")
    parser.parse_args()
    with SessionLocal() as db:
        try:
            result = new_code(db, "bootstrap")
            db.commit()
        except HTTPException as error:
            parser.exit(1, error.detail + "\n")
    print("首位店主授权码：" + result["code"])
    print("请由指定店主登录小程序，在 我的 → 商家授权 中输入。30 分钟内有效，仅可使用一次。")
    print("再次生成将使旧码失效；请勿将授权码写入代码或公开发送。")


if __name__ == "__main__":
    main()
