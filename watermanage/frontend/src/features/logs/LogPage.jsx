import { useEffect, useState } from "react";
import { Clock3, Search } from "lucide-react";
import { actionLabels, formatDate } from "../../components/UI";

const labels = {
  ...actionLabels,
  product_create: "新增商品",
  product_deactivate: "商品下架",
  product_reactivate: "商品重新上架",
  delivery_status: "配送状态",
};
const types = [
  ["purchase", "采购入库"],
  ["sale", "销售开单"],
  ["adjustment", "调价"],
  ["product_create", "新增商品"],
  ["product_deactivate", "商品下架"],
  ["product_reactivate", "商品重新上架"],
  ["delivery_status", "配送状态"],
];
const isoDate = (value) => {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 10);
};

export default function LogPage({ logs, products, fetchLogs }) {
  const [rows, setRows] = useState(logs);
  const [filters, setFilters] = useState(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return {
      start_date: isoDate(start),
      end_date: isoDate(today),
      kind: "",
      product_id: "",
    };
  });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    fetchLogs(filters)
      .then((result) => {
        if (current) setRows(result);
      })
      .catch(() => {
        if (current) setRows([]);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [fetchLogs, filters]);
  function change(key, value) {
    setFilters((old) => ({ ...old, [key]: value }));
  }
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">AUDIT TRAIL</span>
          <h2>操作日志</h2>
          <p>日期、操作类型和商品筛选条件会同时生效</p>
        </div>
        <span className="pending-pill">
          <Clock3 size={14} />
          {loading ? "查询中…" : `${rows.length} 条`}
        </span>
      </div>
      <div className="table-tools log-filters">
        <label>
          开始日期
          <input
            type="date"
            value={filters.start_date}
            onChange={(event) => change("start_date", event.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            value={filters.end_date}
            onChange={(event) => change("end_date", event.target.value)}
          />
        </label>
        <label>
          操作类型
          <select
            value={filters.kind}
            onChange={(event) => change("kind", event.target.value)}
          >
            <option value="">全部类型</option>
            {types.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="log-product-filter">
          <Search size={15} />
          <select
            value={filters.product_id}
            onChange={(event) => change("product_id", event.target.value)}
          >
            <option value="">全部商品</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.brand} {product.name} · {product.capacity}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作类型</th>
              <th>商品</th>
              <th>操作人</th>
              <th>变更前</th>
              <th>变更后</th>
              <th>操作说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="muted">{formatDate(row.created_at)}</td>
                <td>
                  <span className={`kind-chip ${row.kind}`}>
                    {labels[row.kind] || row.kind}
                  </span>
                </td>
                <td>
                  <b>
                    {row.product?.brand} {row.product?.name}
                  </b>
                  <small className="block muted">
                    {row.product?.capacity || "—"}
                  </small>
                </td>
                <td>{row.operator || "管理员"}</td>
                <td className="log-diff">{row.before_value || "—"}</td>
                <td className="log-diff">{row.after_value || "—"}</td>
                <td className="muted">{row.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="muted table-empty">该筛选条件下暂无操作记录</p>
        )}
      </div>
    </section>
  );
}
