import { Monitor, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Empty, formatDate, money } from "../../components/UI";
import { matchesSearch } from "../../utils/search";

export default function ComputerOrderPage({ orders, openModal }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => orders.filter(order => matchesSearch(
    `${order.order_no} ${order.customer?.name} ${order.customer?.phone} ${order.product?.brand} ${order.product?.name} ${order.operator}`, query,
  )), [orders, query]);
  const total = rows.reduce((sum, order) => sum + Number(order.total), 0);
  return <section className="panel table-panel">
    <div className="panel-heading"><div><span className="section-kicker">COMPUTER ORDERS</span><h2>电脑订单</h2><p>记录电脑开单、无需配送的订单 · 已计入销售明细 · 每 5 秒自动更新</p></div>
      <button className="primary-btn" onClick={() => openModal("computer-sale")}><Plus size={17} /> 新建电脑订单</button>
    </div>
    <div className="table-tools"><label className="searchbox"><Search size={16} /><input aria-label="搜索电脑订单" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索订单、客户、手机号或商品" /></label><span className="result-count">{rows.length} 笔 · 合计 {money(total)}</span></div>
    <div className="table-scroll"><table><thead><tr><th>订单号</th><th>客户 / 手机号</th><th>商品</th><th>数量</th><th>单价</th><th>金额</th><th>下单时间</th><th>来源 / 交付</th><th>经办人</th><th>备注</th></tr></thead>
      <tbody>{rows.map(order => <tr key={order.id}>
        <td><b>{order.order_no}</b><small className="block muted">{order.status}</small></td>
        <td>{order.customer?.name || "—"}<small className="block muted">{order.customer?.phone || "—"}</small></td>
        <td>{order.product?.brand} {order.product?.name}<small className="block muted">{order.product?.capacity}</small></td>
        <td>{order.quantity}</td><td>{money(order.unit_price)}</td><td className="price-strong">{money(order.total)}</td>
        <td>{formatDate(order.created_at)}</td><td>电脑订单<small className="block muted">无需配送</small></td><td>{order.operator}</td><td className="muted">{order.note || "—"}</td>
      </tr>)}</tbody></table>
      {!rows.length && <Empty icon={Monitor} title="暂无匹配的电脑订单" detail="点击新建电脑订单，记录无需配送的销售。" />}
    </div>
  </section>;
}
