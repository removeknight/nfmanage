const { request, saveCustomer, formatDate } = require('./api')
async function checkRole(managerOnly = false) {
  const customer = await request('/api/mini/me')
  saveCustomer(customer)
  if (!customer.is_merchant || (managerOnly && !['owner', 'deputy'].includes(customer.role))) {
    const error = new Error(managerOnly ? '此功能仅店主或副店长可用' : '商家权限已失效')
    error.status = 403
    throw error
  }
  return customer
}
function showError(error) {
  wx.showToast({ title: error.message || '操作失败，请稍后重试', icon: 'none' })
  if (error.status === 401 || error.status === 403) wx.switchTab({ url: '/pages/me/me' })
}
function confirm(content) {
  return new Promise(resolve => wx.showModal({ title: '请确认', content, confirmColor: '#356e60', success: r => resolve(r.confirm), fail: () => resolve(false) }))
}
function orderView(order) {
  return { ...order, totalText: Number(order.total).toFixed(2), originalText: Number(order.original_total).toFixed(2),
    discountText: Number(order.discount_amount).toFixed(2), timeText: formatDate(order.created_at),
    items: order.items.map(item => ({ ...item, priceText: Number(item.unit_price).toFixed(2), subtotalText: Number(item.subtotal).toFixed(2) })) }
}
module.exports = { request, checkRole, showError, confirm, orderView }
