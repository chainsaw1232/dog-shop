// orderDetail/index.js
const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    id: '', // 订单ID
    orderDetail: null, // 订单详情
    statusIcon: '', // 状态图标
    statusDesc: '' // 状态描述
  },

  onLoad: function(options) {
    if (options.id) {
      this.setData({ id: options.id })
      this.fetchOrderDetail()
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 获取订单详情
  fetchOrderDetail: function() {
    if (!app.globalData.openid) {
      this.showLoginModal()
      return
    }
    
    wx.showLoading({ title: '加载中...' })
    
    wx.request({
      url: app.globalData.baseUrl + '/api/order/detail',
      method: 'GET',
      data: {
        openid: app.globalData.openid,
        id: this.data.id
      },
      success: res => {
        if (res.data && res.data.code === 0) {
          const orderDetail = res.data.data
          
          // 格式化时间
          if (orderDetail.createTime) {
            orderDetail.createTime = util.formatTime(new Date(orderDetail.createTime))
          }
          if (orderDetail.payTime) {
            orderDetail.payTime = util.formatTime(new Date(orderDetail.payTime))
          }
          if (orderDetail.shipTime) {
            orderDetail.shipTime = util.formatTime(new Date(orderDetail.shipTime))
          }
          if (orderDetail.completeTime) {
            orderDetail.completeTime = util.formatTime(new Date(orderDetail.completeTime))
          }
          
          // 根据状态设置状态文本
          switch (orderDetail.status) {
            case 'unpaid':
              orderDetail.statusText = '待付款'
              this.setData({
                statusIcon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unpaid.png',
                statusDesc: '请在24小时内完成支付，超时订单将自动取消'
              })
              break
            case 'unshipped':
              orderDetail.statusText = '待发货'
              this.setData({
                statusIcon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unshipped.png',
                statusDesc: '商家正在处理您的订单，请耐心等待'
              })
              break
            case 'shipped':
              orderDetail.statusText = '待收货'
              this.setData({
                statusIcon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_shipped.png',
                statusDesc: '商品已发出，请注意查收'
              })
              break
            case 'completed':
              orderDetail.statusText = '已完成'
              this.setData({
                statusIcon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_completed.png',
                statusDesc: '订单已完成，感谢您的购买'
              })
              break
            case 'cancelled':
              orderDetail.statusText = '已取消'
              this.setData({
                statusIcon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_cancelled.png',
                statusDesc: '订单已取消'
              })
              break
            case 'refunding':
              orderDetail.statusText = '退款中'
              this.setData({
                statusIcon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_refunding.png',
                statusDesc: '退款申请处理中，请耐心等待'
              })
              break
            case 'refunded':
              orderDetail.statusText = '已退款'
              this.setData({
                statusIcon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_refunded.png',
                statusDesc: '退款已完成，款项将原路退回'
              })
              break
            default:
              orderDetail.statusText = '未知状态'
              this.setData({
                statusIcon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unknown.png',
                statusDesc: '订单状态未知'
              })
          }
          
          this.setData({ orderDetail })
        } else {
          wx.showToast({
            title: res.data.message || '获取订单失败',
            icon: 'none'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
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

  // 复制订单号
  copyOrderNumber: function() {
    wx.setClipboardData({
      data: this.data.orderDetail.orderNumber,
      success: () => {
        wx.showToast({
          title: '复制成功',
          icon: 'success'
        })
      }
    })
  },

  // 取消订单
  cancelOrder: function() {
    wx.showModal({
      title: '提示',
      content: '确定要取消该订单吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          
          wx.request({
            url: app.globalData.baseUrl + '/api/order/cancel',
            method: 'POST',
            data: {
              openid: app.globalData.openid,
              id: this.data.id
            },
            success: res => {
              if (res.data && res.data.code === 0) {
                wx.showToast({
                  title: '取消成功',
                  icon: 'success'
                })
                
                // 刷新订单详情
                this.fetchOrderDetail()
              } else {
                wx.showToast({
                  title: res.data.message || '取消失败',
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
        }
      }
    })
  },

  // 支付订单
  payOrder: function() {
    wx.showLoading({ title: '获取支付信息...' })
    
    wx.request({
      url: app.globalData.baseUrl + '/api/order/pay',
      method: 'POST',
      data: {
        openid: app.globalData.openid,
        id: this.data.id
      },
      success: res => {
        if (res.data && res.data.code === 0) {
          const payParams = res.data.data
          
          // 发起微信支付
          wx.requestPayment({
            ...payParams,
            success: () => {
              // 支付成功，跳转到支付结果页面
              wx.redirectTo({
                url: `/pages/payResult/index?orderId=${this.data.id}&status=success`
              })
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

  // 查看物流
  viewLogistics: function() {
    wx.navigateTo({
      url: `/pages/logistics/index?id=${this.data.id}`
    })
  },

  // 确认收货
  confirmReceive: function() {
    wx.showModal({
      title: '提示',
      content: '确认已收到商品吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          
          wx.request({
            url: app.globalData.baseUrl + '/api/order/confirm',
            method: 'POST',
            data: {
              openid: app.globalData.openid,
              id: this.data.id
            },
            success: res => {
              if (res.data && res.data.code === 0) {
                wx.showToast({
                  title: '确认成功',
                  icon: 'success'
                })
                
                // 刷新订单详情
                this.fetchOrderDetail()
              } else {
                wx.showToast({
                  title: res.data.message || '确认失败',
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
        }
      }
    })
  },

  // 再次购买
  buyAgain: function() {
    // 将订单中的商品添加到购物车
    this.addProductsToCart(this.data.orderDetail.products)
  },

  // 将商品添加到购物车
  addProductsToCart: function(products) {
    let count = 0
    const total = products.length
    
    wx.showLoading({ title: '处理中...' })
    
    products.forEach(product => {
      wx.request({
        url: app.globalData.baseUrl + '/api/cart/add',
        method: 'POST',
        data: {
          openid: app.globalData.openid,
          productId: product.productId,
          specId: product.specId || '',
          quantity: product.quantity
        },
        success: res => {
          if (res.data && res.data.code === 0) {
            count++
            
            if (count === total) {
              wx.hideLoading()
              wx.showToast({
                title: '已添加到购物车',
                icon: 'success'
              })
              
              // 更新购物车数量
              app.getCartCount()
              
              // 跳转到购物车页面
              wx.switchTab({
                url: '/pages/cart/index'
              })
            }
          } else {
            wx.hideLoading()
            wx.showToast({
              title: res.data.message || '添加失败',
              icon: 'none'
            })
          }
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          })
        }
      })
    })
  },

  // 评价订单
  writeReview: function() {
    wx.navigateTo({
      url: `/pages/review/index?orderId=${this.data.id}`
    })
  },

  // 联系客服
  contactService: function() {
    // 这里可以使用微信小程序的客服功能
    // 或者跳转到自定义的客服页面
  },

  // 跳转到商品详情
  navigateToProduct: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/index?id=${id}`
    })
  },

  // 显示登录提示
  showLoginModal: function() {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      success: res => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/user/index'
          })
        } else {
          wx.navigateBack()
        }
      }
    })
  }
})
