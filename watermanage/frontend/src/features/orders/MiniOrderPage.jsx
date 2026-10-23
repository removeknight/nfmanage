import { Check, ClipboardList, Clock3, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import { Empty, formatDate, money } from "../../components/UI";
import { useAutoRefresh } from "../../utils/useAutoRefresh";

const activeOrder = order => ["待提货", "待配送", "配送中"].includes(order.status);

export default function MiniOrderPage({ orders, cancelOrder, refresh }) {
  const [filter, setFilter] = useState("待提货");
  const [phoneQuery, setPhoneQuery] = useState("");
  const [phoneResult, setPhoneResult] = useState({ phone: "", status: "", rows: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [lookupMode, setLookupMode] = useState("code");
  const [lookupValue, setLookupValue] = useState("");
  const [searchedSuffix, setSearchedSuffix] = useState("");
  const [phoneMatches, setPhoneMatches] = useState([]);
  const [pickup, setPickup] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lookupVersion = useRef(0);
  const phone = phoneQuery.trim();

  useEffect(() => {
    if (!phone) { setSearchLoading(false); setSearchError(""); return; }
    let current = true;
    setSearchLoading(true); setSearchError("");
    const timer = setTimeout(async () => {
      try {
        const result = await api.miniOrders({ phone, status: filter === "全部" ? "" : filter });
        if (current) setPhoneResult({ phone, status: filter, rows: result });
      } catch (error) {
        if (current) { setSearchError(error.message); setPhoneResult({ phone, status: filter, rows: [] }); }
      } finally { if (current) setSearchLoading(false); }
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [phone, filter, orders]);

  const rows = useMemo(() => {
    if (phone) return phoneResult.phone === phone && phoneResult.status === filter ? phoneResult.rows : [];
    return orders.filter(order => filter === "全部" || order.status === filter);
  }, [orders, filter, phone, phoneResult]);

  useAutoRefresh(async () => {
    if (!searchedSuffix || busy) return;
    const version = lookupVersion.current;
    const result = await api.pickupByPhone(searchedSuffix);
    if (version !== lookupVersion.current) return;
    setPhoneMatches(result);
    setPickup(selected => selected ? result.find(order => order.id === selected.id) || null : null);
  });

  function resetLookup() {
    lookupVersion.current += 1;
    setPickup(null); setPhoneMatches([]); setSearchedSuffix(""); setMessage("");
  }
  async function lookup(event) {
    event.preventDefault();
    if (busy) return;
    const value = lookupValue.trim();
    if (!(lookupMode === "phone" ? /^[0-9]{4}$/ : /^[0-9]{6}$/).test(value)) {
      setMessage(lookupMode === "phone" ? "请输入手机尾号后四位数字" : "请输入六位提货码");
      return;
    }
    resetLookup();
    const version = lookupVersion.current;
    setBusy(true);
    try {
      if (lookupMode === "phone") {
        const result = await api.pickupByPhone(value);
        if (version !== lookupVersion.current) return;
        setPhoneMatches(result); setSearchedSuffix(value);
      } else {
        const result = await api.lookupPickup(value);
        if (version === lookupVersion.current) setPickup(result);
      }
    } catch (error) { if (version === lookupVersion.current) setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function redeem() {
    if (busy || !pickup || !activeOrder(pickup)) return;
    const selected = pickup;
    if (!window.confirm(`确认已向 ${selected.customer.name}（${selected.customer.phone || "未填写手机号"}）交付商品并收到优惠后款项？\n订单：${selected.order_no}\n优惠后金额：${money(selected.total)}\n确认后完成核销并自动登记收款，已入账订单不会重复收款。`)) return;
    lookupVersion.current += 1;
    setBusy(true); setMessage("");
    try {
      await api.redeemPickup(selected.pickup_code);
      setPickup(null); setPhoneMatches(current => current.filter(order => order.id !== selected.id));
      if (lookupMode === "code") setLookupValue("");
      setMessage(`订单 ${selected.order_no} 提货核销成功`);
      await refresh().catch(() => setMessage("提货核销成功，订单列表暂未刷新，请稍后刷新查看"));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  function selectFromTable(order) {
    if (busy) return;
    resetLookup(); setLookupMode("code"); setLookupValue(order.pickup_code); setPickup(order);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <>
    <section className="panel pickup-panel">
      <h3>提货快速核销</h3>
      <p className="muted">支持六位提货码或手机尾号后四位查询；尾号相同的订单需核对客户和商品后逐笔核销</p>
      <form className="pickup-form" onSubmit={lookup}>
        <label className="pickup-field">查询方式<select aria-label="核销查询方式" value={lookupMode} disabled={busy} onChange={event => { resetLookup(); setLookupMode(event.target.value); setLookupValue(""); }}><option value="code">六位提货码</option><option value="phone">手机尾号后四位</option></select></label>
        <label className="pickup-field">{lookupMode === "phone" ? "手机尾号" : "提货码"}<input aria-label={lookupMode === "phone" ? "手机尾号后四位" : "六位提货码"} inputMode="numeric" pattern={lookupMode === "phone" ? "[0-9]{4}" : "[0-9]{6}"} maxLength={lookupMode === "phone" ? 4 : 6} value={lookupValue} disabled={busy} onChange={event => { resetLookup(); setLookupValue(event.target.value.replace(/\D/g, "")); }} placeholder={lookupMode === "phone" ? "请输入手机尾号后四位" : "请输入六位提货码"} required /></label>
        <button className="primary-btn" disabled={busy}>{busy ? "处理中…" : "查询订单"}</button>
      </form>
      {message && <p role="status">{message}</p>}
      {searchedSuffix && <div className="pickup-phone-results">
        <p className="muted">手机尾号 {searchedSuffix} · {phoneMatches.length} 笔可核销订单 · 每 5 秒自动更新</p>
        {!phoneMatches.length && <p>没有匹配的待提货订单，请核对尾号；已取消或已核销订单可在下方订单列表中搜索。</p>}
        <div className="pickup-candidates">{phoneMatches.map(order => <article key={order.id} className={`pickup-candidate ${pickup?.id === order.id ? "selected" : ""}`}>
          <div className="pickup-candidate-heading"><div><b>{order.customer.name}</b><span className="pickup-phone">{order.customer.phone || "未填写手机号"}</span></div><b>{money(order.total)}</b></div>
          <small className="block muted">{order.order_no} · {formatDate(order.created_at)}</small>
          <p>{order.items.map(item => `${item.brand} ${item.name} ${item.capacity} ×${item.quantity}`).join("；")}</p>
          <button className="row-action" disabled={busy} onClick={() => { setPickup(order); setMessage(""); }}>{pickup?.id === order.id ? "已选择，请在下方核对" : "选择此订单核销"}</button>
        </article>)}</div>
      </div>}
      {pickup && <div className="pickup-result">
        <h4>核对本次提货</h4><b>{pickup.customer.name} · {pickup.customer.phone || "未填写手机号"} · {pickup.status}</b>
        <p>{pickup.order_no} · {formatDate(pickup.created_at)} · 应付 {money(pickup.total)}</p><p>实收 {money(pickup.received_total)} · {pickup.payment_status}</p>
        {pickup.items.map(item => <p key={item.product_id}>{item.brand} {item.name} · {item.capacity} × {item.quantity}</p>)}
        <p className="muted">联系地址：{pickup.address || "未填写"}</p>
        <button className="primary-btn" disabled={busy || !activeOrder(pickup)} onClick={redeem}>确认收款并提货核销</button>
      </div>}
    </section>
    <section className="panel table-panel">
      <div className="panel-heading"><div><span className="section-kicker">MINI PROGRAM ORDERS</span><h2>小程序订单</h2><p>下单即成功并出库 · 每 5 秒自动更新 · 手机端删除的订单仍保留</p></div>
        <span className="pending-pill"><Clock3 size={14} /> {orders.filter(o => o.status === "待提货").length} 单待提货</span>
        <button className="row-action" onClick={() => refresh().catch(error => setMessage(error.message))}><RefreshCw size={14} /> 刷新</button>
      </div>
      <div className="table-tools filter-tools">
        <label className="searchbox"><Search size={16} /><input aria-label="搜索订单手机号" inputMode="numeric" maxLength={40} value={phoneQuery} onChange={event => setPhoneQuery(event.target.value)} placeholder="输入手机号任意连续号段搜索" /></label>
        <select className="period-select" aria-label="订单状态" value={filter} onChange={event => setFilter(event.target.value)}>
          {["待提货", "待配送", "配送中", "已核销", "已完成", "已取消", "已拒绝", "已超时", "全部"].map(value => <option key={value}>{value}</option>)}
        </select><span className="result-count">{searchLoading ? "搜索中…" : `${rows.length} 笔订单`}</span>
      </div>
      <p className="order-search-note muted">手机号与订单状态同时筛选，最多展示最近 500 笔匹配订单。</p>
      {searchError && <p className="order-search-note" role="alert">{searchError}</p>}
      <div className="table-scroll"><table><thead><tr><th>订单 / 提货码</th><th>客户</th><th>手机号</th><th>商品明细</th><th>收货地址</th><th>订单金额</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{rows.map(order => <tr key={order.id}>
          <td><b>{order.order_no}</b><small className="block muted">{order.source_label || "小程序"} · {formatDate(order.created_at)}</small><small className="block">提货码 {order.pickup_code}</small>{order.hidden_by_customer && <small className="block muted">顾客端已删除</small>}</td>
          <td>{order.customer.name}</td><td className="order-phone">{order.customer.phone || "—"}</td>
          <td>{order.items.map(item => <div className="mini-order-line" key={item.product_id}>{item.brand} {item.name} · {item.capacity} × {item.quantity}<small className="block muted">单价 {money(item.unit_price)}</small></div>)}</td>
          <td>{order.address}{order.note && <small className="block muted">备注：{order.note}</small>}</td>
          <td><b>应收 {money(order.total)}</b><small className="block">实收 {money(order.received_total)} · {order.payment_status}</small>{order.discount_amount > 0 && <small className="block muted">原价 {money(order.original_total)} / 优惠 {money(order.discount_amount)}</small>}</td>
          <td><span className={`delivery-state ${order.status === "已核销" ? "done" : order.status !== "待提货" ? "cancelled" : ""}`}>{order.status}</span>{order.redeemed_at && <small className="block muted">{formatDate(order.redeemed_at)}</small>}</td>
          <td>{activeOrder(order) ? <div className="row-actions"><button className="row-action" disabled={busy} onClick={() => selectFromTable(order)}><Check size={14} /> 提货核销</button><button className="row-action danger-action" disabled={busy} onClick={() => cancelOrder(order)}>取消订单</button></div> : "—"}</td>
        </tr>)}</tbody></table>
        {!rows.length && !searchLoading && <Empty icon={ClipboardList} title="没有符合条件的订单" detail="请核对手机号片段或切换订单状态。" />}
      </div>
    </section>
  </>;
}
