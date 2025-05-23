// coupon/index.js
const app = getApp()

Page({
  data: {
    currentTab: 'available', // 当前选中的标签页：available, used, expired
    coupons: [], // 优惠券列表
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
      coupons: [],
      hasMore: true
    })
    this.fetchCoupons()
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    // 重置页码并重新加载数据
    this.setData({
      page: 1,
      coupons: [],
      hasMore: true
    })
    this.fetchCoupons().then(() => {
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
      coupons: [],
      hasMore: true
    })
    
    this.fetchCoupons()
  },

  // 获取优惠券列表
  fetchCoupons: function() {
    if (!app.globalData.openid) {
      this.showLoginModal()
      return Promise.resolve()
    }
    
    this.setData({ isLoading: true })
    
    // 构建请求参数
    const params = {
      openid: app.globalData.openid,
      status: this.data.currentTab,
      page: this.data.page,
      pageSize: this.data.pageSize
    }
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.baseUrl + '/api/coupon/list',
        method: 'GET',
        data: params,
        success: res => {
          if (res.data && res.data.code === 0) {
            const newCoupons = res.data.data.list || []
            
            // 更新优惠券列表和分页信息
            this.setData({
              coupons: this.data.page === 1 ? newCoupons : this.data.coupons.concat(newCoupons),
              hasMore: newCoupons.length === this.data.pageSize
            })
          } else {
            wx.showToast({
              title: res.data.message || '获取优惠券失败',
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
      this.fetchCoupons()
    }
  },

  // 使用优惠券
  useCoupon: function(e) {
    const id = e.currentTarget.dataset.id
    
    // 如果是从订单确认页面跳转过来选择优惠券
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    
    if (prevPage && prevPage.route === 'pages/orderConfirm/index') {
      // 查找选中的优惠券
      const coupon = this.data.coupons.find(item => item.id === id)
      
      if (coupon) {
        // 将选中的优惠券传回上一页
        if (prevPage.selectCoupon) {
          prevPage.selectCoupon(coupon)
        }
        
        wx.navigateBack()
      }
    } else {
      // 普通查看，跳转到首页
      wx.switchTab({
        url: '/pages/index/index'
      })
    }
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
