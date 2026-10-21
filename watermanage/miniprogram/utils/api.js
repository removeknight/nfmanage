function request(path, options = {}) {
  const app = getApp()
  return new Promise((resolve, reject) => wx.request({
    url: app.globalData.apiBaseUrl + path, method: options.method || 'GET', data: options.data || {}, timeout: 12000,
    header: { 'content-type': 'application/json', ...(app.globalData.miniToken ? { Authorization: `Bearer ${app.globalData.miniToken}` } : {}) },
    success: response => {
      if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data)
      if (response.statusCode === 401) {
        app.globalData.miniToken = ''; app.globalData.customer = null
        wx.removeStorageSync('miniToken'); wx.removeStorageSync('miniCustomer')
        app.globalData.couponIds = null
        wx.removeTabBarBadge({ index: 1 })
      }
      const detail = response.data && response.data.detail
      const error = new Error(typeof detail === 'string' ? detail : '信息填写有误，请检查后重试')
      error.status = response.statusCode
      reject(error)
    },
    fail: result => {
      const detail = result.errMsg || 'request:fail'
      let message = `无法连接农丰水站：${detail}`
      if (/domain list|url not in|url is not in/i.test(detail)) message = '请求被微信域名校验拦截。开发者工具请开启“不校验合法域名”，手机请使用真机调试并开启调试模式。'
      else if (/timeout/i.test(detail)) message = '连接农丰水站超时，请检查设备网络后重试。'
      console.warn('API network failure', { path: path.split('?')[0], detail })
      const error = new Error(message)
      error.networkDetail = detail
      reject(error)
    },
  }))
}
function formatDate(value) {
  if (!value) return ''
  const normalized = value.replace(' ', 'T')
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`)
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function saveCustomer(customer) {
  getApp().globalData.customer = customer
  wx.setStorageSync('miniCustomer', customer)
}
module.exports = { request, formatDate, saveCustomer }
