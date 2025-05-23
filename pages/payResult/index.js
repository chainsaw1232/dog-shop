// payResult/index.js
const app = getApp()

Page({
  data: {
    orderId: '', // 订单ID
    status: 'success', // 支付状态：success 或 fail
    orderDetail: null, // 订单详情
    recommendProducts: [] // 推荐商品
  },

  onLoad: function(options) {
    // 获取参数
    if (options.orderId) {
      this.setData({
        orderId: options.orderId,
        status: options.status || 'success'
      })
      
      // 获取订单详情
      this.fetchOrderDetail()
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        })
      }, 1500)
    }
    
    // 获取推荐商品
    this.fetchRecommendProducts()
  },

  // 获取订单详情
  fetchOrderDetail: function() {
    wx.request({
      url: app.globalData.baseUrl + '/api/order/detail',
      method: 'GET',
      data: {
        openid: app.globalData.openid,
        id: this.data.orderId
      },
      success: res => {
        if (res.data && res.data.code === 0) {
          this.setData({
            orderDetail: res.data.data
          })
        }
      }
    })
  },

  // 获取推荐商品
  fetchRecommendProducts: function() {
    wx.request({
      url: app.globalData.baseUrl + '/api/product/recommend',
      method: 'GET',
      data: {
        limit: 4
      },
      success: res => {
        if (res.data && res.data.code === 0) {
          this.setData({
            recommendProducts: res.data.data || []
          })
        }
      }
    })
  },

  // 查看订单
  viewOrder: function() {
    wx.redirectTo({
      url: `/pages/orderDetail/index?id=${this.data.orderId}`
    })
  },

  // 返回首页
  backToHome: function() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 返回订单
  backToOrder: function() {
    wx.redirectTo({
      url: `/pages/orderDetail/index?id=${this.data.orderId}`
    })
  },

  // 重新支付
  retryPay: function() {
    wx.showLoading({ title: '获取支付信息...' })
    
    wx.request({
      url: app.globalData.baseUrl + '/api/order/pay',
      method: 'POST',
      data: {
        openid: app.globalData.openid,
        id: this.data.orderId
      },
      success: res => {
        if (res.data && res.data.code === 0) {
          const payParams = res.data.data
          
          // 发起微信支付
          wx.requestPayment({
            ...payParams,
            success: () => {
              // 支付成功，刷新当前页面
              this.setData({ status: 'success' })
              this.fetchOrderDetail()
            },
            fail: err => {
              console.log('支付失败', err)
              // 用户取消支付或支付失败
              if (err.errMsg !== 'requestPayment:fail cancel') {
                wx.showToast({
                  title: '支付失败',
                  icon: 'none'
                })
              }
            }
          })
        } else {
          wx.showToast({
            title: res.data.message || '获取支付信息失败',
            icon: 'none'
          })
        }
      },
      fail: () => {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  // 跳转到商品详情
  navigateToDetail: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/index?id=${id}`
    })
  }
})
