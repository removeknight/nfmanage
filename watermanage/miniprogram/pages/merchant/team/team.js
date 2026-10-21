const { request, checkRole, showError, confirm } = require('../../../utils/merchant')
const { startPolling, stopPolling } = require('../../../utils/polling')
Page({
  data: { members: [], invite: '', busy: false, loading: true },
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
  async invite() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const result = await request('/api/merchant/invites', { method: 'POST' })
      this.setData({ invite: result.code })
    } catch (e) { showError(e) } finally { this.setData({ busy: false }) }
  },
  copy() { if (this.data.invite) wx.setClipboardData({ data: this.data.invite }) },
  async revoke(event) {
    if (this.data.busy) return
    const member = this.data.members.find(m => m.customer_id === event.currentTarget.dataset.id)
    if (!member) return
    this.setData({ busy: true })
    try {
      if (!(await confirm(`停用 ${member.name} 的店员权限？停用后仍可作为普通客户使用。`))) return
      await request(`/api/merchant/members/${member.customer_id}`, { method: 'DELETE' })
      wx.showToast({ title: '已停用' }); this.load()
    } catch (e) { showError(e) } finally { this.setData({ busy: false }) }
  },
})
