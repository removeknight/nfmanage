// Keep the exact submission across timeouts, app restarts and token renewal.
function storageKey() {
  const data = getApp().globalData
  if (!data.customer) throw new Error('请先登录后再提交订单')
  return `checkout:${data.authScope}:${data.customer.id}`
}
function pendingOrder() {
  if (!getApp().globalData.customer) return null
  return wx.getStorageSync(storageKey()) || null
}
function rememberOrder(payload) {
  const pending = { ...payload, request_key: `mini-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` }
  wx.setStorageSync(storageKey(), pending)
  return pending
}
function forgetOrder(key) {
  const pending = pendingOrder()
  if (pending && pending.request_key === key) wx.removeStorageSync(storageKey())
}
function sameItems(a, b) {
  const normalized = items => JSON.stringify(items.map(item => [Number(item.product_id), Number(item.quantity)]).sort((x, y) => x[0] - y[0]))
  return normalized(a) === normalized(b)
}
module.exports = { pendingOrder, rememberOrder, forgetOrder, sameItems }
