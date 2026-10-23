function openLegal(kind) {
  wx.navigateTo({ url: `/pages/legal/legal?kind=${kind === 'terms' ? 'terms' : 'privacy'}` })
}

function contactMerchant(phone = '13324205796') {
  wx.showModal({
    title: '联系商家', content: `商家电话：${phone}\n可咨询订单、个人信息更正、删除和注销事宜。`,
    confirmText: '拨打电话', confirmColor: '#356e60',
    success: result => {
      if (!result.confirm) return
      wx.makePhoneCall({ phoneNumber: phone, fail: error => {
        if (!/cancel/i.test(error.errMsg || '')) wx.showToast({ title: '未能拨号，请手动拨打页面上的商家电话', icon: 'none' })
      } })
    },
  })
}

module.exports = { openLegal, contactMerchant }
