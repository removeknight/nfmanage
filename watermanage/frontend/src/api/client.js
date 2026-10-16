async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "操作失败，请稍后重试");
  }
  return response.json();
}

const send = (path, body, method = "POST") =>
  request(path, { method, body: JSON.stringify(body) });
export const api = {
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
  customers: () => request("/api/customers"),
  deliveries: () => request("/api/deliveries"),
  transactions: () => request("/api/transactions"),
  sales: () => request("/api/sales"),
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
