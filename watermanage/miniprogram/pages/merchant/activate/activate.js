const { request, saveCustomer } = require('../../../utils/api')
Page({
  data: { code: '', busy: false, error: '' },
  input(event) { this.setData({ code: event.detail.value, error: '' }) },
  async activate() {
    if (this.data.busy) return
    if (!getApp().globalData.miniToken) return wx.navigateTo({ url: '/pages/profile/profile' })
    if (!this.data.code.trim()) return this.setData({ error: '请输入店主或服务器管理员提供的授权码' })
    this.setData({ busy: true, error: '' })
    try {
      const customer = await request('/api/access/claim', { method: 'POST', data: { code: this.data.code.trim() } })
      saveCustomer(customer)
      wx.showToast({ title: '授权成功' })
      wx.redirectTo({ url: '/pages/merchant/home/home' })
    } catch (e) { this.setData({ error: e.message }) }
    finally { this.setData({ busy: false }) }
  },
})
