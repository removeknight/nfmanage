const { request, checkRole, showError } = require('../../../utils/merchant')
const { startPolling, stopPolling } = require('../../../utils/polling')
Page({
  data: { customer: null, manager: false, summary: {}, loading: true, webCode: '', generating: false },
  onShow() { startPolling(this, this.load) },
  onHide() { stopPolling(this) }, onUnload() { stopPolling(this) },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load(quiet = false) {
    if (this._loading) return
    this._loading = true
    try {
      const customer = await checkRole()
      const summary = await request('/api/merchant/summary')
      if (!this._pollVisible) return
      if (summary.today_sales !== undefined) summary.salesText = Number(summary.today_sales).toFixed(2)
      this.setData({ customer, summary, manager: ['owner', 'deputy'].includes(customer.role) })
    } catch (e) { if (!quiet || e.status === 401 || e.status === 403) showError(e) }
    finally { this._loading = false; this.setData({ loading: false }) }
  },
  go(event) { wx.navigateTo({ url: `/pages/merchant/${event.currentTarget.dataset.page}/${event.currentTarget.dataset.page}` }) },
  async webCode() {
    if (this.data.generating) return
    this.setData({ generating: true })
    try { const result = await request('/api/merchant/web-code', { method: 'POST' }); this.setData({ webCode: result.code }) }
    catch (e) { showError(e) } finally { this.setData({ generating: false }) }
  },
  copyCode() { if (this.data.webCode) wx.setClipboardData({ data: this.data.webCode }) },
})
