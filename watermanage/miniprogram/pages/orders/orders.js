const { readingPage } = require('../../utils/reading')
const { request, formatDate } = require('../../utils/api')
const { startPolling, stopPolling } = require('../../utils/polling')
readingPage({
  data: { orders: [], loading: true, acting: false },
  onShow() { startPolling(this, this.loadOrders) },
  onHide() { stopPolling(this) },
  onUnload() { stopPolling(this) },
  onPullDownRefresh() { this.loadOrders().finally(() => wx.stopPullDownRefresh()) },
  async loadOrders(quiet = false) {
    if (this._loadingOrders) return
    if (!getApp().globalData.miniToken) { this.setData({ orders: [], loading: false }); return }
    this._loadingOrders = true
    const version = this._viewVersion
    if (!quiet) this.setData({ loading: true })
    try {
      const orders = await request('/api/mini/orders')
      if (!this._pollVisible || version !== this._viewVersion) return
      this.setData({ orders: orders.map(order => ({ ...order, totalText: Number(order.total).toFixed(2),
        receivedText: Number(order.received_total || 0).toFixed(2), canCancel: order.status === '待提货' && !order.paid_at,
        originalText: Number(order.original_total).toFixed(2), discountText: Number(order.discount_amount).toFixed(2),
        timeText: formatDate(order.created_at), redeemedText: formatDate(order.redeemed_at),
        statusClass: order.status === '待提货' ? 'pending' : order.status === '已核销' ? 'done' : 'cancelled',
        activePickup: order.status === '待提货',
        hint: order.status === '待提货' ? '下单成功，请凭提货码到店提货' : order.status === '已核销' ? '已完成提货核销' : `订单${order.status}` })) })
    } catch (error) { if (!quiet) wx.showToast({ title: error.message, icon: 'none' }) }
    finally { this._loadingOrders = false; if (version === this._viewVersion) this.setData({ loading: false }) }
  },
  cancelOrder(event) {
    if (this.data.acting) return
    const id = event.currentTarget.dataset.id
    wx.showModal({ title: '取消订单', content: '确定取消这笔待提货订单吗？库存和所用优惠券将退回，优惠券仍以原有效期为准。', success: async result => {
      if (!result.confirm || this.data.acting) return
      this.setData({ acting: true })
      try { await request(`/api/mini/orders/${id}/cancel`, { method: 'POST' }); wx.showToast({ title: '订单已取消' }); await this.loadOrders() }
      catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
      finally { this.setData({ acting: false }) }
    } })
  },
  deleteOrder(event) {
    if (this.data.acting) return
    const id = event.currentTarget.dataset.id
    wx.showModal({ title: '从我的订单中删除', content: '只从手机订单列表中移除，商家仍保留记录。删除不会取消订单，待处理订单仍会继续处理。', success: async result => {
      if (!result.confirm || this.data.acting) return
      this.setData({ acting: true })
      try { await request(`/api/mini/orders/${id}`, { method: 'DELETE' }); wx.showToast({ title: '已从列表删除' }); await this.loadOrders() }
      catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
      finally { this.setData({ acting: false }) }
    } })
  },
  copyCode(event) { wx.setClipboardData({ data: event.currentTarget.dataset.code }) },
  goShop() { wx.switchTab({ url: '/pages/index/index' }) },
})
