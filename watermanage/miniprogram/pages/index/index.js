const { request, saveCustomer } = require('../../utils/api')
const { startPolling, stopPolling, syncCoupons } = require('../../utils/polling')
const app = getApp()
Page({
  data: {
    products: [], grouped: [], categories: [], activeCategory: '全部',
    cart: {}, cartCount: 0, cartTotal: '0.00', loading: false, checkoutLines: [], customer: null,
    checkoutAddress: '', orderNote: '', showCheckout: false, submitting: false,
    usableCoupons: [], couponOptions: ['不使用优惠券'], couponIndex: 0, selectedCouponId: null,
    discountTotal: '0.00', payableTotal: '0.00',
  },
  onShow() { this.setData({ customer: app.globalData.customer }); startPolling(this, this.loadProducts) },
  onHide() { stopPolling(this) },
  onUnload() { stopPolling(this) },
  async loadProducts(quiet = false) {
    if (this._loadingProducts) return
    this._loadingProducts = true
    const version = this._viewVersion
    if (!quiet) this.setData({ loading: true })
    try {
      const [products, coupons] = await Promise.all([request('/api/mini/products'), app.globalData.miniToken ? request('/api/mini/coupons') : Promise.resolve([])])
      if (!this._pollVisible || version !== this._viewVersion) return
      const categories = ['全部', ...new Set(products.map(product => product.category))]
      this.setData({ products, categories, activeCategory: categories.includes(this.data.activeCategory) ? this.data.activeCategory : '全部' })
      this.groupProducts(); this.updateCart(this.data.cart)
      syncCoupons(coupons, quiet)
      if (this.data.showCheckout) this.prepareCoupons(coupons, false)
    } catch (error) { if (!quiet) wx.showToast({ title: error.message, icon: 'none' }) }
    finally { this._loadingProducts = false; if (version === this._viewVersion) this.setData({ loading: false }) }
  },
  groupProducts() {
    const filtered = this.data.activeCategory === '全部' ? this.data.products : this.data.products.filter(p => p.category === this.data.activeCategory)
    const grouped = [...new Set(filtered.map(p => p.category))].map(category => {
      const products = filtered.filter(p => p.category === category)
      return { category, brands: [...new Set(products.map(p => p.brand))].map(brand => ({ brand, products: products.filter(p => p.brand === brand) })) }
    })
    this.setData({ grouped })
  },
  selectCategory(event) { this.setData({ activeCategory: event.currentTarget.dataset.category }); this.groupProducts() },
  updateField(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },
  changeQuantity(event) {
    if (!app.globalData.customer) return wx.navigateTo({ url: '/pages/profile/profile' })
    const id = String(event.currentTarget.dataset.id), delta = Number(event.currentTarget.dataset.delta)
    const product = this.data.products.find(p => String(p.id) === id)
    if (!product) return
    const cart = { ...this.data.cart }, next = (cart[id] || 0) + delta
    if (next > Math.min(product.stock, 999)) return wx.showToast({ title: `当前最多可选 ${Math.min(product.stock, 999)} 件`, icon: 'none' })
    if (next > 0) cart[id] = next
    else delete cart[id]
    this.updateCart(cart)
  },
  updateCart(cart) {
    const checkoutLines = Object.entries(cart).map(([id, quantity]) => {
      const product = this.data.products.find(p => String(p.id) === id)
      return product ? { ...product, quantity, subtotal: (Number(product.sell_price) * quantity).toFixed(2) } : null
    }).filter(Boolean)
    const cartCount = checkoutLines.reduce((sum, line) => sum + line.quantity, 0)
    const totalCents = checkoutLines.reduce((sum, line) => sum + Math.round(Number(line.subtotal) * 100), 0)
    this.setData({ cart, checkoutLines, cartCount, cartTotal: (totalCents / 100).toFixed(2) })
    this.prepareCoupons(this._checkoutCoupons || [], false)
  },
  eligibleCents(coupon) {
    return this.data.checkoutLines.reduce((sum, line) => sum +
      (coupon.usage_type !== 'large_bucket' || line.category === '大桶水' ? Math.round(Number(line.subtotal) * 100) : 0), 0)
  },
  prepareCoupons(coupons, chooseBest) {
    this._checkoutCoupons = coupons
    const previousId = this.data.selectedCouponId
    const usableCoupons = coupons.filter(coupon => coupon.status === '可使用' && this.eligibleCents(coupon) > 0)
      .map(coupon => ({ ...coupon, actualDiscountCents: Math.min(Math.round(Number(coupon.amount) * 100), this.eligibleCents(coupon)) }))
      .sort((a, b) => b.actualDiscountCents - a.actualDiscountCents || new Date(a.expires_at) - new Date(b.expires_at))
    this.setData({ usableCoupons, couponOptions: ['不使用优惠券', ...usableCoupons.map(coupon => `${coupon.title} · ${coupon.usage_label} · 减 ¥${(coupon.actualDiscountCents / 100).toFixed(2)}`)] })
    this.selectCouponIndex(chooseBest && usableCoupons.length ? 1 : usableCoupons.findIndex(coupon => coupon.id === previousId) + 1)
  },
  async openCheckout() {
    if (!this.data.cartCount) return
    if (!app.globalData.customer) return wx.navigateTo({ url: '/pages/profile/profile' })
    try {
      const coupons = await request('/api/mini/coupons')
      if (!this._pollVisible) return
      this.setData({ showCheckout: true, checkoutAddress: this.data.checkoutAddress || app.globalData.customer.address || '' })
      this.prepareCoupons(coupons, true)
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  },
  selectCoupon(event) { this.selectCouponIndex(Number(event.detail.value)) },
  selectCouponIndex(index) {
    const coupon = index > 0 ? this.data.usableCoupons[index - 1] : null
    const totalCents = Math.round(Number(this.data.cartTotal) * 100)
    const discountCents = coupon ? Math.min(Math.round(Number(coupon.amount) * 100), this.eligibleCents(coupon)) : 0
    this.setData({ couponIndex: coupon ? index : 0, selectedCouponId: coupon ? coupon.id : null,
      discountTotal: (discountCents / 100).toFixed(2), payableTotal: ((totalCents - discountCents) / 100).toFixed(2) })
  },
  cancelCheckout() { if (!this.data.submitting) this.setData({ showCheckout: false }) },
  async placeOrder() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    const items = Object.entries(this.data.cart).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }))
    try {
      const order = await request('/api/mini/orders', { method: 'POST', data: { items, fulfillment: 'pickup', address: this.data.checkoutAddress.trim(), note: this.data.orderNote.trim(), coupon_id: this.data.selectedCouponId } })
      if (this.data.checkoutAddress.trim()) saveCustomer({ ...app.globalData.customer, address: this.data.checkoutAddress.trim() })
      this.setData({ cart: {}, checkoutLines: [], cartCount: 0, cartTotal: '0.00', showCheckout: false, orderNote: '', couponIndex: 0, selectedCouponId: null })
      wx.showModal({ title: '下单成功', content: `提货码 ${order.pickup_code}\n应付 ¥${Number(order.total).toFixed(2)}\n请凭提货码到店提货，可在“我的订单”中查看。`, confirmText: '查看订单', cancelText: '继续选购', success: result => { if (result.confirm) wx.navigateTo({ url: '/pages/orders/orders' }) } })
      this.loadProducts()
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); this.loadProducts() }
    finally { this.setData({ submitting: false }) }
  },
  goMe() { wx.switchTab({ url: '/pages/me/me' }) },
})
