const { readingPage } = require('../../../utils/reading')
const { request, checkRole, showError, orderView } = require('../../../utils/merchant')
const { startPolling, stopPolling } = require('../../../utils/polling')
readingPage({
  data: { status: '待提货', statuses: ['待提货', '已核销', '已取消', '全部'], phone: '', lookup: '', orders: [], candidates: null, loading: true, searching: false, error: '' },
  onShow() { startPolling(this, this.load) },
  onHide() { stopPolling(this) }, onUnload() { stopPolling(this) },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load(quiet = false) {
    if (this._loading) return
    this._loading = true
    const version = this._queryVersion || 0
    try {
      await checkRole()
      const orders = await request(`/api/merchant/orders?status=${encodeURIComponent(this.data.status === '全部' ? '' : this.data.status)}&phone=${encodeURIComponent(this._phone || '')}`)
      if (this._pollVisible && version === (this._queryVersion || 0)) this.setData({ orders: orders.map(orderView), error: '' })
    } catch (e) { if (!quiet || e.status === 401 || e.status === 403) { this.setData({ error: e.message }); showError(e) } }
    finally { this._loading = false; this.setData({ loading: false }) }
    if (version !== (this._queryVersion || 0) && this._pollVisible) this.load()
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },
  selectStatus(event) { this.setData({ status: event.currentTarget.dataset.status, candidates: null }); this._queryVersion = (this._queryVersion || 0) + 1; this.load() },
  search() { this._phone = this.data.phone.trim(); this._queryVersion = (this._queryVersion || 0) + 1; this.setData({ candidates: null }); this.load() },
  async lookup() {
    if (this.data.searching) return
    const value = this.data.lookup.trim()
    if (!/^\d{4}$|^\d{6}$/.test(value)) return wx.showToast({ title: '请输入 6 位核销码或手机后 4 位', icon: 'none' })
    this.setData({ searching: true, candidates: null })
    try {
      const rows = await request(`/api/merchant/lookup?value=${value}`)
      this.setData({ candidates: rows.map(orderView) })
      if (rows.length === 1) wx.navigateTo({ url: `/pages/merchant/detail/detail?id=${rows[0].id}` })
    } catch (e) { showError(e) } finally { this.setData({ searching: false }) }
  },
  detail(event) { wx.navigateTo({ url: `/pages/merchant/detail/detail?id=${event.currentTarget.dataset.id}` }) },
  clearCandidates() { this.setData({ candidates: null }) },
})
