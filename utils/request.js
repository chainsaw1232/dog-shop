// utils/request.js
/**
 * 网络请求工具类
 * 封装微信小程序的wx.request方法，统一处理请求、响应和错误
 */

const app = getApp()

// 基础URL，实际开发中替换为真实API地址
const BASE_URL = 'https://api.example.com'

/**
 * 发送请求的核心函数
 * @param {Object} options - 请求配置
 * @param {string} options.url - 请求地址，可以是相对路径或完整URL
 * @param {string} options.method - 请求方法，默认为GET
 * @param {Object} options.data - 请求参数
 * @param {boolean} options.loading - 是否显示加载提示，默认为false
 * @param {boolean} options.auth - 是否需要携带认证信息，默认为true
 * @returns {Promise} 返回Promise对象
 */
const request = (options = {}) => {
  // 处理请求URL
  let url = options.url
  if (!url.startsWith('http')) {
    url = BASE_URL + url
  }
  
  // 是否显示加载提示
  if (options.loading) {
    wx.showLoading({
      title: '加载中...',
      mask: true
    })
  }
  
  // 处理请求头
  const header = options.header || {}
  
  // 如果需要认证，添加openid到请求参数
  if (options.auth !== false && app.globalData.openid) {
    if (!options.data) {
      options.data = {}
    }
    options.data.openid = app.globalData.openid
  }
  
  // 发送请求
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header,
      success: res => {
        // 请求成功，但需要检查业务状态码
        if (res.statusCode === 200) {
          // 业务状态码判断
          if (res.data && res.data.code === 0) {
            resolve(res.data)
          } else {
            // 业务错误
            const errorMsg = (res.data && res.data.message) || '请求失败'
            showError(errorMsg)
            reject(new Error(errorMsg))
          }
        } else {
          // HTTP错误
          const errorMsg = `网络错误(${res.statusCode})`
          showError(errorMsg)
          reject(new Error(errorMsg))
        }
      },
      fail: err => {
        // 请求失败
        const errorMsg = '网络请求失败，请检查网络连接'
        showError(errorMsg)
        reject(new Error(errorMsg))
      },
      complete: () => {
        // 隐藏加载提示
        if (options.loading) {
          wx.hideLoading()
        }
      }
    })
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

/**
 * GET请求
 * @param {string} url - 请求地址
 * @param {Object} data - 请求参数
 * @param {Object} options - 其他配置
 * @returns {Promise} 返回Promise对象
 */
const get = (url, data = {}, options = {}) => {
  return request({
    url,
    method: 'GET',
    data,
    ...options
  })
}

/**
 * POST请求
 * @param {string} url - 请求地址
 * @param {Object} data - 请求参数
 * @param {Object} options - 其他配置
 * @returns {Promise} 返回Promise对象
 */
const post = (url, data = {}, options = {}) => {
  return request({
    url,
    method: 'POST',
    data,
    ...options
  })
}

module.exports = {
  request,
  get,
  post
}
