const { READING_OPTIONS, readingPage, setReadingSize } = require('../../utils/reading')

readingPage({
  data: { options: READING_OPTIONS },
  changeSize(event) {
    try { setReadingSize(event.detail.value) }
    catch (_) { wx.showToast({ title: '设置未保存，请重试', icon: 'none' }) }
  },
})
