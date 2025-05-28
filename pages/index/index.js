// modified_project/pages/index/index.js
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
      imageUrl: '' // 默认logo
    },
    isLoading: true,
    isPageError: false,
    errorMessage: '',
    isHotProductsLoading: false,
    isHotProductsEnd: false,
    hotProductsPage: 1,
    hotProductsPageSize: 6,
    lastInteractionTime: Date.now(), // 用于页面状态管理
    searchKeyword: '', // 新增：用于绑定搜索框输入内容
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
    if (app.globalData.openid && typeof app.getCartCount === 'function') {
      app.getCartCount();
    }
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
      banners: [],
      categories: [],
      newProducts: [],
      hotProducts: [],
      coupons: [],
      brandInfo: { title: '火山零食小卖部', description: '加载中...', imageUrl: '' },
      isLoading: true,
      isPageError: false,
      errorMessage: '',
      searchKeyword: '' // 下拉刷新时也清空搜索词
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
          // 确保这个云存储路径是有效的，或者替换为您的实际默认logo路径
          imageUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/logo/logo.png'
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

  // --- 搜索相关方法 ---
  onSearchInput: function(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  clearSearchKeyword: function() {
    this.setData({
      searchKeyword: ''
    });
  },

  onSearchConfirm: function() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      wx.showToast({
        title: '请输入搜索关键词',
        icon: 'none'
      });
      return;
    }
    // 跳转到分类页，并带上搜索参数
    // 分类页的 onLoad 需要能接收 keyword 参数
    // 同时，为了让分类页知道这是搜索模式，而不是普通的分类浏览，可以考虑再加一个参数 type=search
    // 或者，分类页逻辑里判断，如果有 keyword，则认为是搜索。
    console.log(`准备搜索，关键词: ${keyword}`);
    app.globalData.categoryPageFilter = {
      keyword: keyword,
      // type: 'search' // 可选，用于明确告知分类页是搜索模式
    };
    wx.switchTab({
      url: '/pages/category/index',
      success: () => {
        // 跳转成功后，可以清空首页的搜索框，或者不清空由用户决定
        // this.setData({ searchKeyword: '' }); 
      },
      fail: (err) => {
        console.error('跳转到分类页进行搜索失败:', err);
        delete app.globalData.categoryPageFilter; // 清理全局过滤器，以防影响下次正常进入分类页
        wx.showToast({ title: '无法打开搜索结果页', icon: 'none' });
      }
    });
  },

  // --- 其他事件处理函数 ---
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
      wx.showToast({ title: '暂不支持打开外部链接', icon: 'none' });
    }
  },

  onCategoryTap: function(e) {
    const categoryId = e.currentTarget.dataset.id;
    console.log('Category tapped, ID:', categoryId, 'Type:', typeof categoryId);
    if (categoryId) {
      app.globalData.categoryPageFilter = {
        categoryId: categoryId
      };
      wx.switchTab({
        url: '/pages/category/index',
        fail: (err) => {
          console.error('跳转到分类页失败 (onCategoryTap):', err);
          delete app.globalData.categoryPageFilter;
          wx.showToast({ title: '无法打开分类页面', icon: 'none' });
        }
      });
    } else {
      wx.showToast({ title: '无效的分类选择', icon: 'none' });
    }
  },

  onCouponTap: function(e) {
    const couponTemplateId = e.currentTarget.dataset.id;
    console.log('Attempting to receive coupon, Template ID:', couponTemplateId);
    if (!couponTemplateId) {
      this.showError('优惠券信息错误，无法领取');
      return;
    }
    if (!app.globalData.openid) {
      wx.showModal({
        title: '登录提示',
        content: '请先登录后再领取优惠券哦~',
        confirmText: '去登录',
        cancelText: '暂不领取',
        success: res => {
          if (res.confirm) { wx.switchTab({ url: '/pages/user/index' }); }
        }
      });
      return;
    }
    wx.showLoading({ title: '正在领取...' });
    wx.cloud.callFunction({
      name: 'coupon',
      data: { action: 'receive', templateId: couponTemplateId }
    })
    .then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: res.result.message || '领取成功！', icon: 'success', duration: 2000 });
        const updatedCoupons = this.data.coupons.map(c => {
          if (c._id === couponTemplateId) { return { ...c, received: true }; }
          return c;
        });
        this.setData({ coupons: updatedCoupons });
      } else {
        this.showError((res.result && res.result.message) || '领取失败，请稍后再试');
      }
    })
    .catch(err => {
      wx.hideLoading();
      this.showError('网络繁忙，领取失败');
      console.error("[pages/index.js] 调用 coupon 云函数 (receive) 失败:", err);
    });
  },

  onMoreCouponTap: function() {
    wx.navigateTo({ url: '/pages/coupon/index' });
  },

  onProductTap: function(e) {
    const productId = e.currentTarget.dataset.id;
    console.log('Product tapped, ID:', productId);
    if (productId) {
      wx.navigateTo({ url: `/pages/detail/index?id=${productId}` });
    }
  },

  onMoreNewProductTap: function() {
    app.globalData.categoryPageFilter = { type: 'new' };
    wx.switchTab({
      url: '/pages/category/index',
      fail: () => { delete app.globalData.categoryPageFilter; }
    });
  },

  onMoreHotProductTap: function() {
    app.globalData.categoryPageFilter = { type: 'hot' };
    wx.switchTab({
      url: '/pages/category/index',
      fail: () => { delete app.globalData.categoryPageFilter; }
    });
  },

  onBrandTap: function() {
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