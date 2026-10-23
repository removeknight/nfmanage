const { readingPage } = require('../../utils/reading')
const { request, saveCustomer } = require('../../utils/api')
const { openLegal } = require('../../utils/legal')
readingPage({
  data: { name: '', phone: '', address: '', editing: false, saving: false, mock: false,
    legalReady: false, legalError: '', accepted: false },
  onLoad() {
    const app = getApp(), customer = app.globalData.customer
    this.setData({ editing: !!customer, mock: app.globalData.miniAuthMode === 'mock',
      name: customer ? customer.name : '', phone: customer ? customer.phone : '', address: customer ? customer.address : '' })
  },
  onShow() { if (!this.data.editing) this.loadLegal() },
  async loadLegal() {
    this.setData({ legalError: '' })
    try {
      const legal = await request('/api/mini/legal')
      const sameVersion = this._legal && this._legal.privacy.version === legal.privacy.version && this._legal.terms.version === legal.terms.version
      this.setData({ legalReady: true, accepted: sameVersion ? this.data.accepted : false })
      this._legal = legal
    } catch (error) { this.setData({ legalReady: false, legalError: error.message }) }
  },
  changeAgreement(event) { this.setData({ accepted: event.detail.value.includes('accepted') }) },
  readPrivacy() { openLegal('privacy') },
  readTerms() { openLegal('terms') },
  updateField(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },
  async save() {
    if (this.data.saving) return
    const name = this.data.name.trim(), phone = this.data.phone.trim(), address = this.data.address.trim()
    if (!name || !phone) return wx.showToast({ title: '请填写称呼和联系电话', icon: 'none' })
    if (!this.data.editing && (!this.data.legalReady || !this._legal)) return wx.showToast({ title: '请先加载协议内容', icon: 'none' })
    if (!this.data.editing && !this.data.accepted) return wx.showToast({ title: '请阅读并勾选确认隐私指引和服务协议', icon: 'none' })
    const details = { name, phone, address }
    if (!this.data.editing) Object.assign(details, { accepted: true, privacy_version: this._legal.privacy.version,
      terms_version: this._legal.terms.version })
    this.setData({ saving: true })
    try {
      if (this.data.editing) saveCustomer(await request('/api/mini/me', { method: 'PATCH', data: details }))
      else {
        const expectedMode = this.data.mock ? 'mock' : 'wechat'
        const config = await request('/api/mini/auth-config')
        if (config.mode !== expectedMode) throw new Error('小程序与服务器登录模式不一致，请联系管理员更新配置')
        if (!config.configured) throw new Error('服务器尚未配置真实微信登录，请联系管理员')
        const loginData = { ...details, auth_mode: expectedMode }
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
      if (!this.data.editing && error.status === 409) { this.setData({ accepted: false, legalReady: false }); this._legal = null; await this.loadLegal() }
      if (!getApp().globalData.miniToken && this.data.editing) {
        this.setData({ editing: false, accepted: false })
        await this.loadLegal()
      }
      wx.showModal({ title: this.data.editing ? '资料未保存' : '绑定未完成', content: error.message, showCancel: false, confirmColor: '#356e60' })
    }
    finally { this.setData({ saving: false }) }
  },
})
