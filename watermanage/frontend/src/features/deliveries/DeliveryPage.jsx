import { Clock3, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { Empty, formatDate } from "../../components/UI";
import { matchesSearch } from "../../utils/search";

export default function DeliveryPage({ deliveries, updateDelivery }) {
  const [operator, setOperator] = useState("管理员");
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [query, setQuery] = useState("");
  const customers = [
    ...new Map(
      deliveries
        .map((row) => [row.customer?.id, row.customer])
        .filter(([id]) => id),
    ).values(),
  ];
  const products = [
    ...new Map(
      deliveries
        .map((row) => [row.product?.id, row.product])
        .filter(([id]) => id),
    ).values(),
  ];
  const rows = useMemo(
    () =>
      deliveries.filter(
        (row) =>
          (!customerId || String(row.customer_id) === customerId) &&
          (!productId || String(row.product_id) === productId) &&
          matchesSearch(
            `${row.customer?.name} ${row.product?.brand} ${row.product?.name} ${row.product?.capacity} ${row.address}`,
            query,
          ),
      ),
    [deliveries, customerId, productId, query],
  );
  const pending = deliveries.filter(
    (row) => row.status === "待配送" || row.status === "配送中",
  ).length;
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">DELIVERY BOARD</span>
          <h2>配送订单</h2>
          <p>按客户和商品筛选订单，并查看完整配送时间</p>
        </div>
        <label className="operator-inline">
          <span>操作人</span>
          <input
            value={operator}
            onChange={(event) => setOperator(event.target.value)}
            aria-label="配送操作人"
          />
        </label>
        <span className="pending-pill">
          <Clock3 size={14} /> {pending} 单待处理
        </span>
      </div>
      <div className="table-tools filter-tools">
        <label className="searchbox">
          <Search size={16} />
          <input
            placeholder="搜索客户、商品或地址（支持拼音首字母）"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className="period-select"
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">全部客户</option>
          {customers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="period-select"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        >
          <option value="">全部商品</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.brand} {item.name} · {item.capacity}
            </option>
          ))}
        </select>
        <span className="result-count">{rows.length} 单</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>配送单</th>
              <th>客户</th>
              <th>商品</th>
              <th>数量</th>
              <th>配送地址</th>
              <th>下单时间</th>
              <th>配送完成时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <b className="muted"># {String(row.id).padStart(5, "0")}</b>
                </td>
                <td>{row.customer?.name || "—"}</td>
                <td>
                  {row.product?.brand} {row.product?.name}
                  <small className="block muted">{row.product?.capacity}</small>
                </td>
                <td>{row.quantity}</td>
                <td>{row.address || "—"}</td>
                <td>{formatDate(row.created_at)}</td>
                <td>{row.completed_at ? formatDate(row.completed_at) : "—"}</td>
                <td>
                  <span
                    className={`delivery-state ${row.status === "已完成" ? "done" : row.status === "配送中" ? "moving" : row.status === "已取消" ? "cancelled" : ""}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td>
                  {row.status === "待配送" ? (
                    <div className="row-actions">
                      <button
                        className="row-action"
                        onClick={() =>
                          updateDelivery(row.id, "配送中", operator)
                        }
                      >
                        开始配送
                      </button>
                      <button
                        className="row-action danger-action"
                        onClick={() =>
                          updateDelivery(row.id, "已取消", operator)
                        }
                      >
                        取消
                      </button>
                    </div>
                  ) : row.status === "配送中" ? (
                    <div className="row-actions">
                      <button
                        className="row-action"
                        onClick={() =>
                          updateDelivery(row.id, "已完成", operator)
                        }
                      >
                        完成配送
                      </button>
                      <button
                        className="row-action danger-action"
                        onClick={() =>
                          updateDelivery(row.id, "已取消", operator)
                        }
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <Empty
            icon={Truck}
            title="没有匹配的配送订单"
            detail="调整客户、商品或关键词后再试。"
          />
        )}
      </div>
    </section>
  );
}
