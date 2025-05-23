// favorite/index.js
const app = getApp()

Page({
  data: {
    favorites: [], // 收藏列表
    page: 1, // 当前页码
    pageSize: 10, // 每页数量
    hasMore: true, // 是否有更多数据
    isLoading: false // 是否正在加载
  },

  onShow: function() {
    // 重置页码并重新加载数据
    this.setData({
      page: 1,
      favorites: [],
      hasMore: true
    })
    this.fetchFavorites()
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    // 重置页码并重新加载数据
    this.setData({
      page: 1,
      favorites: [],
      hasMore: true
    })
    this.fetchFavorites().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 上拉加载更多
  onReachBottom: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMore()
    }
  },

  // 获取收藏列表
  fetchFavorites: function() {
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
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.baseUrl + '/api/favorite/list',
        method: 'GET',
        data: params,
        success: res => {
          if (res.data && res.data.code === 0) {
            const newFavorites = res.data.data.list || []
            
            // 更新收藏列表和分页信息
            this.setData({
              favorites: this.data.page === 1 ? newFavorites : this.data.favorites.concat(newFavorites),
              hasMore: newFavorites.length === this.data.pageSize
            })
          } else {
            wx.showToast({
              title: res.data.message || '获取收藏失败',
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
      this.fetchFavorites()
    }
  },

  // 跳转到商品详情
  navigateToDetail: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/index?id=${id}`
    })
  },

  // 添加到购物车
  addToCart: function(e) {
    if (!app.globalData.openid) {
      this.showLoginModal()
      return
    }
    
    const productId = e.currentTarget.dataset.id
    
    wx.showLoading({ title: '添加中...' })
    
    wx.request({
      url: app.globalData.baseUrl + '/api/cart/add',
      method: 'POST',
      data: {
        openid: app.globalData.openid,
        productId: productId,
        quantity: 1
      },
      success: res => {
        if (res.data && res.data.code === 0) {
          wx.showToast({
            title: '添加成功',
            icon: 'success'
          })
          
          // 更新购物车数量
          app.getCartCount()
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
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  // 取消收藏
  removeFavorite: function(e) {
    if (!app.globalData.openid) {
      this.showLoginModal()
      return
    }
    
    const id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '提示',
      content: '确定要取消收藏该商品吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          
          wx.request({
            url: app.globalData.baseUrl + '/api/favorite/delete',
            method: 'POST',
            data: {
              openid: app.globalData.openid,
              id: id
            },
            success: res => {
              if (res.data && res.data.code === 0) {
                // 更新本地收藏列表
                const favorites = this.data.favorites.filter(item => item.id !== id)
                this.setData({ favorites })
                
                wx.showToast({
                  title: '取消成功',
                  icon: 'success'
                })
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
