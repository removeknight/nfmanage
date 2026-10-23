const { readingPage } = require('../../utils/reading')
const { request, formatDate, saveCustomer } = require('../../utils/api')
const { startPolling, stopPolling, syncCoupons, markCouponsRead } = require('../../utils/polling')
const { openLegal, contactMerchant } = require('../../utils/legal')
readingPage({
  data: { customer: null, avatarText: '水', coupons: [], displayedCoupons: [], activeStatus: '可使用', statuses: ['可使用', '已使用', '已过期'], availableCount: 0, loading: false, contactPhone: '13324205796' },
  onShow() {
    this._readCouponsOnEntry = true
    markCouponsRead()
    this.loadContact()
    startPolling(this, this.load)
  },
  onTabItemTap() { markCouponsRead() },
  onHide() { stopPolling(this) },
  onUnload() { stopPolling(this) },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load(quiet = false) {
    if (this._loadingMe) return
    const app = getApp()
    this.setData({ customer: app.globalData.customer, avatarText: app.globalData.customer ? app.globalData.customer.name.slice(0, 1) : '水' })
    if (!app.globalData.miniToken) { this.setData({ coupons: [], displayedCoupons: [], availableCount: 0 }); return }
    this._loadingMe = true
    const version = this._viewVersion
    if (!quiet) this.setData({ loading: true })
    try {
      const [customer, raw] = await Promise.all([request('/api/mini/me'), request('/api/mini/coupons')])
      if (!this._pollVisible || version !== this._viewVersion) return
      saveCustomer(customer)
      if (customer.auth_provider === 'mock' && !wx.getStorageSync('mockDeviceKey')) {
        const device = await request('/api/mini/mock-device', { method: 'POST' })
        wx.setStorageSync('mockDeviceKey', device.device_key)
      }
      const readOnEntry = this._readCouponsOnEntry
      if (readOnEntry) {
        markCouponsRead(raw)
        this._readCouponsOnEntry = false
      }
      syncCoupons(raw, quiet && !readOnEntry)
      const coupons = raw.map(coupon => ({ ...coupon, amountText: Number(coupon.amount).toFixed(2), expiresText: formatDate(coupon.expires_at) }))
      this.setData({ customer, avatarText: customer.name.slice(0, 1), coupons, availableCount: coupons.filter(c => c.status === '可使用').length })
      this.filterCoupons()
    } catch (error) {
      this.setData({ customer: app.globalData.customer })
      if (!app.globalData.miniToken) this.setData({ coupons: [], displayedCoupons: [], availableCount: 0 })
      if (!quiet) wx.showToast({ title: error.message, icon: 'none' })
    }
    finally { this._loadingMe = false; if (version === this._viewVersion) this.setData({ loading: false }) }
  },
  selectStatus(event) { this.setData({ activeStatus: event.currentTarget.dataset.status }); this.filterCoupons() },
  filterCoupons() { this.setData({ displayedCoupons: this.data.coupons.filter(coupon => coupon.status === this.data.activeStatus) }) },
  goProfile() { wx.navigateTo({ url: '/pages/profile/profile' }) },
  async loadContact() {
    try { const legal = await request('/api/mini/legal'); this.setData({ contactPhone: legal.contact_phone }) } catch (_) {}
  },
  readPrivacy() { openLegal('privacy') },
  readTerms() { openLegal('terms') },
  contact() { contactMerchant(this.data.contactPhone) },
  goReading() { wx.navigateTo({ url: '/pages/reading/reading' }) },
  goOrders() {
    if (!getApp().globalData.miniToken) return this.goProfile()
    wx.navigateTo({ url: '/pages/orders/orders' })
  },
  goShop() { wx.switchTab({ url: '/pages/index/index' }) },
  goMerchant() { wx.navigateTo({ url: '/pages/merchant/home/home' }) },
})
