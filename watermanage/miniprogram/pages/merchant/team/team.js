const { readingPage } = require('../../../utils/reading')
const { request, checkRole, showError } = require('../../../utils/merchant')
const { startPolling, stopPolling } = require('../../../utils/polling')
readingPage({
  data: { members: [], loading: true },
  onShow() { startPolling(this, this.load) }, onHide() { stopPolling(this) }, onUnload() { stopPolling(this) },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load(quiet = false) {
    if (this._loading) return
    this._loading = true
    try {
      await checkRole(true)
      const members = await request('/api/merchant/members')
      if (this._pollVisible) this.setData({ members })
    } catch (e) { if (!quiet || e.status === 401 || e.status === 403) showError(e) }
    finally { this._loading = false; this.setData({ loading: false }) }
  },
})
