import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpDown,
  Plus,
  Search,
  RotateCcw,
} from "lucide-react";
import ProductVisual from "../../components/ProductVisual";
import ProductImageDialog from "./ProductImageDialog";
import { money } from "../../components/UI";
import { matchesSearch } from "../../utils/search";

const fields = [
  ["name", "商品名称"],
  ["brand", "品牌"],
  ["category", "品类"],
  ["capacity", "容量规格"],
  ["package_type", "包装"],
  ["stock", "当前库存"],
  ["average_cost", "加权均价"],
  ["sell_price", "销售单价"],
  ["stock_status", "库存状态"],
];

export default function ProductPage({
  products,
  inactiveProducts,
  reactivateProduct,
  query,
  setQuery,
  openModal,
  deactivateProduct,
  fetchPage,
  imageSaved,
}) {
  const [sort, setSort] = useState({ key: "name", direction: 1 });
  const [statusView, setStatusView] = useState("active");
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState({
    items: [],
    total: 0,
    page_size: 10,
  });
  const [loading, setLoading] = useState(false);
  const [imageProduct, setImageProduct] = useState(null);
  const source = statusView === "active" ? products : inactiveProducts;
  const matchedIds = useMemo(
    () =>
      source
        .filter((product) =>
          matchesSearch(
            `${product.name} ${product.brand} ${product.category} ${product.capacity} ${product.package_type}`,
            query,
          ),
        )
        .map((product) => product.id),
    [source, query],
  );
  useEffect(() => {
    let current = true;
    const active = statusView === "active";
    const hasQuery = query.trim().length > 0;
    if (hasQuery && !matchedIds.length) {
      setPageData({ items: [], total: 0, page, page_size: 10 });
      return () => {
        current = false;
      };
    }
    setLoading(true);
    fetchPage({
      active,
      page,
      pageSize: 10,
      sortBy: sort.key,
      sortDir: sort.direction === 1 ? "asc" : "desc",
      ids: hasQuery ? matchedIds : undefined,
    })
      .then((result) => {
        if (current) setPageData(result);
      })
      .catch(() => {
        if (current) setPageData({ items: [], total: 0, page_size: 10 });
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [fetchPage, matchedIds, page, query, sort, statusView]);
  const matches = pageData.items;
  function changeSort(key) {
    setPage(1);
    setSort((current) => ({
      key,
      direction: current.key === key ? -current.direction : 1,
    }));
  }
  return (
    <><section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">PRODUCT CATALOG</span>
          <h2>商品与库存</h2>
          <p>管理品牌、规格、库存和销售参考价</p>
        </div>
        {statusView === "active" && (
          <div className="heading-actions">
            <button
              className="secondary-btn"
              onClick={() => openModal("purchase")}
            >
              <ArrowDownToLine size={16} />
              采购入库
            </button>
            <button
              className="primary-btn"
              onClick={() => openModal("product")}
            >
              <Plus size={17} />
              新增商品
            </button>
          </div>
        )}
      </div>
      <div className="product-view-tabs" role="tablist" aria-label="商品状态">
        <button
          className={statusView === "active" ? "active" : ""}
          onClick={() => {
            setPage(1);
            setStatusView("active");
          }}
        >
          在售商品 <b>{products.length}</b>
        </button>
        <button
          className={statusView === "inactive" ? "active" : ""}
          onClick={() => {
            setPage(1);
            setStatusView("inactive");
          }}
        >
          已下架 <b>{inactiveProducts.length}</b>
        </button>
      </div>
      <div className="table-tools">
        <label className="searchbox">
          <Search size={16} />
          <input
            placeholder="跨字段搜索品牌、品名、品类、容量或包装"
            value={query}
            onChange={(event) => {
              setPage(1);
              setQuery(event.target.value);
            }}
          />
        </label>
        <span className="result-count">
          共 {pageData.total} 个{statusView === "active" ? "在售" : "下架"}商品
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {fields.map(([key, label]) => (
                <th key={key}>
                  <button
                    className="sort-heading"
                    onClick={() => changeSort(key)}
                  >
                    {label}
                    <ArrowUpDown size={13} />
                    {sort.key === key && (
                      <span>{sort.direction === 1 ? "↑" : "↓"}</span>
                    )}
                  </button>
                </th>
              ))}
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="table-product">
                    <ProductVisual item={product} size="small" />
                    <b>{product.name}</b>
                  </div>
                </td>
                <td>{product.brand}</td>
                <td>
                  <span className="category-chip">{product.category}</span>
                </td>
                <td>{product.capacity}</td>
                <td>{product.package_type}</td>
                <td>
                  <b>{product.stock}</b> <small className="muted">件</small>
                </td>
                <td className="price-strong">{money(product.average_cost)}</td>
                <td>{money(product.sell_price)}</td>
                <td>
                  <span
                    className={`stock-state ${product.stock <= product.warning_stock ? "danger" : ""}`}
                  >
                    <i />
                    {product.stock === 0
                      ? "缺货"
                      : product.stock <= product.warning_stock
                        ? "库存偏低"
                        : "正常"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="row-action" onClick={() => setImageProduct(product)}>设置图片</button>
                    {statusView === "active" ? (
                      <>
                        <button
                          className="row-action"
                          onClick={() => openModal(`purchase-${product.id}`)}
                        >
                          快速采购
                        </button>
                        <button
                          className="row-action"
                          onClick={() => openModal(`adjust-${product.id}`)}
                        >
                          调价
                        </button>
                        <button
                          className="row-action danger-action"
                          onClick={() => deactivateProduct(product)}
                        >
                          下架
                        </button>
                      </>
                    ) : (
                      <button
                        className="row-action reactivate-action"
                        onClick={() => reactivateProduct(product)}
                      >
                        <RotateCcw size={14} />
                        重新上架
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!matches.length && (
          <p className="muted table-empty">
            {loading
              ? "正在加载商品…"
              : statusView === "active"
                ? "没有匹配的在售商品"
                : "没有已下架的商品"}
          </p>
        )}
      </div>
      <div className="pagination-bar">
        <span>{loading ? "正在加载" : `第 ${page} 页 · 每页 10 个`}</span>
        <div>
          <button
            className="secondary-btn"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => value - 1)}
          >
            上一页
          </button>
          <button
            className="secondary-btn"
            disabled={page * 10 >= pageData.total || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </div>
      </div>
      <div className="panel-footer">
        <span>库存成本按加权移动平均计算</span>
        <span>下架商品可在“已下架”中重新上架</span>
      </div>
    </section>
    {imageProduct && <ProductImageDialog product={imageProduct} close={() => setImageProduct(null)} saved={(result, message) => {
      setImageProduct(null);
      setPageData(current => ({ ...current, items: current.items.map(item => item.id === result.id ? { ...item, image_url: result.image_url } : item) }));
      imageSaved(result, message);
    }} />}</>
  );
}
