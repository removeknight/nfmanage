export const saleStorageKey = accountId => `watermanage-sale:${accountId}`;
export function pendingSale(accountId) {
  try {
    const stored = localStorage.getItem(saleStorageKey(accountId));
    return stored ? JSON.parse(stored) : null;
  } catch {
    throw new Error("无法读取上次开单信息，请检查浏览器存储后重试");
  }
}
export function rememberSale(accountId, body) {
  const key = globalThis.crypto?.randomUUID?.() || `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const payload = { ...body, request_key: key };
  // Persist before the request so reloading after a timeout cannot create another sale.
  localStorage.setItem(saleStorageKey(accountId), JSON.stringify(payload));
  return payload;
}
export function forgetSale(accountId, requestKey) {
  if (pendingSale(accountId)?.request_key === requestKey) localStorage.removeItem(saleStorageKey(accountId));
}
