"""Legal text versions are derived from their actual content, never client claims."""
import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..models import LegalConsent, LegalDocument, PrivacySetting
from .coupons import iso_utc, utc_now

REVISION = "2026-10-23.1"


def privacy_settings(db, lock=False):
    query = select(PrivacySetting).where(PrivacySetting.id == 1)
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise HTTPException(503, "隐私配置尚未初始化，请执行数据库升级")
    return row


def documents(db):
    config = privacy_settings(db)
    operator, phone = config.operator_name, config.contact_phone
    privacy = [
        {"heading": "一、运营方与联系方式", "text": f"本小程序由{operator}运营。有关订单、个人信息和本指引的问题，请联系商家：{phone}。"},
        {"heading": "二、浏览商品与绑定账号", "text": "您可以不注册直接浏览商品。主动绑定时，我们通过微信登录凭据在服务器验证您的微信身份，并保存本小程序范围内的 OpenID；保存您填写的称呼和联系电话，用于账户识别、订单联系和到店提货。手机号由您自行填写，未经微信或短信验证。我们不会通过登录自动获取您的微信手机号、头像、昵称或定位。"},
        {"heading": "三、家庭地址为选填信息", "text": "您可自愿填写小区、楼栋、门牌号等常用家庭地址，并单独勾选同意保存，用于后续配送服务开放后的地址预填和联系准备。目前仅支持到店提货，填写地址不代表已预约配送。拒绝提供或不同意保存地址，不影响绑定、领券、下单和到店提货。您可在“我的 → 修改资料”中清空地址并取消地址保存同意，随时撤回该项选择。"},
        {"heading": "四、订单、优惠券与本地设置", "text": "为履行交易及提供账户服务，我们保存商品明细、价格、优惠、下单时间、订单状态、提货码和优惠券发放使用记录；商家成员还会保存经营角色及必要的授权、操作记录。设备本地保存登录凭证、账户资料缓存、字体偏好、优惠券已读标记；测试模式另外保存随机测试身份。正式环境使用真实微信身份，测试身份不作为正式微信身份。"},
        {"heading": "五、使用范围与保护措施", "text": "订单联系信息仅供获授权的商家人员处理交易、提货及售后使用。我们在中国境内服务器存储业务数据，通过登录权限、角色校验及备份保护数据，不出售您的个人信息。微信登录由微信提供，相关处理同时适用微信隐私规则。如未来增加获取手机号、定位等能力，将说明必要性并按平台要求取得相应授权。"},
        {"heading": "六、保存期限", "text": "账户资料在提供账户服务所需期间保存；选填地址保存至您清空地址、撤回同意或提出删除要求。交易、财务及必要的安全审计记录按适用法律要求及处理交易争议所需期限保留，其中订单信息按交易完成后不少于三年的标准留存。依法需留存的数据会限制访问和用途；不再需要的信息将删除或匿名化。备份按备份轮换周期处理，并在恢复数据时同步落实已受理的删除要求。"},
        {"heading": "七、更正、删除、注销和撤回同意", "text": f"您可在“我的 → 修改资料”中更正称呼、电话和地址。需要查阅、复制、删除个人信息、注销账户或撤回同意时，可通过“联系商家”拨打 {phone} 提出，我们将核实必要的身份信息并依法及时处理，无需取得店主审批。未完成交易、争议及法定留存事项将向您说明处理方式和范围。“删除订单记录”只是在手机端隐藏该记录，不代表后台交易资料已删除。"},
        {"heading": "八、指引更新与未成年人", "text": "本指引发生实质变更时将更新版本，并在需再次确认的场景提示您阅读。可选信息的同意不与基础交易功能捆绑。未满十四周岁的用户请由监护人联系商家办理，不自行提交个人信息。"},
    ]
    terms = [
        {"heading": "一、服务提供方", "text": f"{operator}通过农丰水站小程序提供商品展示、订单登记、优惠券及到店提货服务。联系商家：{phone}。"},
        {"heading": "二、账号与资料", "text": "浏览商品无需注册。下单及查看个人订单需要绑定微信账号并填写称呼、联系电话。请提供准确的联系信息并妥善保管登录凭证。家庭地址为单独自愿提供的选填信息。商家经营权限由后台授权，不因普通注册自动获得。"},
        {"heading": "三、下单与提货", "text": "目前仅支持到店提货，不提供小程序送货上门。订单金额以提交时服务器核算的商品价格、数量及优惠为准；下单成功后扣减库存，生成提货码。本小程序暂未接入在线支付，应付金额不代表已付款，请与商家核对线下付款及提货事项。请勿向无关人员披露提货码。"},
        {"heading": "四、优惠券", "text": "优惠券以页面展示的金额、适用品类、有效期及状态为准，每单限用一张，不兑换现金；大桶水券仅抵扣品类为“大桶水”的商品金额，不适用于“桶装水”。有效期内符合使用条件时方可使用，优惠不超过适用商品金额。"},
        {"heading": "五、取消与售后", "text": f"未完成订单可按订单页面规则取消，取消后还原库存、返还所用优惠券，优惠券保留原有效期。已核销订单、商品质量、退换货及线下款项问题，请联系商家 {phone} 依法协商处理。删除手机端订单记录不会取消订单。平台功能限制不影响您依法享有的消费者权益。"},
        {"heading": "六、个人信息与服务变更", "text": "个人信息的处理范围、用途及行使权利方式详见《隐私保护指引》。家庭地址不作为享受当前基础服务的必需条件。后续配送、在线支付等服务开放时会另行告知规则。对服务有疑问或发生争议，可先联系商家；您仍可依法投诉或通过法律途径解决。"},
    ]
    result = {}
    for kind, title, sections in (("privacy", "隐私保护指引", privacy), ("terms", "用户服务协议", terms)):
        content = json.dumps({"revision": REVISION, "title": title, "sections": sections}, ensure_ascii=False, sort_keys=True)
        version = REVISION + "-" + hashlib.sha256(content.encode()).hexdigest()[:16]
        result[kind] = {"title": title, "version": version, "revision": REVISION, "sections": sections, "content": content}
    return result


def legal_info(db):
    config, docs = privacy_settings(db), documents(db)
    return {"operator_name": config.operator_name, "contact_phone": config.contact_phone,
            **{kind: {key: value for key, value in doc.items() if key != "content"} for kind, doc in docs.items()}}


def agreement_state(db, customer):
    docs = documents(db)
    return {"needs_agreement": not customer.agreement_accepted_at or
            customer.privacy_version != docs["privacy"]["version"] or customer.terms_version != docs["terms"]["version"],
            "privacy_version": customer.privacy_version, "terms_version": customer.terms_version,
            "agreement_accepted_at": iso_utc(customer.agreement_accepted_at),
            "address_allowed": bool(customer.address_consent_at)}


def validate_acceptance(db, data):
    docs = documents(db)
    if not data.accepted:
        raise HTTPException(400, "请先阅读并勾选确认隐私保护指引和用户服务协议")
    if data.privacy_version != docs["privacy"]["version"] or data.terms_version != docs["terms"]["version"]:
        raise HTTPException(409, "协议版本已更新，请重新打开资料页阅读并确认")
    if data.address.strip() and not data.address_allowed:
        raise HTTPException(400, "保存家庭地址需要单独勾选同意；也可清空地址后继续")
    return docs


def record_acceptance(db, customer, data, source):
    docs = validate_acceptance(db, data)
    for kind, doc in docs.items():
        if db.scalar(select(LegalDocument.id).where(LegalDocument.kind == kind, LegalDocument.version == doc["version"])):
            continue
        try:
            with db.begin_nested():
                db.add(LegalDocument(kind=kind, version=doc["version"], title=doc["title"], content=doc["content"]))
                db.flush()
        except IntegrityError:
            # Concurrent binding may have archived the identical immutable version.
            if not db.scalar(select(LegalDocument.id).where(LegalDocument.kind == kind, LegalDocument.version == doc["version"])):
                raise
    now = utc_now(db)
    allowed = bool(data.address.strip() and data.address_allowed)
    customer.privacy_version, customer.terms_version = docs["privacy"]["version"], docs["terms"]["version"]
    customer.agreement_accepted_at = now
    customer.address_consent_at = now if allowed else None
    db.add(LegalConsent(customer_id=customer.id, privacy_version=customer.privacy_version,
                        terms_version=customer.terms_version, address_allowed=allowed, source=source, accepted_at=now))
