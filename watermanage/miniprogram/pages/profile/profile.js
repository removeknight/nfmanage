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
        const expectedMode = this.data.mock ? 'mock' : 'wechat'
        const config = await request('/api/mini/auth-config')
        if (config.mode !== expectedMode) throw new Error('小程序与服务器登录模式不一致，请联系管理员更新配置')
        if (!config.configured) throw new Error('服务器尚未配置真实微信登录，请联系管理员')
        const loginData = { name, phone, address, auth_mode: expectedMode }
        if (this.data.mock) loginData.device_key = wx.getStorageSync('mockDeviceKey') || undefined
        else {
          const login = await new Promise((resolve, reject) => wx.login({ timeout: 10000, success: resolve,
            fail: () => reject(new Error('无法获取微信登录凭据，请确认使用真实 AppID 和有开发权限的微信账号')) }))
          if (!login.code) throw new Error('微信未返回登录凭据，请重新登录')
          loginData.code = login.code
          try { loginData.app_id = wx.getAccountInfoSync().miniProgram.appId } catch (_) {}
        }
        const result = await request('/api/mini/bind', { method: 'POST', data: loginData })
        if (result.auth_mode !== expectedMode) throw new Error('服务器返回的登录模式不一致，请联系管理员')
        if (result.device_key) wx.setStorageSync('mockDeviceKey', result.device_key)
        getApp().globalData.miniToken = result.token; wx.setStorageSync('miniToken', result.token); saveCustomer(result.customer)
      }
      wx.showToast({ title: this.data.editing ? '资料已保存' : '绑定成功' })
      if (getCurrentPages().length > 1) wx.navigateBack()
      else wx.switchTab({ url: '/pages/me/me' })
    } catch (error) {
      if (!getApp().globalData.miniToken) this.setData({ editing: false })
      wx.showModal({ title: '绑定未完成', content: error.message, showCancel: false, confirmColor: '#356e60' })
    }
    finally { this.setData({ saving: false }) }
  },
})
