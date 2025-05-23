// utils/util.js
/**
 * 工具函数集合
 * 提供常用的工具方法
 */

/**
 * 格式化时间
 * @param {Date} date - 日期对象
 * @param {string} format - 格式化模板，如 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的时间字符串
 */
const formatTime = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!date) {
    date = new Date()
  }
  if (typeof date === 'string') {
    date = new Date(date.replace(/-/g, '/'))
  }
  if (typeof date === 'number') {
    date = new Date(date)
  }

  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return format
    .replace('YYYY', year)
    .replace('MM', formatNumber(month))
    .replace('DD', formatNumber(day))
    .replace('HH', formatNumber(hour))
    .replace('mm', formatNumber(minute))
    .replace('ss', formatNumber(second))
}

/**
 * 数字补零
 * @param {number} n - 需要格式化的数字
 * @returns {string} 补零后的字符串
 */
const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

/**
 * 价格格式化
 * @param {number|string} price - 价格
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的价格字符串
 */
const formatPrice = (price, decimals = 2) => {
  if (isNaN(price) || price === '' || price === null) {
    return '0.00'
  }
  return parseFloat(price).toFixed(decimals)
}

/**
 * 计算价格（避免浮点数精度问题）
 * @param {number} price1 - 价格1
 * @param {number} price2 - 价格2
 * @returns {number} 计算结果
 */
const calcPrice = (price1, price2, operator = '+') => {
  const num1 = parseFloat(price1) * 100
  const num2 = parseFloat(price2) * 100
  let result = 0

  switch (operator) {
    case '+':
      result = (num1 + num2) / 100
      break
    case '-':
      result = (num1 - num2) / 100
      break
    case '*':
      result = (num1 * num2) / 10000
      break
    case '/':
      result = num1 / num2
      break
    default:
      result = (num1 + num2) / 100
  }

  return parseFloat(result.toFixed(2))
}

/**
 * 防抖函数
 * @param {Function} fn - 需要防抖的函数
 * @param {number} delay - 延迟时间，单位毫秒
 * @returns {Function} 防抖后的函数
 */
const debounce = (fn, delay = 500) => {
  let timer = null
  return function() {
    const context = this
    const args = arguments
    clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(context, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {Function} fn - 需要节流的函数
 * @param {number} interval - 间隔时间，单位毫秒
 * @returns {Function} 节流后的函数
 */
const throttle = (fn, interval = 500) => {
  let last = 0
  return function() {
    const context = this
    const args = arguments
    const now = Date.now()
    if (now - last >= interval) {
      last = now
      fn.apply(context, args)
    }
  }
}

/**
 * 检查登录状态
 * @returns {boolean} 是否已登录
 */
const checkLoginStatus = () => {
  const app = getApp()
  if (!app.globalData.openid) {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      success: res => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/user/index'
          })
        }
      }
    })
    return false
  }
  return true
}

/**
 * 显示成功提示
 * @param {string} message - 提示信息
 */
const showSuccess = (message) => {
  wx.showToast({
    title: message,
    icon: 'success',
    duration: 2000
  })
}

/**
 * 显示错误提示
 * @param {string} message - 错误信息
 */
const showError = (message) => {
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2000
  })
}

module.exports = {
  formatTime,
  formatNumber,
  formatPrice,
  calcPrice,
  debounce,
  throttle,
  checkLoginStatus,
  showSuccess,
  showError
}
