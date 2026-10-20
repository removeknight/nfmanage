function stopPolling(page) {
  page._pollVisible = false
  page._viewVersion = (page._viewVersion || 0) + 1
  if (page._pollTimer) clearInterval(page._pollTimer)
  page._pollTimer = null
}
function startPolling(page, action) {
  stopPolling(page)
  page._pollVisible = true
  action.call(page, false)
  page._pollTimer = setInterval(() => {
    if (page._pollVisible && !page.data.acting && !page.data.submitting) action.call(page, true)
  }, 5000)
}
function storedIds(key) {
  const value = wx.getStorageSync(key)
  return Array.isArray(value) ? value : []
}
function markCouponsRead(coupons) {
  const app = getApp(), customer = app.globalData.customer
  if (customer) {
    const readKey = `miniCouponRead:${customer.id}`, unreadKey = `miniCouponUnread:${customer.id}`
    const known = coupons ? coupons.map(coupon => coupon.id) :
      app.globalData.couponCustomerId === customer.id ? app.globalData.couponIds || [] : []
    wx.setStorageSync(readKey, [...new Set([...storedIds(readKey), ...storedIds(unreadKey), ...known])])
    wx.setStorageSync(unreadKey, [])
  }
  wx.removeTabBarBadge({ index: 1 })
}
function syncCoupons(coupons, notify) {
  const app = getApp()
  const customer = app.globalData.customer
  if (!customer) { wx.removeTabBarBadge({ index: 1 }); return }
  const previous = app.globalData.couponCustomerId === customer.id ? app.globalData.couponIds : null
  const added = previous ? coupons.filter(coupon => !previous.includes(coupon.id) && coupon.status === '可使用') : []
  app.globalData.couponCustomerId = customer.id
  app.globalData.couponIds = coupons.map(coupon => coupon.id)
  const read = new Set(storedIds(`miniCouponRead:${customer.id}`))
  const unreadKey = `miniCouponUnread:${customer.id}`
  const unread = new Set(storedIds(unreadKey).filter(id => !read.has(id)))
  // Polling may add unread reminders. Only an explicit visit marks them as read.
  coupons.forEach(coupon => {
    if (coupon.status === '可使用' && !read.has(coupon.id)) unread.add(coupon.id)
  })
  wx.setStorageSync(unreadKey, [...unread])
  const count = unread.size
  if (count) wx.setTabBarBadge({ index: 1, text: count > 99 ? '99+' : String(count) })
  else wx.removeTabBarBadge({ index: 1 })
  if (notify && added.length) wx.showToast({ title: `收到 ${added.length} 张新优惠券`, icon: 'none' })
}
module.exports = { startPolling, stopPolling, syncCoupons, markCouponsRead }
