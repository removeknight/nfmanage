import { useCallback, useEffect, useRef, useState } from "react";
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
import MiniOrderPage from "./features/orders/MiniOrderPage";
import ComputerOrderPage from "./features/orders/ComputerOrderPage";
import CouponPage from "./features/coupons/CouponPage";
import PrivacyPage from "./features/privacy/PrivacyPage";
import { useAutoRefresh } from "./utils/useAutoRefresh";

const initialData = {
  dashboard: {},
  products: [],
  inactiveProducts: [],
  customers: [],
  deliveries: [],
  transactions: [],
  logs: [],
  sales: [],
  miniOrders: [],
  computerOrders: [],
};
function formValues(event) {
  return Object.fromEntries(new FormData(event.currentTarget).entries());
}

function AdminApp({ account, onLogout }) {
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
  const requestVersion = useRef(0);
  const knownOrderIds = useRef(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("watermanage-theme", theme);
  }, [theme]);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const [
      dashboard,
      products,
      inactiveProducts,
      customers,
      deliveries,
      transactions,
      logs,
      sales,
      computerOrders,
    ] = await Promise.all([
      api.dashboard(),
      api.products(),
      api.products(false),
      api.customers(),
      api.deliveries(),
      api.transactions(),
      api.logs(),
      api.sales(),
      api.computerOrders(),
    ]);
    const miniOrders = await api.miniOrders();
    if (version !== requestVersion.current) return;
    if (knownOrderIds.current) {
      const added = miniOrders.filter(order => !knownOrderIds.current.has(order.id));
      if (added.length) setToast(`收到 ${added.length} 笔小程序新订单，请及时安排提货`);
    }
    knownOrderIds.current = new Set(miniOrders.map(order => order.id));
    setData({
      dashboard,
      products,
      inactiveProducts,
      customers,
      deliveries,
      transactions,
      logs,
      sales,
      miniOrders,
      computerOrders,
    });
  }, []);
  useAutoRefresh(refresh);
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
    const isSale = modal === "sale" || modal === "computer-sale";
    const deliveryField =
      event.currentTarget.elements.namedItem("create_delivery");
    if (isSale) body.create_delivery = modal === "computer-sale" ? false : deliveryField.checked;
    for (const key of ["product_id", "quantity", "unit_price"])
      if (body[key] !== undefined) body[key] = Number(body[key]);
    if (body.customer_id) body.customer_id = Number(body.customer_id);
    const action = modal.startsWith("purchase")
      ? api.purchase(body)
      : isSale
        ? api.sale(body)
        : api.adjustPrice(body);
    const message = modal.startsWith("purchase")
      ? "采购入库成功"
      : isSale
        ? body.create_delivery ? "开单成功，已生成配送任务" : "电脑订单已保存，无需配送"
        : "售价已调整";
    const keepOpen = modal.startsWith("purchase") || isSale;
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
  async function cancelMiniOrder(order) {
    if (!window.confirm(`取消订单 ${order.order_no}？将恢复库存和所用优惠券，并冲销销售金额。优惠券保留原有效期。`)) return;
    try {
      await api.cancelMiniOrder(order.id);
      await refresh();
      setToast("订单已取消，库存和优惠券已退回");
    } catch (error) {
      setToast(error.message);
    }
  }
  async function saveMerchantRole(id, role) {
    await api.setMerchantRole(id, role);
    await refresh();
    setToast(role === "customer" ? "商家权限已停用" : "商家权限已更新，小程序将自动同步");
  }
  function productImageSaved(result, message) {
    const update = rows => rows.map(item => item.id === result.id ? { ...item, image_url: result.image_url } : item);
    setData(current => ({ ...current, products: update(current.products), inactiveProducts: update(current.inactiveProducts) }));
    setToast(message);
    refresh().catch(() => setToast(`${message}，列表刷新失败，请稍后刷新页面`));
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
        imageSaved={productImageSaved}
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
        account={account}
        saveMerchantRole={saveMerchantRole}
      />
    ),
    配送订单: (
      <DeliveryPage
        deliveries={data.deliveries}
        updateDelivery={updateDelivery}
      />
    ),
    小程序订单: (
      <MiniOrderPage orders={data.miniOrders} cancelOrder={cancelMiniOrder} refresh={refresh} />
    ),
    电脑订单: <ComputerOrderPage orders={data.computerOrders} openModal={openModal} />,
    优惠券管理: <CouponPage />,
    隐私与联系: <PrivacyPage />,
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
          : modal === "computer-sale"
            ? "新建电脑订单（无需配送）"
          : modal === "sale"
            ? "新建销售单"
            : "调整销售单价";
  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        setPage={setPage}
        pending={data.dashboard.pending_deliveries}
        miniPending={data.miniOrders.filter((order) => order.status === "待提货").length}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main className="main">
        <div className="admin-account"><span>{account.name} · {account.role_label}</span><button type="button" onClick={onLogout}>退出登录</button></div>
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

export default function App() {
  const [account, setAccount] = useState(null);
  const [checking, setChecking] = useState(!!sessionStorage.getItem("adminToken"));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const expired = () => { setAccount(null); setError("登录已失效，请重新获取电脑登录码"); };
    window.addEventListener("admin-session-expired", expired);
    if (sessionStorage.getItem("adminToken")) api.me().then(setAccount).catch(e => setError(e.message)).finally(() => setChecking(false));
    return () => window.removeEventListener("admin-session-expired", expired);
  }, []);
  async function login(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await api.login(code.trim());
      sessionStorage.setItem("adminToken", result.token);
      setAccount(result.customer); setCode("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    try { await api.logout(); } catch { /* Local logout still completes offline. */ }
    sessionStorage.removeItem("adminToken"); setAccount(null);
  }
  if (checking) return <div className="admin-login"><p>正在恢复登录…</p></div>;
  if (account) return <AdminApp account={account} onLogout={logout} />;
  return <div className="admin-login"><form onSubmit={login} className="admin-login-card">
    <span className="admin-login-brand">农丰水站</span><h1>商家后台</h1>
    <p>请在小程序「我的 → 商家工作台」获取电脑登录码。</p>
    <label htmlFor="admin-code">一次性登录码</label>
    <input id="admin-code" value={code} onChange={e => setCode(e.target.value)} placeholder="输入 12 位登录码" autoComplete="off" maxLength={32} required />
    {error && <p className="admin-login-error" role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? "正在登录…" : "登录后台"}</button>
    <p className="admin-login-help">首位店主由服务器管理员指定，副店长和店员由后台「客户管理」授权。店主及副店长的电脑登录码 5 分钟内有效，登录后可使用 8 小时。</p>
  </form></div>;
}
