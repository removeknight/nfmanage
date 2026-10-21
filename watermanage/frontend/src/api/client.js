async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(sessionStorage.getItem("adminToken") ? { Authorization: `Bearer ${sessionStorage.getItem("adminToken")}` } : {}), ...options.headers },
  });
  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem("adminToken");
      window.dispatchEvent(new Event("admin-session-expired"));
    }
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || (response.status === 413 ? "图片不能超过 5MB" : "操作失败，请稍后重试"));
  }
  return response.json();
}

const send = (path, body, method = "POST") =>
  request(path, { method, body: JSON.stringify(body) });
export const api = {
  login: (code) => send("/api/access/web-login", { code }),
  me: () => request("/api/access/me"),
  logout: () => send("/api/access/logout", {}),
  dashboard: () => request("/api/dashboard"),
  products: (active = true) => request(`/api/products?active=${active}`),
  productPage: ({ active, page, pageSize, sortBy, sortDir, ids }) => {
    const params = new URLSearchParams({
      active: String(active),
      page: String(page),
      page_size: String(pageSize),
      sort_by: sortBy,
      sort_dir: sortDir,
    });
    ids?.forEach((id) => params.append("ids", String(id)));
    return request(`/api/products?${params.toString()}`);
  },
  reactivateProduct: (id) => send(`/api/products/${id}/reactivate`, {}),
  uploadProductImage: (id, file) => request(`/api/products/${id}/image`, {
    method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" },
  }),
  removeProductImage: (id) => request(`/api/products/${id}/image`, { method: "DELETE" }),
  customers: () => request("/api/customers"),
  setMerchantRole: (id, role) => send(`/api/customers/${id}/merchant-role`, { role }, "PUT"),
  deliveries: () => request("/api/deliveries"),
  transactions: () => request("/api/transactions"),
  sales: () => request("/api/sales"),
  computerOrders: () => request("/api/computer-orders"),
  miniOrders: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    return request(`/api/mini/merchant/orders${params.size ? `?${params}` : ""}`);
  },
  cancelMiniOrder: (id) => send(`/api/mini/merchant/orders/${id}/cancel`, {}),
  lookupPickup: (code) => request(`/api/mini/merchant/pickup/${encodeURIComponent(code)}`),
  pickupByPhone: (suffix) => request(`/api/mini/merchant/pickup-by-phone?phone_suffix=${encodeURIComponent(suffix)}`),
  redeemPickup: (code) => send("/api/mini/merchant/redeem", { code }),
  miniCustomers: () => request("/api/mini/merchant/customers"),
  couponSettings: () => request("/api/mini/merchant/coupon-settings"),
  saveCouponSettings: (body) => send("/api/mini/merchant/coupon-settings", body, "PUT"),
  issueCoupons: (body) => send("/api/mini/merchant/coupons", body),
  issuedCoupons: () => request("/api/mini/merchant/coupons"),
  salesOverview: (startDate, endDate) =>
    request(`/api/sales/overview?start_date=${startDate}&end_date=${endDate}`),
  purchases: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(
      ([key, value]) => value && params.set(key, value),
    );
    return request(`/api/purchases${params.size ? `?${params}` : ""}`);
  },
  logs: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(
      ([key, value]) => value && params.set(key, value),
    );
    return request(`/api/logs${params.size ? `?${params}` : ""}`);
  },
  createProduct: (body) => send("/api/products", body),
  createCustomer: (body) => send("/api/customers", body),
  purchase: (body) => send("/api/purchases", body),
  sale: (body) => send("/api/sales", body),
  adjustPrice: (body) => send("/api/adjustments", body),
  updateDelivery: (id, status, operator) =>
    send(`/api/deliveries/${id}`, { status, operator }, "PATCH"),
  deactivateProduct: (id) => send(`/api/products/${id}/deactivate`, {}),
};
