// pages/favorite/index.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    favorites: [], // 收藏列表
    page: 1, // 当前页码
    pageSize: 10, // 每页数量
    hasMore: true, // 是否有更多数据
    isLoading: false, // 是否正在加载
    isProcessingAction: false, // 防止重复操作
  },

  onShow: function() {
    this.setData({
      page: 1,
      favorites: [],
      hasMore: true,
      isProcessingAction: false
    });
    this.fetchFavorites();
  },

  onPullDownRefresh: function() {
    this.setData({
      page: 1,
      favorites: [],
      hasMore: true,
      isProcessingAction: false
    });
    this.fetchFavorites().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMore();
    }
  },

  fetchFavorites: function() {
    if (!app.globalData.openid) {
      this.showLoginModal();
      return Promise.resolve();
    }

    this.setData({ isLoading: true });

    const params = {
      action: 'list',
      page: this.data.page,
      pageSize: this.data.pageSize
      // openid is passed via context in cloud function
    };

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'favorite', // Your favorite cloud function name
        data: params,
        success: res => {
          console.log('[pages/favorite/index.js] 云函数 favorite 调用成功 (list):', res);
          if (res.result && res.result.code === 0 && res.result.data) {
            const newFavorites = res.result.data.list || [];
            // Assuming product details like name, image, price are returned by the 'favorite' list action
            // If not, you might need another call or adjust the 'favorite' cloud function
            this.setData({
              favorites: this.data.page === 1 ? newFavorites : this.data.favorites.concat(newFavorites),
              hasMore: newFavorites.length === this.data.pageSize,
              isLoading: false
            });
            resolve(res.result.data);
          } else {
            const errMsg = (res.result && res.result.message) ? res.result.message : '获取收藏失败';
            wx.showToast({ title: errMsg, icon: 'none' });
            this.setData({ isLoading: false });
            reject(new Error(errMsg));
          }
        },
        fail: err => {
          console.error('[pages/favorite/index.js] 云函数 favorite 调用失败 (list):', err);
          wx.showToast({ title: '网络请求失败', icon: 'none' });
          this.setData({ isLoading: false });
          reject(err);
        }
      });
    });
  },

  loadMore: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 });
      this.fetchFavorites();
    }
  },

  navigateToDetail: function(e) {
    const productId = e.currentTarget.dataset.id; // Assuming the favorite item has productId
    if (productId) {
      wx.navigateTo({
        url: `/pages/detail/index?id=${productId}`
      });
    } else {
      console.warn("navigateToDetail: productId not found in dataset", e.currentTarget.dataset);
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
      name: 'cart', // Your cart cloud function name
      data: {
        action: 'add',
        productId: productId,
        quantity: 1
        // specId can be omitted if adding default spec or product has no specs
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '添加成功', icon: 'success' });
          app.getCartCount(); // Update cart badge
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

    const favoriteId = e.currentTarget.dataset.favoriteid; // _id of the favorite record itself
    const productId = e.currentTarget.dataset.productid; // productId as fallback

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
              params.productId = productId; // Fallback to remove by productId
          }

          wx.cloud.callFunction({
            name: 'favorite',
            data: params,
            success: cloudRes => {
              if (cloudRes.result && cloudRes.result.code === 0) {
                wx.showToast({ title: '取消成功', icon: 'success' });
                // Refresh the list by calling onShow or directly manipulating the data
                this.onShow();
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
