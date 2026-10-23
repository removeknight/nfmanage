const { readingPage } = require('../../utils/reading')
const { request } = require('../../utils/api')
const { contactMerchant } = require('../../utils/legal')
readingPage({
  data: { kind: 'privacy', document: null, phone: '13324205796', loading: false, error: '' },
  onLoad(options) {
    this.setData({ kind: options.kind === 'terms' ? 'terms' : 'privacy' })
    wx.setNavigationBarTitle({ title: options.kind === 'terms' ? '用户服务协议' : '隐私保护指引' })
    this.load()
  },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const legal = await request('/api/mini/legal')
      this.setData({ document: legal[this.data.kind], phone: legal.contact_phone })
    } catch (error) { this.setData({ error: error.message }) }
    finally { this.setData({ loading: false }) }
  },
  contact() { contactMerchant(this.data.phone) },
})
