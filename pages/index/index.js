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
      title: '汪汪零食铺',
      description: '加载中...',
      imageUrl: '' 
    },
    isLoading: true, 
    isPageError: false, 
    errorMessage: '',   
    isHotProductsLoading: false, 
    isHotProductsEnd: false, 
    hotProductsPage: 1, 
    hotProductsPageSize: 6, 
    lastInteractionTime: Date.now()
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
    if (app.globalData.openid) {
      app.getCartCount(); 
    }
    if (this.data.banners.length === 0 && !this.data.isLoading && !this.data.isPageError) {
      console.log('Page showed with no data and not loading, refetching home data.');
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
      brandInfo: { title: '汪汪零食铺', description: '加载中...', imageUrl: ''},
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
        console.log('[pages/index.js] 云函数成功返回数据: ', JSON.stringify(data));

        const banners = Array.isArray(data.banners) ? data.banners : [];
        const categories = Array.isArray(data.categories) ? data.categories : [];
        const coupons = Array.isArray(data.coupons) ? data.coupons : [];
        const newProducts = Array.isArray(data.newProducts) ? data.newProducts : [];
        const hotProducts = Array.isArray(data.hotProducts) ? data.hotProducts : [];
        const brandInfo = (typeof data.brandInfo === 'object' && data.brandInfo !== null) 
                          ? data.brandInfo 
                          : { title: '汪汪零食铺', description: '品质保证，爱宠首选', imageUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/logo/logo.png' }; 
        
        banners.forEach((b, i) => { if (!b.imageUrl) console.warn(`Banner ${i} 缺少 imageUrl:`, b); });
        categories.forEach((c, i) => { if (!c.iconUrl) console.warn(`Category ${i} 缺少 iconUrl:`, c); });
        newProducts.forEach((p, i) => { if (!p.mainImage) console.warn(`NewProduct ${i} 缺少 mainImage:`, p); });
        hotProducts.forEach((p, i) => { if (!p.mainImage) console.warn(`HotProduct ${i} 缺少 mainImage:`, p); });
        if (brandInfo && !brandInfo.imageUrl) console.warn('BrandInfo 缺少 imageUrl:', brandInfo);

        this.setData({
          banners: banners,
          categories: categories,
          coupons: coupons, 
          newProducts: newProducts,
          hotProducts: hotProducts, 
          brandInfo: brandInfo, 
          hotProductsPage: 1, 
          isHotProductsEnd: hotProducts.length < this.data.hotProductsPageSize, 
          isLoading: false
        });
        console.log('[pages/index.js] setData 完成，当前data keys:', Object.keys(this.data));
      } else {
        const errMsg = (res.result && res.result.message) ? res.result.message : '获取首页数据失败';
        console.error('[pages/index.js] getHomeData 返回错误或数据问题: ', errMsg, '完整result:', JSON.stringify(res.result));
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
    if (this.data.isHotProductsEnd || this.data.isHotProductsLoading) {
      return;
    }
    this.setData({ isHotProductsLoading: true });
    const nextPage = this.data.hotProductsPage + 1;

    console.log(`[pages/index.js] 调用 getProducts (for hot) - action: list, isHot: true, page: ${nextPage}`);
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
      console.log('[pages/index.js] getProducts (for hot) 云函数返回: ', JSON.stringify(res));
      if (res.result && res.result.code === 0 && res.result.data && Array.isArray(res.result.data.list)) {
        const moreProducts = res.result.data.list;
        moreProducts.forEach((p,i) => { if (!p.mainImage) console.warn(`More HotProduct ${i} 缺少 mainImage:`, p); });
        this.setData({
          hotProducts: this.data.hotProducts.concat(moreProducts), 
          hotProductsPage: nextPage,
          isHotProductsEnd: moreProducts.length < this.data.hotProductsPageSize, 
        });
      } else {
        this.setData({ isHotProductsEnd: true }); 
        if (res.result && res.result.message && res.result.code !== 0) {
             this.showError(res.result.message); 
        } else if (res.result && res.result.code === 0 && (!res.result.data || !res.result.data.list || res.result.data.list.length === 0)){
            console.log('没有更多热销商品了。');
        } else {
            console.log('加载更多热销商品时返回未知结构或错误:', res.result);
            if (res.result && res.result.message) {
                this.showError(res.result.message);
            }
        }
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
      // **如果 category 也是 TabBar 页，这里也需要改成 switchTab**
      // **并使用 app.globalData 传递 categoryId**
      // app.globalData.targetCategoryId = item.linkId;
      // wx.switchTab({ url: `/pages/category/index` });
      // **如果 category 不是 TabBar 页，则 navigateTo 可以保留**
      wx.navigateTo({ url: `/pages/category/index?id=${item.linkId}` });
    } else if (item.linkType === 'webview' && item.linkUrl) {
      console.log('WebView link tapped, URL:', item.linkUrl);
      wx.showToast({ title: '暂不支持打开外部链接', icon: 'none'});
    } else {
      console.log('未处理的Banner链接类型或参数缺失:', item);
    }
  },

  onCategoryTap: function(e) {
    const categoryId = e.currentTarget.dataset.id;
    console.log('Category tapped, ID:', categoryId); 
    if (categoryId) {
      // **如果 category 是 TabBar 页，这里也需要改成 switchTab**
      // **并使用 app.globalData 传递 categoryId**
      // app.globalData.targetCategoryId = categoryId;
      // wx.switchTab({ 
      //   url: `/pages/category/index`,
      //   fail: (err) => { console.error('SwitchTab to category failed:', err); }
      // });
      // **如果 category 不是 TabBar 页，则 navigateTo 可以保留**
       wx.navigateTo({ url: `/pages/category/index?id=${categoryId}` });
    }
  },

  onCouponTap: function(e) {
    const couponId = e.currentTarget.dataset.id; 
    console.log('Coupon tapped, ID:', couponId); 
    wx.navigateTo({
      url: '/pages/coupon/index' 
    });
  },

  onMoreCouponTap: function() {
    console.log('More coupons tapped'); 
    wx.navigateTo({
      url: '/pages/coupon/index'
    });
  },

  onProductTap: function(e) {
    const productId = e.currentTarget.dataset.id;
    console.log('Product tapped, ID:', productId); 
    if (productId) {
      wx.navigateTo({
        url: `/pages/detail/index?id=${productId}`
      });
    } else {
      console.warn('Product tap missing ID:', e.currentTarget.dataset);
    }
  },

  onMoreNewProductTap: function() {
    console.log('Attempting to navigate to New Products via TabBar...');
    app.globalData.categoryPageFilter = { type: 'new' }; // 存入全局数据
    wx.switchTab({
      url: '/pages/category/index', // TabBar路径不需要参数
      success: function(res) {
        console.log('Successfully switched to Category Tab for New Products:', res);
      },
      fail: function(err) {
        console.error('Failed to switch to Category Tab for New Products:', err);
        // 如果 switchTab 失败，可能是路径不对或 app.json 配置问题
        // 清理一下全局数据，避免影响下次
        delete app.globalData.categoryPageFilter; 
        wx.showToast({ title: '无法打开分类页面', icon: 'none' });
      }
    });
  },

  onMoreHotProductTap: function() {
    console.log('Attempting to navigate to Hot Products via TabBar...');
    app.globalData.categoryPageFilter = { type: 'hot' }; // 存入全局数据
    wx.switchTab({
      url: '/pages/category/index', // TabBar路径不需要参数
      success: function(res) {
        console.log('Successfully switched to Category Tab for Hot Products:', res);
      },
      fail: function(err) {
        console.error('Failed to switch to Category Tab for Hot Products:', err);
        delete app.globalData.categoryPageFilter;
        wx.showToast({ title: '无法打开分类页面', icon: 'none' });
      }
    });
  },

  onBrandTap: function() {
    console.log('Brand section tapped'); 
    wx.navigateTo({
      url: '/pages/about/index' 
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
  },
  showError: function(message) {
    wx.showToast({
      title: message || '发生未知错误',
      icon: 'none',
      duration: 2500
    });
  }
})
