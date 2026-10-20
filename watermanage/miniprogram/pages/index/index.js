const app = getApp()

Page({
  data: {
    products: [], grouped: [], categories: [], activeCategory: '全部',
    cart: {}, cartCount: 0, cartTotal: '0.00', loading: false,
    checkoutLines: [],
    customer: null, showBind: false, bindName: '', bindPhone: '', bindAddress: '',
    bindButtonText: '微信快捷绑定', bindHint: '绑定微信账号后即可下单和查看订单',
    checkoutAddress: '', orderNote: '', showCheckout: false,
  },

  onShow() {
    const customer = app.globalData.customer
    const isMockAuth = app.globalData.miniAuthMode === 'mock'
    this.setData({ customer, showBind: !customer,
      bindButtonText: isMockAuth ? '测试绑定' : '微信快捷绑定',
      bindHint: isMockAuth ? '测试模式：不会调用微信登录，可直接绑定测试账号' : '绑定微信账号后即可下单和查看订单' })
    this.loadProducts()
  },

  request(path, options = {}) {
    return new Promise((resolve, reject) => wx.request({
      url: app.globalData.apiBaseUrl + path,
      method: options.method || 'GET', data: options.data || {},
      header: { 'content-type': 'application/json', ...(app.globalData.miniToken ? { Authorization: `Bearer ${app.globalData.miniToken}` } : {}) },
      success: response => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data)
        else reject(new Error(response.data.detail || '请求失败，请稍后重试'))
      }, fail: error => {
        const reason = (error && error.errMsg) || ''
        if (reason.includes('url not in domain list')) {
          reject(new Error('小程序未配置合法请求域名：请在微信公众平台添加 HTTPS API 域名'))
        } else if (reason.toLowerCase().includes('ssl')) {
          reject(new Error('服务器 HTTPS 证书校验失败，请检查证书和域名'))
        } else {
          reject(new Error(`手机无法访问 ${app.globalData.apiBaseUrl}。请确认手机能访问该服务器；正式版需使用 HTTPS 合法域名。`))
        }
      },
    }))
  },

  async loadProducts() {
    this.setData({ loading: true })
    try {
      const products = await this.request('/api/mini/products')
      const categories = ['全部', ...new Set(products.map(product => product.category))]
      this.setData({ products, categories })
      this.groupProducts()
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
    this.setData({ loading: false })
  },

  groupProducts() {
    const filtered = this.data.activeCategory === '全部' ? this.data.products : this.data.products.filter(p => p.category === this.data.activeCategory)
    const categories = [...new Set(filtered.map(product => product.category))]
    const grouped = categories.map(category => {
      const products = filtered.filter(p => p.category === category)
      const brands = [...new Set(products.map(p => p.brand))]
      return { category, brands: brands.map(brand => ({ brand, products: products.filter(p => p.brand === brand) })) }
    })
    this.setData({ grouped })
  },

  selectCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.category })
    this.groupProducts()
  },

  updateField(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },

  async bindAccount() {
    if (!this.data.bindName.trim()) return wx.showToast({ title: '请填写称呼', icon: 'none' })
    if (!this.data.bindPhone.trim()) return wx.showToast({ title: '请填写联系电话，方便配送联系', icon: 'none' })
    wx.showLoading({ title: '正在绑定' })
    try {
      let code = ''
      if (app.globalData.miniAuthMode !== 'mock') {
        const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
        code = login.code
      }
      const result = await this.request('/api/mini/bind', { method: 'POST', data: {
        code, name: this.data.bindName.trim(), phone: this.data.bindPhone.trim(), address: this.data.bindAddress.trim(),
      } })
      app.globalData.miniToken = result.token
      app.globalData.customer = result.customer
      wx.setStorageSync('miniToken', result.token)
      wx.setStorageSync('miniCustomer', result.customer)
      this.setData({ customer: result.customer, showBind: false, checkoutAddress: result.customer.address || '' })
      wx.showToast({ title: '绑定成功' })
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
    wx.hideLoading()
  },

  changeQuantity(event) {
    if (!this.data.customer) return wx.showToast({ title: '请先绑定账号', icon: 'none' })
    const id = String(event.currentTarget.dataset.id)
    const delta = Number(event.currentTarget.dataset.delta)
    const product = this.data.products.find(p => String(p.id) === id)
    const cart = { ...this.data.cart }
    const next = (cart[id] || 0) + delta
    if (next > product.stock) return wx.showToast({ title: `可售库存 ${product.stock} 件`, icon: 'none' })
    if (next > 0) cart[id] = next
    else delete cart[id]
    this.updateCart(cart)
  },

  updateCart(cart) {
    const checkoutLines = Object.entries(cart).map(([id, quantity]) => {
      const product = this.data.products.find(p => String(p.id) === id)
      if (!product) return null
      const subtotal = Number(product.sell_price) * quantity
      return { ...product, quantity, subtotal: subtotal.toFixed(2) }
    }).filter(Boolean)
    const cartCount = checkoutLines.reduce((sum, line) => sum + line.quantity, 0)
    const cartTotal = checkoutLines.reduce((sum, line) => sum + Number(line.subtotal), 0)
    this.setData({ cart, checkoutLines, cartCount, cartTotal: cartTotal.toFixed(2) })
  },

  openCheckout() {
    if (!this.data.cartCount) return
    this.setData({ showCheckout: true, checkoutLines: this.data.checkoutLines,
      checkoutAddress: this.data.checkoutAddress || (this.data.customer && this.data.customer.address) || '' })
  },

  cancelCheckout() { this.setData({ showCheckout: false }) },

  async placeOrder() {
    if (!this.data.checkoutAddress.trim()) return wx.showToast({ title: '请填写收货地址', icon: 'none' })
    const items = Object.entries(this.data.cart).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }))
    wx.showLoading({ title: '提交订单' })
    try {
      const order = await this.request('/api/mini/orders', { method: 'POST', data: { items, address: this.data.checkoutAddress.trim(), note: this.data.orderNote.trim() } })
      const customer = { ...app.globalData.customer, address: this.data.checkoutAddress.trim() }
      app.globalData.customer = customer
      wx.setStorageSync('miniCustomer', customer)
      this.setData({ cart: {}, checkoutLines: [], cartCount: 0, cartTotal: '0.00', showCheckout: false, orderNote: '' })
      wx.showModal({ title: '订单已提交', content: `订单号 ${order.order_no}\n金额 ¥${Number(order.total).toFixed(2)}\n待商家确认，确认后安排配送。`, showCancel: false })
      this.loadProducts()
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); this.loadProducts() }
    wx.hideLoading()
  },

  goOrders() { wx.navigateTo({ url: '/pages/orders/orders' }) },
})
