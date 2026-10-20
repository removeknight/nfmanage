const app = getApp()

Page({
  data: { orders: [], loading: true },
  onShow() { this.loadOrders() },
  onPullDownRefresh() { this.loadOrders().finally(() => wx.stopPullDownRefresh()) },
  request(path, options = {}) {
    return new Promise((resolve, reject) => wx.request({
      url: app.globalData.apiBaseUrl + path, method: options.method || 'GET', data: options.data || {},
      header: { 'content-type': 'application/json', Authorization: `Bearer ${app.globalData.miniToken}` },
      success: res => res.statusCode >= 200 && res.statusCode < 300 ? resolve(res.data) : reject(new Error(res.data.detail || '请求失败')),
      fail: () => reject(new Error('无法连接服务器，请检查网络')),
    }))
  },
  async loadOrders() {
    if (!app.globalData.miniToken) { this.setData({ orders: [], loading: false }); return }
    this.setData({ loading: true })
    try {
      const orders = await this.request('/api/mini/orders')
      this.setData({ orders: orders.map(order => ({ ...order, totalText: Number(order.total).toFixed(2),
        timeText: this.formatDate(order.created_at), statusText: order.status,
        statusClass: order.status === '待商家确认' ? 'pending' : order.status === '已确认' ? 'done' : 'cancelled',
        hint: order.status === '待商家确认' ? '商家确认后为您安排配送' : order.status === '已确认' ? '订单已确认，正在安排配送' : `订单${order.status}` })) })
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
    this.setData({ loading: false })
  },
  formatDate(value) {
    if (!value) return ''
    const date = new Date(value.replace(' ', 'T'))
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },
  cancelOrder(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({ title: '取消订单', content: '确定取消这笔待确认订单吗？', success: async result => {
      if (!result.confirm) return
      try { await this.request(`/api/mini/orders/${id}/cancel`, { method: 'POST' }); wx.showToast({ title: '订单已取消' }); this.loadOrders() }
      catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
    } })
  },
  goShop() { wx.navigateBack({ delta: 1 }) },
})
