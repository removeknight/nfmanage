const { readingPage } = require('../../utils/reading')
const { request, saveCustomer } = require('../../utils/api')
const { startPolling, stopPolling, syncCoupons } = require('../../utils/polling')
const { pendingOrder, rememberOrder, forgetOrder, sameItems } = require('../../utils/checkout')
const app = getApp()
readingPage({
  data: {
    products: [], grouped: [], categories: [], activeCategory: '全部',
    cart: {}, cartCount: 0, cartTotal: '0.00', loading: false, checkoutLines: [], customer: null,
    orderNote: '', showCheckout: false, submitting: false, hasPendingOrder: false,
    usableCoupons: [], couponOptions: ['不使用优惠券'], couponIndex: 0, selectedCouponId: null,
    discountTotal: '0.00', payableTotal: '0.00',
  },
  onShow() { this.setData({ customer: app.globalData.customer, hasPendingOrder: !!pendingOrder() }); startPolling(this, this.loadProducts) },
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
      const catalog = products.map(product => {
        const url = typeof product.image_url === 'string' ? product.image_url : ''
        const imageSrc = /^https?:\/\//i.test(url) ? url : url.startsWith('/') ? app.globalData.apiBaseUrl.replace(/\/$/, '') + url : ''
        return { ...product, imageSrc }
      })
      const categories = ['全部', ...new Set(catalog.map(product => product.category))]
      this.setData({ products: catalog, categories, activeCategory: categories.includes(this.data.activeCategory) ? this.data.activeCategory : '全部' })
      this.groupProducts(); this.updateCart(this.data.cart)
      syncCoupons(coupons, quiet)
      if (this.data.showCheckout) this.prepareCoupons(coupons, false)
    } catch (error) { if (!quiet) wx.showToast({ title: error.message, icon: 'none' }) }
    finally { this._loadingProducts = false; if (version === this._viewVersion) this.setData({ loading: false }) }
  },
  groupProducts() {
    const filtered = (this.data.activeCategory === '全部' ? this.data.products : this.data.products.filter(p => p.category === this.data.activeCategory))
      .map(product => {
        const failed = (this._failedImages || {})[product.id]
        const retry = !failed || failed.url !== product.imageSrc || Date.now() - failed.time > 30000
        return { ...product, displayImage: retry ? product.imageSrc : '' }
      })
    const grouped = [...new Set(filtered.map(p => p.category))].map(category => {
      const products = filtered.filter(p => p.category === category)
      return { category, brands: [...new Set(products.map(p => p.brand))].map(brand => ({ brand, products: products.filter(p => p.brand === brand) })) }
    })
    this.setData({ grouped })
  },
  selectCategory(event) { this.setData({ activeCategory: event.currentTarget.dataset.category }); this.groupProducts() },
  imageFailed(event) {
    const { id, src } = event.currentTarget.dataset
    this._failedImages = this._failedImages || {}
    this._failedImages[id] = { url: src, time: Date.now() }
    this.groupProducts()
  },
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
    if (!app.globalData.customer) return wx.navigateTo({ url: '/pages/profile/profile' })
    if (pendingOrder()) return this.recoverOrder()
    if (!this.data.cartCount) return
    try {
      const [coupons, customer] = await Promise.all([request('/api/mini/coupons'), request('/api/mini/me')])
      if (!this._pollVisible) return
      saveCustomer(customer)
      this.setData({ showCheckout: true, customer })
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
    if (this._orderSubmitting) return
    if (pendingOrder()) return this.recoverOrder()
    const items = Object.entries(this.data.cart).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }))
    if (!items.length) return
    let payload
    try { payload = rememberOrder({ items, fulfillment: 'pickup', note: this.data.orderNote.trim(), coupon_id: this.data.selectedCouponId }) }
    catch (_) { return wx.showToast({ title: '无法保存提交信息，请检查手机存储后重试', icon: 'none' }) }
    return this.submitOrder(payload)
  },
  async recoverOrder() {
    if (this._orderSubmitting) return
    const payload = pendingOrder()
    if (!payload) return this.setData({ hasPendingOrder: false })
    this._orderSubmitting = true
    this.setData({ submitting: true })
    try {
      const result = await request(`/api/mini/orders/submission/${encodeURIComponent(payload.request_key)}`)
      if (result.order) return this.orderSaved(result.order, payload)
      const choice = await new Promise(resolve => wx.showModal({ title: '上次订单尚未提交成功', content: '是否重试上次订单？会沿用原商品、数量、优惠券和提交编号，避免重复下单。当前购物车的改动不会加入这次重试。', confirmText: '重试原单', cancelText: '稍后处理', success: resolve, fail: () => resolve({ confirm: false }) }))
      if (choice.confirm) {
        this._orderSubmitting = false
        return await this.submitOrder(payload)
      }
    } catch (error) { wx.showModal({ title: '暂未确认订单结果', content: `${error.message}\n请稍后点击“核对上次订单”，不要另行重复下单。`, showCancel: false }) }
    finally { this._orderSubmitting = false; this.setData({ submitting: false, hasPendingOrder: !!pendingOrder() }) }
  },
  async submitOrder(payload) {
    if (this._orderSubmitting) return
    this._orderSubmitting = true
    this.setData({ submitting: true, hasPendingOrder: true })
    try {
      const order = await request('/api/mini/orders', { method: 'POST', data: payload })
      this.orderSaved(order, payload)
    } catch (error) {
      let rejected = false
      if ([400, 404, 409, 422].includes(error.status)) {
        try {
          const result = await request(`/api/mini/orders/submission/${encodeURIComponent(payload.request_key)}`)
          if (result.order) return this.orderSaved(result.order, payload)
          forgetOrder(payload.request_key)
          rejected = true
        } catch (_) { /* Keep the original key until the result can be confirmed. */ }
      }
      wx.showModal({ title: rejected ? '订单未提交' : '订单结果待确认', content: rejected ? error.message : `${error.message}\n已保留本次提交，请点击“核对上次订单”继续，避免重复下单。`, showCancel: false })
      this.loadProducts()
    } finally { this._orderSubmitting = false; this.setData({ submitting: false, hasPendingOrder: !!pendingOrder() }) }
  },
  orderSaved(order, payload) {
    forgetOrder(payload.request_key)
    const items = Object.entries(this.data.cart).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }))
    if (sameItems(items, payload.items)) this.updateCart({})
    this.setData({ showCheckout: false, hasPendingOrder: false, orderNote: '', couponIndex: 0, selectedCouponId: null })
    wx.showModal({ title: '订单已确认', content: `提货码 ${order.pickup_code}\n应付 ¥${Number(order.total).toFixed(2)} · ${order.status}\n请在到店提货时付款，可在“我的订单”中查看。`, confirmText: '查看订单', cancelText: '继续选购', success: result => { if (result.confirm) wx.navigateTo({ url: '/pages/orders/orders' }) } })
    this.loadProducts()
  },
  goMe() { wx.switchTab({ url: '/pages/me/me' }) },
})
