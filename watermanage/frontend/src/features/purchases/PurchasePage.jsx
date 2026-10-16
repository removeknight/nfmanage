import { useEffect, useMemo, useState } from "react";
import { Search, ShoppingCart } from "lucide-react";
import { Empty, formatDate, money } from "../../components/UI";
import { matchesSearch } from "../../utils/search";

const localDate = (value) => {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 10);
};
const initialRange = () => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  return {
    start_date: localDate(start),
    end_date: localDate(end),
    category: "",
  };
};

export default function PurchasePage({ products, fetchPurchases }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(initialRange);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const categories = [
    ...new Set(products.map((product) => product.category).filter(Boolean)),
  ].sort();
  useEffect(() => {
    let current = true;
    setLoading(true);
    fetchPurchases(filters)
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
  }, [fetchPurchases, filters]);
  const matches = useMemo(
    () =>
      rows.filter((row) =>
        matchesSearch(
          `${row.product?.brand} ${row.product?.name} ${row.product?.category} ${row.product?.capacity} ${row.operator} ${row.note}`,
          query,
        ),
      ),
    [rows, query],
  );
  const quantity = matches.reduce((sum, row) => sum + row.quantity, 0);
  const amount = matches.reduce((sum, row) => sum + Number(row.total), 0);
  const setFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value }));
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">PURCHASE HISTORY</span>
          <h2>入库采购记录</h2>
          <p>按时间、商品品类筛选，并实时汇总当前结果</p>
        </div>
        <span className="pending-pill">
          {loading ? "统计中…" : `${matches.length} 笔 · ${money(amount)}`}
        </span>
      </div>
      <div className="purchase-summary-cards">
        <Summary label="采购总金额" value={money(amount)} />
        <Summary label="采购数量" value={`${quantity} 件`} />
        <Summary label="采购笔数" value={`${matches.length} 笔`} />
      </div>
      <div className="table-tools purchase-filters">
        <label>
          开始日期
          <input
            type="date"
            value={filters.start_date}
            onChange={(event) => setFilter("start_date", event.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            value={filters.end_date}
            onChange={(event) => setFilter("end_date", event.target.value)}
          />
        </label>
        <label>
          商品品类
          <select
            value={filters.category}
            onChange={(event) => setFilter("category", event.target.value)}
          >
            <option value="">全部品类</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="searchbox">
          <Search size={16} />
          <input
            placeholder="搜索商品、品牌、容量或经办人"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>入库时间</th>
              <th>商品</th>
              <th>品类 / 规格</th>
              <th>数量</th>
              <th>采购单价</th>
              <th>采购金额</th>
              <th>经办人</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.created_at)}</td>
                <td>
                  <b>
                    {row.product?.brand} {row.product?.name}
                  </b>
                </td>
                <td>
                  {row.product?.category} · {row.product?.capacity}
                </td>
                <td>{row.quantity}</td>
                <td>{money(row.unit_price)}</td>
                <td className="price-strong">{money(row.total)}</td>
                <td>{row.operator}</td>
                <td>{row.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!matches.length && (
          <Empty
            icon={ShoppingCart}
            title="暂无入库采购记录"
            detail="调整时间或品类筛选，或登记新的采购入库。"
          />
        )}
      </div>
    </section>
  );
}

function Summary({ label, value }) {
  return (
    <article>
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}
