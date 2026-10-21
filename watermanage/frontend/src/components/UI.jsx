import { X } from "lucide-react";

export const money = (value) => `¥${Number(value || 0).toFixed(2)}`;
export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const actionLabels = {
  purchase: "采购入库",
  sale: "销售开单",
  adjustment: "价格调整",
  product_create: "新增商品",
  product_deactivate: "商品下架",
  product_reactivate: "商品重新上架",
  delivery_status: "配送状态",
  order_reserve: "订单预留库存",
  order_release: "释放预留库存",
  mini_order_confirm: "商家确认订单（历史）",
  mini_order_reject: "商家拒绝订单（历史）",
  mini_order_sale: "小程序下单出库",
  mini_order_cancel: "取消订单并退库",
  mini_order_redeem: "提货核销",
  coupon_grant: "发放优惠券",
  coupon_settings: "优惠券设置",
  merchant_grant: "商家账号授权",
  merchant_revoke: "停用商家权限",
  merchant_login: "商家登录",
};

export function Modal({ title, close, children, description = "请填写信息，保存后立即同步到库存" }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section className="modal">
        <header>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button" onClick={close}>
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({
  label,
  name,
  placeholder = "",
  options,
  type = "text",
  required = false,
  defaultValue,
  step,
  min,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {options ? (
        <select name={name} required={required} defaultValue="">
          <option value="" disabled>
            请选择
          </option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          defaultValue={defaultValue}
          step={step}
          min={min}
        />
      )}
    </label>
  );
}
export function Empty({ icon: Icon, title, detail }) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={22} />
      </span>
      <b>{title}</b>
      <small>{detail}</small>
    </div>
  );
}
