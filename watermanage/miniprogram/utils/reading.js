const STORAGE_KEY = 'nfReadingSize'
const READING_OPTIONS = [
  { value: 'system', label: '跟随微信', description: '使用微信「设置 → 通用 → 字体大小」的设置' },
  { value: 'small', label: '小号', description: '缩小 12.5%，适合偏好紧凑显示的用户', scale: 0.875 },
  { value: 'standard', label: '标准', description: '清晰字号，适合日常浏览', scale: 1 },
  { value: 'large', label: '大号', description: '放大 20%，阅读更轻松', scale: 1.2 },
  { value: 'extra', label: '特大', description: '放大 40%，适合需要更大文字的用户', scale: 1.4 },
]

function readingState() {
  let saved = ''
  try { saved = wx.getStorageSync(STORAGE_KEY) } catch (_) {}
  const option = READING_OPTIONS.find(item => item.value === saved) || READING_OPTIONS[0]
  let scale = option.scale || 1
  if (option.value === 'system') {
    try {
      const info = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
      const factor = Number(info.fontSizeScaleFactor)
      const size = Number(info.fontSizeSetting)
      if (Number.isFinite(factor) && factor > 0) scale = factor
      else if (Number.isFinite(size) && size > 0) scale = size / 16
    } catch (_) { /* Standard size remains readable on older clients. */ }
  }
  // Ignore invalid platform values while preserving the supported WeChat size range.
  scale = Math.max(0.8, Math.min(3, scale))
  return {
    readingMode: option.value,
    readingLabel: option.label,
    readingRootFont: Number((16 * scale).toFixed(2)),
    readingLayoutClass: scale >= 1.35 ? 'reading-large' : '',
  }
}

function refreshReadingPages() {
  const state = readingState()
  getCurrentPages().forEach(page => page.setData(state))
}

function setReadingSize(value) {
  if (!READING_OPTIONS.some(item => item.value === value)) return
  wx.setStorageSync(STORAGE_KEY, value)
  refreshReadingPages()
}

// Keep page lifecycle handlers intact, including polling and permission checks.
function readingPage(options) {
  const onShow = options.onShow
  Page({
    ...options,
    data: { ...options.data, ...readingState() },
    onShow(...args) {
      this.setData(readingState())
      if (onShow) return onShow.apply(this, args)
    },
  })
}

module.exports = { READING_OPTIONS, readingPage, refreshReadingPages, setReadingSize }
