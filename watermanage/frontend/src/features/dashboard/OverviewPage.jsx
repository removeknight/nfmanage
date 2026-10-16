import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  Package,
  Plus,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import Activity from "../../components/Activity";
import ProductVisual from "../../components/ProductVisual";
import { money } from "../../components/UI";

const inventoryFilters = [
  ["attention", "缺货 / 偏低"],
  ["out", "缺货"],
  ["low", "库存偏低"],
  ["normal", "正常"],
  ["all", "全部"],
];

export default function OverviewPage({
  data,
  products,
  stockProducts,
  transactions,
  openModal,
  setPage,
}) {
  const [inventoryFilter, setInventoryFilter] = useState("attention");
  const lowStock = products.filter(
    (product) => product.stock <= product.warning_stock,
  );
  const balance =
    data.inventory_balance ??
    stockProducts.reduce(
      (total, product) =>
        total + product.stock * Number(product.average_cost || 0),
      0,
    );
  const inventory = useMemo(() => {
    const filtered = products.filter((product) => {
      const low = product.stock <= product.warning_stock;
      if (inventoryFilter === "attention") return low;
      if (inventoryFilter === "out") return product.stock === 0;
      if (inventoryFilter === "low") return product.stock > 0 && low;
      if (inventoryFilter === "normal") return !low;
      return true;
    });
    return filtered;
  }, [products, inventoryFilter]);

  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow">TODAY · 经营概况</div>
          <h1>
            早上好，赵店长 <span className="wave">☀️</span>
          </h1>
          <p>来看看店铺今天的经营情况。</p>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          icon={CircleDollarSign}
          tone="blue"
          label="今日销售额"
          value={money(data.sales_today)}
          note="实时统计 · 今日累计"
          trend="经营中"
          onClick={() => setPage("销售明细")}
        />
        <Stat
          icon={Truck}
          tone="orange"
          label="待配送订单"
          value={data.pending_deliveries ?? "—"}
          suffix="单"
          note="及时安排配送"
          trend={data.pending_deliveries ? "待处理" : "已清空"}
          attention={Number(data.pending_deliveries) > 0}
          onClick={() => setPage("配送订单")}
        />
        <Stat
          icon={Boxes}
          tone="green"
          label="在售商品"
          value={products.length}
          suffix="种"
          note={`${lowStock.length} 个缺货或低库存`}
          trend={lowStock.length ? "需关注" : "库存正常"}
          onClick={() => setPage("商品库存")}
        />
        <Stat
          icon={TrendingUp}
          tone="purple"
          label="今日出库"
          value={data.units_today ?? "—"}
          suffix="件"
          note="销售商品总数量"
          trend="持续更新"
          onClick={() => setPage("销售明细")}
        />
      </div>
      <section className="quick-actions-strip" aria-label="快捷操作">
        <Quick
          icon={ArrowUpFromLine}
          tint="orange"
          label="新建销售单"
          detail="记录销售并安排配送"
          onClick={() => openModal("sale")}
        />
        <Quick
          icon={ArrowDownToLine}
          tint="blue"
          label="采购入库"
          detail="登记采购并更新均价"
          onClick={() => openModal("purchase")}
        />
        <Quick
          icon={Users}
          tint="green"
          label="新增客户"
          detail="维护常用客户"
          onClick={() => openModal("customer")}
        />
        <Quick
          icon={Package}
          tint="purple"
          label="新增商品"
          detail="添加商品品项"
          onClick={() => openModal("product")}
        />
      </section>
      <section className="panel inventory-panel merged-inventory">
        <div className="panel-heading inventory-heading">
          <div>
            <span className="section-kicker">INVENTORY OVERVIEW</span>
            <h2>库存概览与关注商品</h2>
            <p>优先显示缺货和库存偏低商品；均价采用加权移动平均法</p>
          </div>
          <div className="inventory-balance">
            <small>当前库存成本余额</small>
            <b>{money(balance)}</b>
          </div>
          <button className="text-action" onClick={() => setPage("商品库存")}>
            全部商品 <ArrowUpRight size={15} />
          </button>
        </div>
        <div
          className="inventory-filter-tabs"
          role="tablist"
          aria-label="库存状态筛选"
        >
          {inventoryFilters.map(([key, label]) => (
            <button
              key={key}
              className={inventoryFilter === key ? "active" : ""}
              onClick={() => setInventoryFilter(key)}
            >
              {label}
              <b>
                {key === "attention"
                  ? lowStock.length
                  : key === "out"
                    ? products.filter((p) => p.stock === 0).length
                    : key === "low"
                      ? products.filter(
                          (p) => p.stock > 0 && p.stock <= p.warning_stock,
                        ).length
                      : key === "normal"
                        ? products.filter((p) => p.stock > p.warning_stock)
                            .length
                        : products.length}
              </b>
            </button>
          ))}
        </div>
        <div className="inventory-list">
          {inventory.map((product) => (
            <div className="inventory-row" key={product.id}>
              <ProductVisual item={product} size="small" />
              <div className="inv-name">
                <b>
                  {product.brand} {product.name}
                </b>
                <small>
                  {product.category} · {product.capacity}
                </small>
              </div>
              <div className="inv-stock">
                <b>{product.stock}</b>
                <small>库存</small>
              </div>
              <div className="inv-cost">
                <b>{money(product.average_cost)}</b>
                <small>当前均价</small>
              </div>
              <div
                className={`stock-state ${product.stock <= product.warning_stock ? "danger" : ""}`}
              >
                <i />
                {product.stock === 0
                  ? "缺货"
                  : product.stock <= product.warning_stock
                    ? "库存偏低"
                    : "正常"}
              </div>
            </div>
          ))}
          {!inventory.length && (
            <div className="inventory-empty">当前筛选下没有商品。</div>
          )}
        </div>
        <div className="panel-footer">
          <span>库存成本余额按所有商品库存数量 × 当前加权均价汇总</span>
          <span>{inventory.length} 个品项</span>
        </div>
      </section>
      <div className="bottom-grid">
        <section className="panel recent-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-kicker">LATEST ACTIVITY</span>
              <h2>最近动态</h2>
            </div>
            <button className="text-action" onClick={() => setPage("操作日志")}>
              查看全部 <ArrowUpRight size={15} />
            </button>
          </div>
          <Activity rows={transactions.slice(0, 5)} />
        </section>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  note,
  trend,
  suffix,
  attention,
  onClick,
}) {
  return (
    <button
      className={`stat-card stat-card-link ${attention ? "attention" : ""}`}
      onClick={onClick}
    >
      <div className="stat-top">
        <span className={`stat-icon ${tone}`}>
          <Icon size={19} />
        </span>
        <span className="stat-trend">
          <i />
          {trend}
        </span>
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        <small>{suffix}</small>
      </div>
      <div className="stat-note">{note}</div>
    </button>
  );
}

function Quick({ icon: Icon, tint, label, detail, onClick }) {
  return (
    <button className="quick-item" onClick={onClick}>
      <span className={`quick-icon ${tint}`}>
        <Icon size={19} />
      </span>
      <span>
        <b>{label}</b>
        <small>{detail}</small>
      </span>
      <Plus size={16} className="quick-plus" />
    </button>
  );
}
