import { Check, ClipboardList, Clock3, RefreshCw, LockKeyhole } from "lucide-react";
import { useMemo, useState } from "react";
import { Empty, formatDate } from "../../components/UI";

export default function MiniOrderPage({ orders, merchantToken, loginMerchant, logoutMerchant, confirmOrder, rejectOrder, refresh }) {
  const [filter, setFilter] = useState("待商家确认");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const rows = useMemo(
    () => orders.filter((order) => filter === "全部" || order.status === filter),
    [orders, filter],
  );
  const pending = orders.filter((order) => order.status === "待商家确认").length;
  async function submitLogin(event) {
    event.preventDefault();
    try { await loginMerchant(password); setPassword(""); setError(""); }
    catch (loginError) { setError(loginError.message); }
  }
  if (!merchantToken) return (
    <section className="panel table-panel merchant-login-panel">
      <div className="panel-heading"><div><span className="section-kicker">MERCHANT ACCESS</span><h2>商家订单管理</h2><p>使用服务器配置的商家密钥登录，处理小程序新订单</p></div></div>
      <form className="merchant-login-form" onSubmit={submitLogin}>
        <LockKeyhole size={20} />
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="商家管理密钥" aria-label="商家管理密钥" required />
        <button className="primary-btn" type="submit">登录</button>
      </form>
      {error && <p className="merchant-login-error">{error}</p>}
    </section>
  );
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">MINI PROGRAM ORDERS</span>
          <h2>小程序订单</h2>
          <p>确认订单后扣减实物库存，并自动创建配送任务</p>
        </div>
        <span className="pending-pill"><Clock3 size={14} /> {pending} 单待确认</span>
        <button className="row-action" onClick={refresh}><RefreshCw size={14} /> 刷新</button>
        <button className="row-action" onClick={logoutMerchant}>退出登录</button>
      </div>
      <div className="table-tools filter-tools">
        <select className="period-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option>待商家确认</option><option>已确认</option><option>已取消</option><option>已拒绝</option><option>已超时</option><option>全部</option>
        </select>
        <span className="result-count">{rows.length} 笔订单</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>订单号 / 下单时间</th><th>客户</th><th>商品明细</th><th>收货地址</th><th>订单金额</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>{rows.map((order) => (
            <tr key={order.id}>
              <td><b>{order.order_no}</b><small className="block muted">{formatDate(order.created_at)}</small></td>
              <td>{order.customer?.name || "—"}<small className="block muted">{order.customer?.phone || "未留电话"}</small></td>
              <td>{order.items.map((item) => <div key={item.product_id} className="mini-order-line">{item.brand} {item.name} · {item.capacity} × {item.quantity}<small className="block muted">¥{Number(item.unit_price).toFixed(2)} / 件</small></div>)}</td>
              <td>{order.address}{order.note && <small className="block muted">备注：{order.note}</small>}</td>
              <td><b>¥{Number(order.total).toFixed(2)}</b></td>
              <td><span className={`delivery-state ${order.status === "已确认" ? "done" : order.status !== "待商家确认" ? "cancelled" : ""}`}>{order.status}</span></td>
              <td>{order.status === "待商家确认" ? <div className="row-actions"><button className="row-action" onClick={() => confirmOrder(order)}><Check size={14} /> 确认并出库</button><button className="row-action danger-action" onClick={() => rejectOrder(order)}>拒绝</button></div> : <span className="muted">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!rows.length && <Empty icon={ClipboardList} title="没有符合条件的订单" detail="顾客提交小程序订单后会显示在这里。" />}
      </div>
    </section>
  );
}
