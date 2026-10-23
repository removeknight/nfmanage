async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(sessionStorage.getItem("adminToken") ? { Authorization: `Bearer ${sessionStorage.getItem("adminToken")}` } : {}), ...options.headers },
    });
    if (!response.ok) {
      expireSession(response.status);
      const error = await response.json().catch(() => ({}));
      const failure = new Error(typeof error.detail === "string" ? error.detail : response.status === 413 ? "图片不能超过 5MB" : "操作失败，请检查填写信息后重试");
      failure.status = response.status;
      throw failure;
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，请刷新页面确认操作结果后再重试");
    throw error;
  } finally { clearTimeout(timer); }
}

function expireSession(status) {
  if (status === 401) {
    sessionStorage.removeItem("adminToken");
    window.dispatchEvent(new Event("admin-session-expired"));
  }
}

function uploadProductImage(id, file, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const stop = () => xhr.abort();
    function finish(error, result) {
      signal?.removeEventListener("abort", stop);
      if (error) reject(error); else resolve(result);
    }
    xhr.open("PUT", `/api/products/${id}/image`);
    xhr.timeout = 60000;
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    const token = sessionStorage.getItem("adminToken");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      expireSession(xhr.status);
      let body;
      try { body = JSON.parse(xhr.responseText); } catch { body = {}; }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!body.image_url) return finish(new Error("图片保存结果异常，请刷新页面确认"));
        finish(null, body);
      } else finish(new Error(body.detail || (xhr.status === 413 ? "图片被服务器大小限制拦截，请重新刷新页面后重试" : `图片上传失败（${xhr.status}），请重试`)));
    };
    xhr.onerror = () => finish(new Error("网络连接中断，请刷新列表确认图片是否已保存"));
    xhr.ontimeout = () => finish(new Error("上传等待超过 60 秒，请刷新列表确认图片是否已保存，再决定是否重试"));
    xhr.onabort = () => {
      const error = new Error("已停止等待，请刷新列表确认图片是否已保存");
      error.name = "AbortError";
      finish(error);
    };
    if (signal?.aborted) return finish(new Error("上传已停止"));
    signal?.addEventListener("abort", stop, { once: true });
    try { xhr.send(file); }
    catch { finish(new Error("无法发送图片，请检查网络后重试")); }
  });
}

const send = (path, body, method = "POST") =>
  request(path, { method, body: JSON.stringify(body) });
export const api = {
  privacySettings: () => request('/api/privacy/settings'),
  savePrivacySettings: body => send('/api/privacy/settings', body, 'PUT'),
  legalConsents: () => request('/api/privacy/consents'),
  legalDocument: (kind, version) => request(`/api/privacy/documents/${encodeURIComponent(kind)}/${encodeURIComponent(version)}`),
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
  uploadProductImage,
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
