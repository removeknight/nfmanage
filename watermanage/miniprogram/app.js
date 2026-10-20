App({
  globalData: {
    // Replace with the HTTPS API domain before publishing the mini program.
    apiBaseUrl: 'http://10.124.209.135:8080',
    miniToken: '',
    customer: null,
  },
  onLaunch() {
    this.globalData.miniToken = wx.getStorageSync('miniToken') || ''
    this.globalData.customer = wx.getStorageSync('miniCustomer') || null
  },
})
