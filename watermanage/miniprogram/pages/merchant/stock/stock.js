const { readingPage } = require('../../../utils/reading')
const { request, checkRole, showError } = require('../../../utils/merchant')
const { startPolling, stopPolling } = require('../../../utils/polling')
readingPage({
  data: { products: [], displayed: [], query: '', lowOnly: false, loading: true, error: '' },
  onShow() { startPolling(this, this.load) }, onHide() { stopPolling(this) }, onUnload() { stopPolling(this) },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load(quiet = false) {
    if (this._loading) return
    this._loading = true
    try {
      await checkRole()
      const products = await request('/api/merchant/stock')
      if (this._pollVisible) { this.setData({ products, error: '' }); this.filter() }
    } catch (e) { if (!quiet || e.status === 401 || e.status === 403) { this.setData({ error: e.message }); showError(e) } }
    finally { this._loading = false; this.setData({ loading: false }) }
  },
  input(event) { this.setData({ query: event.detail.value }); this.filter() },
  toggle() { this.setData({ lowOnly: !this.data.lowOnly }); this.filter() },
  filter() {
    const query = this.data.query.trim().toLowerCase()
    this.setData({ displayed: this.data.products.filter(p => (!this.data.lowOnly || p.stock <= p.warning_stock) && `${p.name} ${p.brand} ${p.category} ${p.capacity}`.toLowerCase().includes(query)) })
  },
})
