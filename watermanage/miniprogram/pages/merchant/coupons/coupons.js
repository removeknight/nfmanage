const { readingPage } = require('../../../utils/reading')
const { request, checkRole, showError, confirm } = require('../../../utils/merchant')
readingPage({
  data: { customers: [], selected: null, query: '', title: '水站优惠券', amount: '', days: '7', usage: 'unrestricted', busy: false, loading: true, error: '' },
  onShow() { this.search() },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); this._requestKey = '' },
  async search() {
    const version = this._version = (this._version || 0) + 1
    this.setData({ loading: true })
    try {
      await checkRole(true)
      const customers = await request(`/api/merchant/customers?q=${encodeURIComponent(this.data.query.trim())}`)
      if (version === this._version) this.setData({ customers, error: '' })
    } catch (e) { this.setData({ error: e.message }); showError(e) } finally { if (version === this._version) this.setData({ loading: false }) }
  },
  select(event) { this.setData({ selected: this.data.customers.find(c => c.id === event.currentTarget.dataset.id) }); this._requestKey = '' },
  clear() { this.setData({ selected: null }); this._requestKey = '' },
  usage(event) { this.setData({ usage: event.currentTarget.dataset.usage }); this._requestKey = '' },
  async submit() {
    if (this.data.busy) return
    const amount = Number(this.data.amount), days = Number(this.data.days), selected = this.data.selected
    if (!selected) return wx.showToast({ title: '请先选择客户', icon: 'none' })
    if (!/^\d+(\.\d{1,2})?$/.test(this.data.amount) || amount <= 0 || amount > 100000 || !Number.isInteger(days) || days < 1 || days > 365 || !this.data.title.trim()) return wx.showToast({ title: '请检查金额、名称和有效天数', icon: 'none' })
    this.setData({ busy: true })
    try {
      if (!(await confirm(`给 ${selected.name}（${selected.phone}）发放 ¥${amount.toFixed(2)} 优惠券，有效 ${days} 天？`))) return
      // Keep the key after an uncertain network outcome, so retry cannot issue twice.
      this._requestKey = this._requestKey || `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`
      await request('/api/merchant/coupons', { method: 'POST', data: { title: this.data.title.trim(), amount, validity_days: days, usage_type: this.data.usage, customer_ids: [selected.id], request_key: this._requestKey } })
      wx.showToast({ title: '优惠券已发放' })
      this._requestKey = ''; this.setData({ amount: '', selected: null })
    } catch (e) { showError(e) } finally { this.setData({ busy: false }) }
  },
})
