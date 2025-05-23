// orderList/index.js
const app = getApp()

Page({
  data: {
    currentTab: 'all', // 当前选中的标签页：all, unpaid, unshipped, shipped, completed
    orders: [], // 订单列表
    page: 1, // 当前页码
    pageSize: 10, // 每页数量
    hasMore: true, // 是否有更多数据
    isLoading: false // 是否正在加载
  },

  onLoad: function(options) {
    // 如果有传入类型参数，则切换到对应标签页
    if (options.type) {
      this.setData({ currentTab: options.type })
    }
  },

  onShow: function() {
    // 重置页码并重新加载数据
    this.setData({
      page: 1,
      orders: [],
      hasMore: true
    })
    this.fetchOrders()
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    // 重置页码并重新加载数据
    this.setData({
      page: 1,
      orders: [],
      hasMore: true
    })
    this.fetchOrders().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 上拉加载更多
  onReachBottom: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMore()
    }
  },

  // 切换标签页
  switchTab: function(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.currentTab) return
    
    this.setData({
      currentTab: type,
      page: 1,
      orders: [],
      hasMore: true
    })
    
    this.fetchOrders()
  },

  // 获取订单列表
  fetchOrders: function() {
    if (!app.globalData.openid) {
      this.showLoginModal()
      return Promise.resolve()
    }
    
    this.setData({ isLoading: true })
    
    // 构建请求参数
    const params = {
      openid: app.globalData.openid,
      page: this.data.page,
      pageSize: this.data.pageSize
    }
    
    // 根据当前标签页添加状态过滤
    if (this.data.currentTab !== 'all') {
      params.status = this.data.currentTab
    }
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.baseUrl + '/api/order/list',
        method: 'GET',
        data: params,
        success: res => {
          if (res.data && res.data.code === 0) {
            const newOrders = res.data.data.list || []
            
            // 处理订单数据
            newOrders.forEach(order => {
              // 计算商品总数量
              order.totalQuantity = order.products.reduce((sum, product) => sum + product.quantity, 0)
              
              // 根据状态设置状态文本
              switch (order.status) {
                case 'unpaid':
                  order.statusText = '待付款'
                  break
                case 'unshipped':
                  order.statusText = '待发货'
                  break
                case 'shipped':
                  order.statusText = '待收货'
                  break
                case 'completed':
                  order.statusText = '已完成'
                  break
                case 'cancelled':
                  order.statusText = '已取消'
                  break
                case 'refunding':
                  order.statusText = '退款中'
                  break
                case 'refunded':
                  order.statusText = '已退款'
                  break
                default:
                  order.statusText = '未知状态'
              }
            })
            
            // 更新订单列表和分页信息
            this.setData({
              orders: this.data.page === 1 ? newOrders : this.data.orders.concat(newOrders),
              hasMore: newOrders.length === this.data.pageSize
            })
          } else {
            wx.showToast({
              title: res.data.message || '获取订单失败',
              icon: 'none'
            })
          }
          resolve()
        },
        fail: err => {
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          })
          reject(err)
        },
        complete: () => {
          this.setData({ isLoading: false })
        }
      })
    })
  },

  // 加载更多
  loadMore: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({
        page: this.data.page + 1
      })
      this.fetchOrders()
    }
  },

  // 跳转到订单详情
  navigateToDetail: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/orderDetail/index?id=${id}`
    })
  },

  // 取消订单
  cancelOrder: function(e) {
    const id = e.currentTarget.dataset.id
    
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
              id: id
            },
            success: res => {
              if (res.data && res.data.code === 0) {
                wx.showToast({
                  title: '取消成功',
                  icon: 'success'
                })
                
                // 刷新订单列表
                this.onShow()
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
  payOrder: function(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showLoading({ title: '获取支付信息...' })
    
    wx.request({
      url: app.globalData.baseUrl + '/api/order/pay',
      method: 'POST',
      data: {
        openid: app.globalData.openid,
        id: id
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
                url: `/pages/payResult/index?orderId=${id}&status=success`
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
  viewLogistics: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/logistics/index?id=${id}`
    })
  },

  // 确认收货
  confirmReceive: function(e) {
    const id = e.currentTarget.dataset.id
    
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
              id: id
            },
            success: res => {
              if (res.data && res.data.code === 0) {
                wx.showToast({
                  title: '确认成功',
                  icon: 'success'
                })
                
                // 刷新订单列表
                this.onShow()
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
  buyAgain: function(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showLoading({ title: '处理中...' })
    
    wx.request({
      url: app.globalData.baseUrl + '/api/order/detail',
      method: 'GET',
      data: {
        openid: app.globalData.openid,
        id: id
      },
      success: res => {
        if (res.data && res.data.code === 0) {
          const order = res.data.data
          
          // 将订单中的商品添加到购物车
          this.addProductsToCart(order.products)
        } else {
          wx.showToast({
            title: res.data.message || '获取订单失败',
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

  // 将商品添加到购物车
  addProductsToCart: function(products) {
    let count = 0
    const total = products.length
    
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
            wx.showToast({
              title: res.data.message || '添加失败',
              icon: 'none'
            })
          }
        },
        fail: () => {
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          })
        }
      })
    })
  },

  // 评价订单
  writeReview: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/review/index?orderId=${id}`
    })
  },

  // 联系客服
  contactService: function() {
    // 这里可以使用微信小程序的客服功能
    // 或者跳转到自定义的客服页面
  },

  // 跳转到商城首页
  navigateToShop: function() {
    wx.switchTab({
      url: '/pages/index/index'
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
        }
      }
    })
  }
})
