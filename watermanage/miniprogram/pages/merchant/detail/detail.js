const { readingPage } = require('../../../utils/reading')
const { request, checkRole, showError, confirm, orderView } = require('../../../utils/merchant')
const { startPolling, stopPolling } = require('../../../utils/polling')
readingPage({
  data: { order: null, manager: false, busy: false, loading: true, error: '' },
  onLoad(options) { this._id = Number(options.id) },
  onShow() { startPolling(this, this.load) }, onHide() { stopPolling(this) }, onUnload() { stopPolling(this) },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load(quiet = false) {
    if (this._loading || this.data.busy) return
    this._loading = true
    try {
      const customer = await checkRole()
      const order = await request(`/api/merchant/orders/${this._id}`)
      if (this._pollVisible) this.setData({ order: orderView(order), manager: ['owner', 'deputy'].includes(customer.role), error: '' })
    } catch (e) { if (!quiet || e.status === 401 || e.status === 403) { this.setData({ error: e.message }); showError(e) } }
    finally { this._loading = false; this.setData({ loading: false }) }
  },
  async act(event) {
    if (this.data.busy || !this.data.order) return
    const cancel = event.currentTarget.dataset.action === 'cancel'
    const order = this.data.order
    this.setData({ busy: true })
    try {
      const content = cancel ? '取消订单后将还原库存和优惠券，确认取消？' : `确认已向 ${order.contact_name}（${order.contact_phone}）交付本单全部商品？核销后不能重复使用。`
      if (!(await confirm(content))) return
      await request(cancel ? `/api/merchant/orders/${order.id}/cancel` : '/api/merchant/redeem', { method: 'POST', data: cancel ? {} : { code: order.pickup_code } })
      wx.showToast({ title: cancel ? '订单已取消' : '核销成功' })
    } catch (e) { showError(e) }
    finally { this.setData({ busy: false }); this.load() }
  },
  call() { if (this.data.order.contact_phone) wx.makePhoneCall({ phoneNumber: this.data.order.contact_phone }) },
})
