import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { money, formatDate } from "../../components/UI";
import { useAutoRefresh } from "../../utils/useAutoRefresh";

function UsageSelect({ name, value = "unrestricted" }) {
  return <label>使用类型<select name={name} defaultValue={value}><option value="unrestricted">无门槛（全部商品）</option><option value="large_bucket">大桶水专用</option></select></label>;
}

const newKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export default function CouponPage() {
  const [config, setConfig] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [selected, setSelected] = useState([]);
  const [allUsers, setAllUsers] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const grantKey = useRef(newKey());
  async function load() {
    const [settings, users, issued] = await Promise.all([api.couponSettings(), api.miniCustomers(), api.issuedCoupons()]);
    setConfig(settings); setCustomers(users); setCoupons(issued);
  }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  useAutoRefresh(async () => {
    const [users, issued] = await Promise.all([api.miniCustomers(), api.issuedCoupons()]);
    setCustomers(users); setCoupons(issued);
  });
  async function saveSettings(event) {
    event.preventDefault(); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await api.saveCouponSettings({ welcome_amount: Number(values.amount), welcome_validity_days: Number(values.days), welcome_usage_type: values.usage_type }); setMessage("新用户券配置已保存，下次绑定时按新配置发放"); await load(); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function issue(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const count = allUsers ? customers.length : selected.length;
    if (!count) return setMessage("请先选择发放用户");
    if (!window.confirm(`向 ${count} 位用户每人发放 ¥${Number(values.amount).toFixed(2)} 优惠券，有效期 ${values.days} 天？`)) return;
    setBusy(true);
    try {
      const result = await api.issueCoupons({ title: values.title, amount: Number(values.amount), validity_days: Number(values.days), usage_type: values.usage_type, all_users: allUsers, customer_ids: selected, request_key: grantKey.current });
      grantKey.current = newKey(); setMessage(`已向 ${result.issued} 位用户发放优惠券`); setSelected([]); await load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  const visibleCustomers = customers.filter(customer => `${customer.name} ${customer.phone}`.includes(query));
  return <div className="coupon-admin">
    {message && <div className="coupon-message" role="status">{message}</div>}
    <section className="panel coupon-section"><h2>新用户优惠券</h2><p className="muted">每位用户首次绑定自动获得一张；金额设为 0 可暂停赠送。调整配置不会修改已发出的券。</p>
      {config && <form className="coupon-form" onSubmit={saveSettings} key={`${config.welcome_amount}-${config.welcome_validity_days}-${config.welcome_usage_type}`}>
        <label>优惠金额（元）<input name="amount" type="number" min="0" max="100000" step="0.01" defaultValue={config.welcome_amount} required /></label>
        <label>有效期（天）<input name="days" type="number" min="1" max="365" defaultValue={config.welcome_validity_days} required /></label>
        <UsageSelect name="usage_type" value={config.welcome_usage_type} />
        <button className="primary-btn" disabled={busy}>保存设置</button>
      </form>}
    </section>
    <section className="panel coupon-section"><h2>发放优惠券</h2><p className="muted">每单限用一张。大桶水券仅抵扣品类为“大桶水”的商品金额，不适用于“桶装水”；无门槛券可抵扣全部商品。</p>
      <form onSubmit={issue}>
        <div className="coupon-form"><label>优惠券名称<input name="title" defaultValue="水站优惠券" maxLength="80" required /></label><label>金额（元）<input name="amount" type="number" min="0.01" max="100000" step="0.01" defaultValue="5" required /></label><label>有效期（天）<input name="days" type="number" min="1" max="365" defaultValue="7" required /></label><UsageSelect name="usage_type" /></div>
        <label className="coupon-check"><input type="checkbox" checked={allUsers} onChange={event => setAllUsers(event.target.checked)} /> 全部已绑定用户（{customers.length} 位）</label>
        {!allUsers && <><input className="coupon-search" aria-label="搜索发券用户" placeholder="搜索姓名或联系电话" value={query} onChange={event => setQuery(event.target.value)} /><div className="coupon-recipients">{visibleCustomers.map(customer => <label className="coupon-check" key={customer.id}><input type="checkbox" checked={selected.includes(customer.id)} onChange={event => setSelected(current => event.target.checked ? [...current, customer.id] : current.filter(id => id !== customer.id))} />{customer.name} · {customer.phone}</label>)}{!visibleCustomers.length && <p className="muted">暂无匹配的已绑定用户</p>}</div></>}
        <button className="primary-btn" disabled={busy}>{busy ? "处理中…" : `发放给 ${allUsers ? customers.length : selected.length} 位用户`}</button>
      </form>
    </section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>发放记录</h2><p>最近 500 张优惠券 · 每 5 秒自动更新</p></div><button className="row-action" onClick={() => load().catch(error => setMessage(error.message))}>刷新</button></div><div className="table-scroll"><table><thead><tr><th>用户</th><th>优惠券</th><th>面额</th><th>使用类型</th><th>有效期至</th><th>状态</th></tr></thead><tbody>{coupons.map(coupon => <tr key={coupon.id}><td>{coupon.customer.name}<small className="block muted">{coupon.customer.phone}</small></td><td>{coupon.title}<small className="block muted">{coupon.source === "welcome" ? "新用户自动赠送" : "后台发放"}</small></td><td>{money(coupon.amount)}</td><td>{coupon.usage_label}</td><td>{formatDate(coupon.expires_at)}</td><td>{coupon.status}</td></tr>)}</tbody></table>{!coupons.length && <p className="coupon-section muted">暂无发放记录</p>}</div></section>
  </div>;
}
