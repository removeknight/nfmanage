const { request, saveCustomer } = require('../../utils/api')
Page({
  data: { name: '', phone: '', address: '', editing: false, saving: false, mock: false },
  onLoad() {
    const app = getApp(), customer = app.globalData.customer
    this.setData({ editing: !!customer, mock: app.globalData.miniAuthMode === 'mock',
      name: customer ? customer.name : '', phone: customer ? customer.phone : '', address: customer ? customer.address : '' })
  },
  updateField(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },
  async save() {
    if (this.data.saving) return
    const name = this.data.name.trim(), phone = this.data.phone.trim(), address = this.data.address.trim()
    if (!name || !phone) return wx.showToast({ title: '请填写称呼和联系电话', icon: 'none' })
    this.setData({ saving: true })
    try {
      if (this.data.editing) saveCustomer(await request('/api/mini/me', { method: 'PATCH', data: { name, phone, address } }))
      else {
        let code = ''
        if (!this.data.mock) code = (await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))).code
        const deviceKey = wx.getStorageSync('mockDeviceKey') || undefined
        const result = await request('/api/mini/bind', { method: 'POST', data: { name, phone, address, code, device_key: deviceKey } })
        if (result.device_key) wx.setStorageSync('mockDeviceKey', result.device_key)
        getApp().globalData.miniToken = result.token; wx.setStorageSync('miniToken', result.token); saveCustomer(result.customer)
      }
      wx.showToast({ title: this.data.editing ? '资料已保存' : '绑定成功' })
      if (getCurrentPages().length > 1) wx.navigateBack()
      else wx.switchTab({ url: '/pages/me/me' })
    } catch (error) {
      if (!getApp().globalData.miniToken) this.setData({ editing: false })
      wx.showToast({ title: error.message, icon: 'none' })
    }
    finally { this.setData({ saving: false }) }
  },
})
