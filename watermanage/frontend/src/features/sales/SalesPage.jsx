import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatDate, money } from "../../components/UI";
import { matchesSearch } from "../../utils/search";

const dateValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const rangeFor = (days) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days + 1);
  return { start: dateValue(start), end: dateValue(end) };
};

export default function SalesPage({ sales, getOverview, showError }) {
  const [tab, setTab] = useState("detail");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");
  const [source, setSource] = useState("");
  const [range, setRange] = useState(() => rangeFor(7));
  const [overview, setOverview] = useState({
    products: [],
    brands: [],
    customers_by_quantity: [],
    customers_by_amount: [],
  });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (tab !== "overview") return;
    let alive = true;
    setLoading(true);
    getOverview(range.start, range.end)
      .then((value) => {
        if (alive) setOverview(value);
      })
      .catch((error) => showError(error.message))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, range.start, range.end, getOverview, showError, sales]);

  const rows = useMemo(() => {
    const since = period === "all" ? 0 : Date.now() - Number(period) * 86400000;
    return sales.filter(
      (row) =>
        (!source || row.source === source) &&
        new Date(row.created_at).getTime() >= since &&
        matchesSearch(
          `${row.product?.brand} ${row.product?.name} ${row.product?.category} ${row.product?.capacity} ${row.customer?.name} ${row.operator}`,
          query,
        ),
    );
  }, [sales, query, period, source]);
  const summary = rows.reduce((result, row) => {
    const category = row.product?.category || "未分类";
    result[category] ||= {
      count: 0,
      quantity: 0,
      total: 0,
      profit: 0,
      unknownCost: 0,
    };
    result[category].count += 1;
    result[category].quantity += row.quantity;
    result[category].total += Number(row.total);
    if (row.profit == null) result[category].unknownCost += 1;
    else
      result[category].profit +=
        Number(row.profit);
    return result;
  }, {});
  const total = rows.reduce((value, row) => value + Number(row.total), 0);
  const knownProfit = rows.reduce(
    (value, row) =>
      row.profit == null
        ? value
        : value +
          Number(row.profit),
    0,
  );
  const unknownCostCount = rows.filter((row) => row.profit == null).length;
  const quantity = rows.reduce((n, row) => n + row.quantity, 0);
  return (
    <>
      <div
        className="product-view-tabs sales-tabs"
        role="tablist"
        aria-label="销售报表"
      >
        <button
          className={tab === "detail" ? "active" : ""}
          onClick={() => setTab("detail")}
        >
          销售明细
        </button>
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          销售总览
        </button>
      </div>
      {tab === "overview" ? (
        <SalesOverview
          overview={overview}
          loading={loading}
          range={range}
          setRange={setRange}
        />
      ) : (
        <>
          <section className="stats-grid sales-summary-cards">
            <SummaryCard
              label="筛选净实收"
              value={money(total)}
              note={`${rows.length} 笔销售记录`}
            />
            <SummaryCard
              label="筛选总利润"
              value={money(knownProfit)}
              note={
                unknownCostCount
                  ? `${unknownCostCount} 笔历史成本未记录，未计入`
                  : "实收减销售时成本，退款反向冲减"
              }
            />
            <SummaryCard
              label="收退款净件数"
              value={
                <>
                  {quantity}
                  <small>件</small>
                </>
              }
              note="所选时间范围内"
            />
            <SummaryCard
              label="销售分类"
              value={
                <>
                  {Object.keys(summary).length}
                  <small>类</small>
                </>
              }
              note="按商品品类归类"
            />
          </section>
          <section className="panel table-panel sales-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">SALES REPORT</span>
                <h2>销售明细与分类统计</h2>
                <p>按收款／退款时间统计；未收款订单不计收入和利润，退款保留负数流水</p>
              </div>
              <select
                className="period-select"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                <option value="all">全部时间</option>
                <option value="1">近 24 小时</option>
                <option value="7">近 7 天</option>
                <option value="30">近 30 天</option>
              </select>
            </div>
            <div className="sales-category-grid">
              {Object.entries(summary)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([category, value]) => (
                  <article className="sales-category" key={category}>
                    <span>{category}</span>
                    <b>{money(value.total)}</b>
                    <small>
                      {value.quantity} 件 · {value.count} 笔
                    </small>
                    <small className="category-profit">
                      利润 {money(value.profit)}
                      {value.unknownCost
                        ? ` · ${value.unknownCost} 笔成本未记录`
                        : ""}
                    </small>
                  </article>
                ))}
              {!Object.keys(summary).length && (
                <p className="muted">所选时间范围暂无销售记录</p>
              )}
            </div>
            <div className="table-tools">
              <label className="searchbox">
                <Search size={16} />
                <input
                  placeholder="搜索商品、品牌、客户或经办人（支持拼音首字母）"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select className="period-select" aria-label="订单来源" value={source} onChange={event => setSource(event.target.value)}><option value="">全部订单来源</option><option value="offline">电脑订单</option><option value="mini">小程序</option></select>
              <span className="result-count">{rows.length} 条明细</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>收退款时间</th>
                    <th>商品</th>
                    <th>品类</th>
                    <th>客户</th>
                    <th>订单来源</th>
                    <th>交付方式</th>
                    <th>数量</th>
                    <th>销售单价</th>
                    <th>实收／退款金额</th>
                    <th>利润</th>
                    <th>经办人</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const profit =
                      row.profit == null
                        ? null
                        : Number(row.profit);
                    return (
                      <tr key={row.id}>
                        <td>{formatDate(row.created_at)}<small className="block muted">{row.receipt_kind === "refund" ? "退款冲减" : "收款入账"}</small></td>
                        <td>
                          <b>
                            {row.product?.brand} {row.product?.name}
                          </b>
                          <small className="block muted">
                            {row.product?.capacity}
                          </small>
                        </td>
                        <td>{row.product?.category || "—"}</td>
                        <td>{row.customer?.name || "—"}</td>
                        <td>{row.source_label || "电脑订单"}</td>
                        <td>{row.fulfillment_label || "—"}</td>
                        <td>{row.quantity}</td>
                        <td>{money(row.unit_price)}</td>
                        <td className="price-strong">{money(row.total)}</td>
                        <td
                          className={
                            profit == null
                              ? "muted"
                              : profit < 0
                                ? "profit-negative"
                                : "profit-positive"
                          }
                        >
                          {profit == null ? "成本未记录" : money(profit)}
                        </td>
                        <td>{row.operator}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length && (
                <p className="muted table-empty">没有符合条件的销售记录</p>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function SummaryCard({ label, value, note }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

function SalesOverview({ overview, loading, range, setRange }) {
  function choose(days) {
    setRange(rangeFor(days));
  }
  function update(key, value) {
    setRange((current) => ({ ...current, [key]: value }));
  }
  return (
    <section className="panel table-panel sales-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">LIVE SALES AGGREGATION</span>
          <h2>销售总览</h2>
          <p>按所选收退款日期范围汇总，保留电脑／小程序来源；未收款不计入</p>
        </div>
        <div className="range-presets">
          <button onClick={() => choose(1)}>最近一天</button>
          <button onClick={() => choose(7)}>最近一周</button>
          <button onClick={() => choose(30)}>最近一个月</button>
        </div>
      </div>
      <div className="sales-date-range">
        <label>
          开始日期
          <input
            type="date"
            value={range.start}
            onChange={(event) => update("start", event.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            value={range.end}
            onChange={(event) => update("end", event.target.value)}
          />
        </label>
        {loading && <span>正在汇总…</span>}
      </div>
      <div className="stats-grid sales-summary-cards">
        <SummaryCard
          label="收退款净件数"
          value={
            <>
              {overview.total_quantity || 0}
              <small>件</small>
            </>
          }
          note="所选时间范围"
        />
        <SummaryCard
          label="净实收金额"
          value={money(overview.total_amount || 0)}
          note="实际收款减退款"
        />
        <SummaryCard
          label="收退款记录数"
          value={
            <>
              {overview.order_count || 0}
              <small>笔</small>
            </>
          }
          note="销售记录数量"
        />
        <SummaryCard label="实收利润" value={money(overview.total_profit || 0)} note={overview.unknown_cost_count ? `${overview.unknown_cost_count} 笔成本未知，未计入利润` : "按入账时的历史成本计算"} />
      </div>
      <div className="ranking-grid">
        <RankTable
          title="热销商品（按件数）"
          rows={overview.products}
          name={(row) => (
            <>
              <b>
                {row.brand} {row.name}
              </b>
              <small className="block muted">
                {row.category} · {row.capacity}
              </small>
            </>
          )}
        />
        <RankTable
          title="热销品牌（按件数）"
          rows={overview.brands}
          name={(row) => <b>{row.brand}</b>}
        />
        <RankTable
          title="客户采购数量排行"
          rows={overview.customers_by_quantity}
          name={(row) => (
            <>
              <b>{row.name}</b>
              <small className="block muted">{row.kind}</small>
            </>
          )}
        />
        <RankTable
          title="客户采购金额排行"
          rows={overview.customers_by_amount}
          name={(row) => (
            <>
              <b>{row.name}</b>
              <small className="block muted">{row.kind}</small>
            </>
          )}
        />
      </div>
    </section>
  );
}

function RankTable({ title, rows = [], name }) {
  return (
    <article className="ranking-card">
      <h3>{title}</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>排名 / 名称</th>
              <th>数量</th>
              <th>金额</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id ?? row.brand ?? row.name}>
                <td>
                  <span className="rank-number">{index + 1}</span>
                  {name(row)}
                </td>
                <td>{row.quantity}</td>
                <td>{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="muted table-empty">该日期范围暂无数据</p>
        )}
      </div>
    </article>
  );
}
