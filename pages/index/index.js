// pages/index/index.js
const app = getApp();

Page({
  data: {
    banners: [],
    categories: [],
    coupons: [],
    newProducts: [],
    hotProducts: [],
    brandInfo: {
      title: '火山零食小卖部', // 默认店铺名称
      description: '加载中...',
      imageUrl: '' // 默认logo，建议在云函数中提供一个真实存在的默认路径
    },
    isLoading: true,
    isPageError: false,
    errorMessage: '',
    isHotProductsLoading: false,
    isHotProductsEnd: false,
    hotProductsPage: 1,
    hotProductsPageSize: 6, // 保持与wxml中一致或根据实际情况调整
    lastInteractionTime: Date.now() // 用于页面状态管理
  },

  onLoad: function(options) {
    console.log('pages/index/index.js onLoad triggered');
    this.fetchHomePageData();
  },

  onShow: function() {
    console.log('pages/index/index.js onShow triggered');
    this.setData({
      lastInteractionTime: Date.now()
    });
    // 检查购物车数量
    if (app.globalData.openid && typeof app.getCartCount === 'function') {
      app.getCartCount();
    }
    // 如果页面数据显示为空，并且当前不处于加载中或错误状态，则可以考虑重新加载
    // 但更常见的做法是在onLoad或onPullDownRefresh中加载核心数据
    if (this.data.banners.length === 0 && !this.data.isLoading && !this.data.isPageError) {
      console.log('Index page showed with no data and not loading/error, refetching home data.');
      this.fetchHomePageData();
    }
  },

  onPullDownRefresh: function() {
    console.log('首页下拉刷新...');
    this.setData({
      lastInteractionTime: Date.now(),
      hotProductsPage: 1,
      isHotProductsEnd: false,
      // 清空现有数据以便重新加载
      banners: [],
      categories: [],
      newProducts: [],
      hotProducts: [],
      coupons: [],
      brandInfo: { title: '火山零食小卖部', description: '加载中...', imageUrl: '' },
      isLoading: true,
      isPageError: false,
      errorMessage: ''
    });
    this.fetchHomePageData();
  },

  onReachBottom: function() {
    this.setData({
      lastInteractionTime: Date.now()
    });
    if (!this.data.isHotProductsEnd && !this.data.isHotProductsLoading) {
      console.log('首页上拉加载更多热销商品...');
      this.loadMoreHotProducts();
    } else if (this.data.isHotProductsEnd) {
      console.log('热销商品已全部加载。');
    }
  },

  // 获取首页核心数据
  fetchHomePageData: function() {
    console.log('fetchHomePageData 开始执行...');
    this.setData({ isLoading: true, isPageError: false, errorMessage: '' });
    wx.cloud.callFunction({
      name: 'getHomeData',
      data: {
        pageSize: this.data.hotProductsPageSize
      }
    })
    .then(res => {
      console.log('[pages/index.js] getHomeData 云函数完整返回: ', JSON.stringify(res));
      if (res.result && res.result.code === 0 && res.result.data) {
        const data = res.result.data;
        const defaultBrandInfo = { 
          title: '火山零食小卖部', 
          description: '品质保证，爱宠首选', 
          imageUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/logo/logo.png' // 确保此路径有效
        };

        this.setData({
          banners: Array.isArray(data.banners) ? data.banners : [],
          categories: Array.isArray(data.categories) ? data.categories : [],
          coupons: Array.isArray(data.coupons) ? data.coupons : [],
          newProducts: Array.isArray(data.newProducts) ? data.newProducts : [],
          hotProducts: Array.isArray(data.hotProducts) ? data.hotProducts : [],
          brandInfo: (data.brandInfo && data.brandInfo.title) ? data.brandInfo : defaultBrandInfo,
          hotProductsPage: 1,
          isHotProductsEnd: (Array.isArray(data.hotProducts) ? data.hotProducts.length : 0) < this.data.hotProductsPageSize,
          isLoading: false
        });
      } else {
        const errMsg = (res.result && res.result.message) ? res.result.message : '获取首页数据失败';
        this.showError(errMsg);
        this.setData({ isLoading: false, isPageError: true, errorMessage: errMsg });
      }
    })
    .catch(err => {
      const errMsg = '网络请求失败，请检查网络';
      console.error("[pages/index.js] 调用 getHomeData 云函数失败: ", err);
      this.showError(errMsg);
      this.setData({ isLoading: false, isPageError: true, errorMessage: errMsg });
    })
    .finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载更多热销商品
  loadMoreHotProducts: function() {
    if (this.data.isHotProductsEnd || this.data.isHotProductsLoading) return;
    this.setData({ isHotProductsLoading: true });
    const nextPage = this.data.hotProductsPage + 1;

    wx.cloud.callFunction({
      name: 'getProducts',
      data: {
        action: 'list',
        isHot: true,
        page: nextPage,
        pageSize: this.data.hotProductsPageSize
      }
    })
    .then(res => {
      if (res.result && res.result.code === 0 && res.result.data && Array.isArray(res.result.data.list)) {
        const moreProducts = res.result.data.list;
        this.setData({
          hotProducts: this.data.hotProducts.concat(moreProducts),
          hotProductsPage: nextPage,
          isHotProductsEnd: moreProducts.length < this.data.hotProductsPageSize,
        });
      } else {
        this.setData({ isHotProductsEnd: true });
        if (res.result && res.result.message && res.result.code !== 0) this.showError(res.result.message);
      }
    })
    .catch(err => {
      this.showError('加载更多商品失败');
      console.error("[pages/index.js] 调用 getProducts (for hot) 云函数失败: ", err);
      this.setData({ isHotProductsEnd: true });
    })
    .finally(() => {
      this.setData({ isHotProductsLoading: false });
    });
  },

  // --- 事件处理函数 ---
  onBannerTap: function(e) {
    const item = e.currentTarget.dataset.item;
    console.log('Banner tapped:', item);
    if (!item) return;
    if (item.linkType === 'product' && item.linkId) {
      wx.navigateTo({ url: `/pages/detail/index?id=${item.linkId}` });
    } else if (item.linkType === 'category' && item.linkId) {
      app.globalData.categoryPageFilter = { categoryId: item.linkId };
      wx.switchTab({
        url: '/pages/category/index',
        fail: () => { delete app.globalData.categoryPageFilter; }
      });
    } else if (item.linkType === 'webview' && item.linkUrl) {
      // wx.navigateTo({ url: `/pages/webview/index?url=${encodeURIComponent(item.linkUrl)}` });
      wx.showToast({ title: '暂不支持打开外部链接', icon: 'none' });
    }
  },

  onCategoryTap: function(e) {
    const categoryId = e.currentTarget.dataset.id; // 这个ID现在应该是 item._id (字符串)
    console.log('Category tapped, ID:', categoryId, 'Type:', typeof categoryId);
    if (categoryId) {
      // **关键检查点**：
      // 确保 categoryId 是字符串类型，并且是分类的 _id (例如 "cat_01")
      // 而不是数字类型的 id (例如 1)
      app.globalData.categoryPageFilter = { 
        categoryId: categoryId 
      };
      wx.switchTab({
        url: '/pages/category/index',
        success: function(res) {
          console.log('Successfully switched to Category Tab for categoryId:', categoryId);
        },
        fail: function(err) {
          console.error('Failed to switch to Category Tab:', err);
          delete app.globalData.categoryPageFilter;
          wx.showToast({ title: '无法打开分类页面', icon: 'none' });
        }
      });
    } else {
      console.warn('Category tap missing ID or ID is invalid:', e.currentTarget.dataset);
      wx.showToast({ title: '无效的分类选择', icon: 'none' });
    }
  },

  onCouponTap: function(e) {
    const couponId = e.currentTarget.dataset.id;
    console.log('Coupon tapped, ID:', couponId);
    wx.navigateTo({ url: '/pages/coupon/index' }); // 跳转到优惠券列表页
  },

  onMoreCouponTap: function() {
    console.log('More coupons tapped');
    wx.navigateTo({ url: '/pages/coupon/index' });
  },

  onProductTap: function(e) {
    const productId = e.currentTarget.dataset.id;
    console.log('Product tapped, ID:', productId);
    if (productId) {
      wx.navigateTo({ url: `/pages/detail/index?id=${productId}` });
    } else {
      console.warn('Product tap missing ID:', e.currentTarget.dataset);
    }
  },

  onMoreNewProductTap: function() {
    console.log('Attempting to navigate to New Products via TabBar...');
    app.globalData.categoryPageFilter = { type: 'new' };
    wx.switchTab({
      url: '/pages/category/index',
      fail: () => { delete app.globalData.categoryPageFilter; }
    });
  },

  onMoreHotProductTap: function() {
    console.log('Attempting to navigate to Hot Products via TabBar...');
    app.globalData.categoryPageFilter = { type: 'hot' };
    wx.switchTab({
      url: '/pages/category/index',
      fail: () => { delete app.globalData.categoryPageFilter; }
    });
  },

  onBrandTap: function() {
    console.log('Brand section tapped');
    wx.navigateTo({ url: '/pages/about/index' });
  },

  showError: function(message) {
    wx.showToast({
      title: message || '发生未知错误',
      icon: 'none',
      duration: 2500
    });
  }
});
