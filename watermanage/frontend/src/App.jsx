import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { api } from "./api/client";
import { Modal } from "./components/UI";
import Sidebar, { Topbar } from "./layout/Sidebar";
import OverviewPage from "./features/dashboard/OverviewPage";
import ProductPage from "./features/products/ProductPage";
import CustomerPage from "./features/customers/CustomerPage";
import DeliveryPage from "./features/deliveries/DeliveryPage";
import LogPage from "./features/logs/LogPage";
import ProductForm from "./features/products/ProductForm";
import CustomerForm from "./features/customers/CustomerForm";
import TransactionForm from "./features/transactions/TransactionForm";
import SalesPage from "./features/sales/SalesPage";
import PurchasePage from "./features/purchases/PurchasePage";

const initialData = {
  dashboard: {},
  products: [],
  inactiveProducts: [],
  customers: [],
  deliveries: [],
  transactions: [],
  logs: [],
  sales: [],
};
function formValues(event) {
  return Object.fromEntries(new FormData(event.currentTarget).entries());
}

export default function App() {
  const [page, setPage] = useState("概览");
  const [data, setData] = useState(initialData);
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("watermanage-theme") || "ocean",
  );
  const [formReset, setFormReset] = useState(0);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("watermanage-theme", theme);
  }, [theme]);

  const refresh = useCallback(async () => {
    const [
      dashboard,
      products,
      inactiveProducts,
      customers,
      deliveries,
      transactions,
      logs,
      sales,
    ] = await Promise.all([
      api.dashboard(),
      api.products(),
      api.products(false),
      api.customers(),
      api.deliveries(),
      api.transactions(),
      api.logs(),
      api.sales(),
    ]);
    setData({
      dashboard,
      products,
      inactiveProducts,
      customers,
      deliveries,
      transactions,
      logs,
      sales,
    });
  }, []);
  useEffect(() => {
    refresh().catch((error) => setToast(`${error.message} · 请检查服务连接`));
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4800);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function runAction(action, success, options = {}) {
    setBusy(true);
    try {
      await action();
      if (!options.keepOpen) setModal("");
      setToast(success);
      await refresh();
      options.onSuccess?.();
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy(false);
    }
  }
  function saveProduct(event) {
    event.preventDefault();
    const body = formValues(event);
    for (const key of ["stock", "warning_stock", "average_cost", "sell_price"])
      body[key] = Number(body[key] || 0);
    runAction(() => api.createProduct(body), "商品已添加");
  }
  function saveCustomer(event) {
    event.preventDefault();
    runAction(() => api.createCustomer(formValues(event)), "客户已添加");
  }
  function saveTransaction(event) {
    event.preventDefault();
    const body = formValues(event);
    const deliveryField =
      event.currentTarget.elements.namedItem("create_delivery");
    if (modal === "sale") body.create_delivery = deliveryField.checked;
    for (const key of ["product_id", "quantity", "unit_price"])
      if (body[key] !== undefined) body[key] = Number(body[key]);
    if (body.customer_id) body.customer_id = Number(body.customer_id);
    const action = modal.startsWith("purchase")
      ? api.purchase(body)
      : modal === "sale"
        ? api.sale(body)
        : api.adjustPrice(body);
    const message = modal.startsWith("purchase")
      ? "采购入库成功"
      : modal === "sale"
        ? "开单成功，已生成配送任务"
        : "售价已调整";
    const keepOpen = modal.startsWith("purchase") || modal === "sale";
    runAction(() => action, message, {
      keepOpen,
      onSuccess: () => keepOpen && setFormReset((n) => n + 1),
    });
  }
  async function updateDelivery(id, status, operator) {
    try {
      await api.updateDelivery(id, status, operator);
      await refresh();
      setToast(status === "已取消" ? "配送订单已取消" : "配送状态已更新");
    } catch (error) {
      setToast(error.message);
    }
  }
  async function deactivateProduct(product) {
    if (
      !window.confirm(
        `确定下架「${product.brand} ${product.name}」吗？下架后不能继续销售或采购。`,
      )
    )
      return;
    try {
      await api.deactivateProduct(product.id);
      await refresh();
      setToast("商品已下架");
    } catch (error) {
      setToast(error.message);
    }
  }
  async function reactivateProduct(product) {
    try {
      await api.reactivateProduct(product.id);
      await refresh();
      setToast("商品已重新上架");
    } catch (error) {
      setToast(error.message);
    }
  }
  function openModal(name) {
    setModal(name);
    setQuery("");
  }

  const pageContent = {
    概览: (
      <OverviewPage
        data={data.dashboard}
        products={data.dashboard.inventory || data.products}
        transactions={data.transactions}
        stockProducts={[...data.products, ...data.inactiveProducts]}
        openModal={openModal}
        setPage={setPage}
      />
    ),
    商品库存: (
      <ProductPage
        products={data.products}
        fetchPage={api.productPage}
        inactiveProducts={data.inactiveProducts}
        reactivateProduct={reactivateProduct}
        query={query}
        setQuery={setQuery}
        openModal={openModal}
        deactivateProduct={deactivateProduct}
      />
    ),
    客户管理: (
      <CustomerPage
        customers={data.customers}
        query={query}
        setQuery={setQuery}
        openModal={openModal}
      />
    ),
    配送订单: (
      <DeliveryPage
        deliveries={data.deliveries}
        updateDelivery={updateDelivery}
      />
    ),
    操作日志: (
      <LogPage
        logs={data.logs}
        products={[...data.products, ...data.inactiveProducts]}
        fetchLogs={api.logs}
      />
    ),
    销售明细: (
      <SalesPage
        sales={data.sales}
        getOverview={api.salesOverview}
        showError={setToast}
      />
    ),
    采购记录: (
      <PurchasePage
        products={[...data.products, ...data.inactiveProducts]}
        fetchPurchases={api.purchases}
      />
    ),
  };
  const modalTitle =
    modal === "product"
      ? "新增商品"
      : modal === "customer"
        ? "新增常用客户"
        : modal.startsWith("purchase")
          ? "采购入库"
          : modal === "sale"
            ? "新建销售单"
            : "调整销售单价";
  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        setPage={setPage}
        pending={data.dashboard.pending_deliveries}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main className="main">
        <Topbar
          page={page}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          setPage={setPage}
          theme={theme}
          setTheme={setTheme}
        />
        {toast && (
          <div className="toast" role="alert" aria-live="assertive">
            <AlertCircle size={18} />
            {toast}
          </div>
        )}
        <div className="page-content">{pageContent[page]}</div>
      </main>
      {modal && (
        <Modal title={modalTitle} close={() => setModal("")}>
          {modal === "product" ? (
            <ProductForm
              busy={busy}
              products={[...data.products, ...data.inactiveProducts]}
              cancel={() => setModal("")}
              submit={saveProduct}
            />
          ) : modal === "customer" ? (
            <CustomerForm
              busy={busy}
              cancel={() => setModal("")}
              submit={saveCustomer}
            />
          ) : (
            <TransactionForm
              mode={modal}
              products={data.products}
              customers={data.customers}
              busy={busy}
              cancel={() => setModal("")}
              submit={saveTransaction}
              resetVersion={formReset}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
