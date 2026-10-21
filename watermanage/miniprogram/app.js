const { refreshReadingPages } = require('./utils/reading')
App({
  globalData: {
    // Cloud development endpoint. Configure an HTTPS domain before publishing.
    apiBaseUrl: 'http://101.43.17.74',
    miniAuthMode: 'wechat',
    authScope: '',
    miniToken: '',
    customer: null,
  },
  onShow() { refreshReadingPages() },
  onLaunch() {
    let appId = ''
    try { appId = wx.getAccountInfoSync().miniProgram.appId } catch (_) {}
    const scope = `${this.globalData.apiBaseUrl}|${this.globalData.miniAuthMode}|${appId}`
    this.globalData.authScope = scope
    // Lab/mock sessions cannot be reused for a different backend or WeChat AppID.
    if (wx.getStorageSync('miniAuthScope') !== scope) {
      wx.removeStorageSync('miniToken')
      wx.removeStorageSync('miniCustomer')
      wx.setStorageSync('miniAuthScope', scope)
      wx.removeTabBarBadge({ index: 1 })
    }
    this.globalData.miniToken = wx.getStorageSync('miniToken') || ''
    this.globalData.customer = wx.getStorageSync('miniCustomer') || null
  },
})
