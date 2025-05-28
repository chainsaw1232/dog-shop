// pages/favorite/index.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    favorites: [], 
    page: 1, 
    pageSize: 10, 
    hasMore: true, 
    isLoading: false, 
    isLoadingMore: false, // 新增：用于上拉加载更多的状态
    isProcessingAction: false, 
    recommendProducts: [],    // 新增
    isRecommendLoading: false // 新增
  },

  onShow: function() {
    this.setData({
      page: 1,
      favorites: [],
      hasMore: true,
      isProcessingAction: false,
      // recommendProducts: [], // 推荐商品可以不清空，避免重复加载，除非有特定刷新需求
      // isRecommendLoading: false
    });
    this.fetchFavorites();
  },

  onPullDownRefresh: function() {
    this.setData({
      page: 1,
      favorites: [],
      hasMore: true,
      isProcessingAction: false,
      recommendProducts: [], // 下拉刷新时也重新加载推荐
      isRecommendLoading: false
    });
    this.fetchFavorites().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.isLoadingMore && !this.data.isLoading) { // 确保不在初始加载或已在加载更多时触发
      this.loadMoreFavorites();
    }
  },

  fetchFavorites: function(isLoadMore = false) {
    if (!app.globalData.openid) {
      this.showLoginModal();
      this.setData({ 
        isLoading: false, 
        isLoadingMore: false, 
        favorites: [] 
      });
      if (this.data.recommendProducts.length === 0 && !this.data.isRecommendLoading) {
          this.fetchRecommendProducts();
      }
      return Promise.resolve();
    }

    if (!isLoadMore) {
      this.setData({ isLoading: true });
    } else {
      this.setData({ isLoadingMore: true });
    }

    const params = {
      action: 'list',
      page: this.data.page,
      pageSize: this.data.pageSize
    };

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'favorite',
        data: params,
        success: res => {
          if (res.result && res.result.code === 0 && res.result.data) {
            const newFavorites = (res.result.data.list || []).map(fav => ({
                ...fav,
                price: fav.price ? parseFloat(fav.price).toFixed(2) : 
                       (fav.productPrice ? parseFloat(fav.productPrice).toFixed(2) : '0.00'),
                originalPrice: fav.originalPrice ? parseFloat(fav.originalPrice).toFixed(2) : null
            }));
            
            const updatedFavorites = isLoadMore ? this.data.favorites.concat(newFavorites) : newFavorites;
            const hasMoreData = newFavorites.length === this.data.pageSize;

            this.setData({
              favorites: updatedFavorites,
              hasMore: hasMoreData
            });
            
            if (updatedFavorites.length === 0 && this.data.recommendProducts.length === 0 && !this.data.isRecommendLoading) {
              this.fetchRecommendProducts();
            }
            resolve(res.result.data);
          } else {
            const errMsg = (res.result && res.result.message) ? res.result.message : '获取收藏失败';
            wx.showToast({ title: errMsg, icon: 'none' });
            if (this.data.favorites.length === 0 && this.data.recommendProducts.length === 0 && !this.data.isRecommendLoading) {
                this.fetchRecommendProducts();
            }
            reject(new Error(errMsg));
          }
        },
        fail: err => {
          console.error('[pages/favorite/index.js] 云函数 favorite 调用失败 (list):', err);
          wx.showToast({ title: '网络请求失败', icon: 'none' });
          if (this.data.favorites.length === 0 && this.data.recommendProducts.length === 0 && !this.data.isRecommendLoading) {
              this.fetchRecommendProducts();
          }
          reject(err);
        },
        complete: () => {
            if (!isLoadMore) {
                this.setData({ isLoading: false });
            } else {
                this.setData({ isLoadingMore: false });
            }
        }
      });
    });
  },

  loadMoreFavorites: function() { // Renamed from loadMore
    this.setData({ page: this.data.page + 1 }, () => {
      this.fetchFavorites(true); // Pass true for isLoadMore
    });
  },
  
  fetchRecommendProducts: function() {
    if (this.data.isRecommendLoading) return;
    this.setData({ isRecommendLoading: true });

    wx.cloud.callFunction({
      name: 'getProducts', 
      data: {
        action: 'list',
        isRecommend: true, 
        pageSize: 4 
      }
    })
    .then(res => {
      if (res.result && res.result.code === 0 && res.result.data && res.result.data.list) {
        this.setData({
          recommendProducts: res.result.data.list.map(p => ({
              ...p,
              price: p.price ? parseFloat(p.price).toFixed(2) : '0.00'
          })),
        });
      } else {
        this.setData({ recommendProducts: [] });
      }
    })
    .catch(err => {
      console.error('[Favorite Page] 获取推荐商品失败:', err);
      this.setData({ recommendProducts: [] });
    })
    .finally(() => {
        this.setData({ isRecommendLoading: false });
    });
  },

  navigateToDetail: function(e) {
    const productId = e.currentTarget.dataset.id;
    if (productId) {
      wx.navigateTo({
        url: `/pages/detail/index?id=${productId}`
      });
    } else {
      util.showError("商品信息错误");
    }
  },

  addToCart: function(e) {
    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }
    if (this.data.isProcessingAction) return;

    const productId = e.currentTarget.dataset.id;
    if (!productId) {
        util.showError("商品ID错误");
        return;
    }

    this.setData({ isProcessingAction: true });
    wx.showLoading({ title: '添加中...' });

    wx.cloud.callFunction({
      name: 'cart',
      data: {
        action: 'add',
        productId: productId,
        quantity: 1
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: res.result.message || '添加成功', icon: 'success' });
          app.getCartCount();
        } else {
          util.showError((res.result && res.result.message) || '添加失败');
        }
      },
      fail: () => {
        util.showError('网络请求失败');
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ isProcessingAction: false });
      }
    });
  },

  removeFavorite: function(e) {
    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }
    if (this.data.isProcessingAction) return;

    const favoriteId = e.currentTarget.dataset.favoriteid;
    const productId = e.currentTarget.dataset.productid;

    if (!favoriteId && !productId) {
        util.showError("无法确定要取消收藏的商品");
        return;
    }

    wx.showModal({
      title: '提示',
      content: '确定要取消收藏该商品吗？',
      success: res => {
        if (res.confirm) {
          this.setData({ isProcessingAction: true });
          wx.showLoading({ title: '处理中...' });

          const params = { action: 'remove' };
          if (favoriteId) {
              params.favoriteId = favoriteId;
          } else {
              params.productId = productId;
          }

          wx.cloud.callFunction({
            name: 'favorite',
            data: params,
            success: cloudRes => {
              if (cloudRes.result && cloudRes.result.code === 0) {
                wx.showToast({ title: '取消成功', icon: 'success' });
                // 优化：直接从本地列表移除，而不是重新调用 onShow 刷新整个列表
                const updatedFavorites = this.data.favorites.filter(item => item._id !== favoriteId);
                this.setData({ favorites: updatedFavorites });

                if (updatedFavorites.length === 0 && this.data.recommendProducts.length === 0 && !this.data.isRecommendLoading) {
                  this.fetchRecommendProducts();
                }
              } else {
                util.showError((cloudRes.result && cloudRes.result.message) || '取消失败');
              }
            },
            fail: () => {
              util.showError('网络请求失败');
            },
            complete: () => {
              wx.hideLoading();
              this.setData({ isProcessingAction: false });
            }
          });
        }
      }
    });
  },

  navigateToShop: function() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  showLoginModal: function() {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      success: res => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/user/index'
          });
        }
      }
    });
  }
});