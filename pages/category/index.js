// pages/category/index.js
const app = getApp();

Page({
  data: {
    // --- 页面状态 ---
    isLoading: false,    // 是否正在加载商品数据
    isEnd: false,        // 是否已加载所有商品
    isEmpty: false,      // 当前条件下是否无商品 (第一页加载后判断)
    isPageError: false,  // 页面级错误（如网络错误）
    errorMessage: "",

    // --- 数据存储 ---
    products: [],        // 当前显示的商品列表
    
    // --- 分页参数 ---
    page: 1,
    pageSize: 10, // 每页加载数量

    // --- 筛选/分类参数 ---
    filterType: null,      // 'new', 'hot', or null
    currentCategoryId: null, 
    
    // --- 左侧分类导航 ---
    leftCategories: [], 
    currentLeftCategoryIndex: 0, 
    showLeftCategories: false, 

    lastInteractionTime: Date.now() 
  },

  onLoad: function (options) {
    console.log('Category page onLoad, options:', JSON.stringify(options));
    this.setData({ lastInteractionTime: Date.now() });
    
    if (options.id) { 
      this.setData({ 
        currentCategoryId: options.id, 
        filterType: null, 
        showLeftCategories: true 
      }); 
      this.fetchAndSetCategoryInfo(options.id, () => {
        this.fetchLeftCategories(options.id); 
        this.resetAndLoadProducts();
      });
    } else if (options.type) { 
        let title = "商品列表";
        if (options.type === 'new') {
            title = "新品尝鲜";
            this.setData({ filterType: 'new', currentCategoryId: null, showLeftCategories: false });
        } else if (options.type === 'hot') {
            title = "热销榜单";
            this.setData({ filterType: 'hot', currentCategoryId: null, showLeftCategories: false });
        }
        wx.setNavigationBarTitle({ title: title });
        this.resetAndLoadProducts();
    } else {
      console.log('No specific id or type in onLoad. Will load default categories or use global filter in onShow.');
      if (!app.globalData.categoryPageFilter || Object.keys(app.globalData.categoryPageFilter).length === 0) {
        this.fetchLeftCategoriesAndFirstCategoryProducts();
      }
    }
  },

  onShow: function() {
    console.log('Category page onShow triggered');
    this.setData({ lastInteractionTime: Date.now() });

    if (app.globalData.categoryPageFilter && Object.keys(app.globalData.categoryPageFilter).length > 0) {
      const filter = app.globalData.categoryPageFilter;
      console.log('Found categoryPageFilter in globalData:', JSON.stringify(filter));
      let title = "商品列表";
      if (filter.type === 'new') {
        title = "新品尝鲜";
      } else if (filter.type === 'hot') {
        title = "热销榜单";
      }
      wx.setNavigationBarTitle({ title: title });
      this.setData({
        filterType: filter.type,
        currentCategoryId: filter.categoryId || null, // Ensure categoryId is also handled if passed
        showLeftCategories: !filter.type, // Only show left categories if not a 'new' or 'hot' filter
        products: [], 
        page: 1,
        isEnd: false,
        isEmpty: false,
        isPageError: false,
      });
      delete app.globalData.categoryPageFilter; 
      this.fetchProductsFromCloud(); 
    } else if (this.data.products.length === 0 && !this.data.isLoading && !this.data.isPageError) {
      console.log("Category page onShow: No global filter, products empty. Reloading based on current state or default.");
      if (this.data.filterType || this.data.currentCategoryId) {
        this.resetAndLoadProducts();
      } else if (this.data.leftCategories.length === 0) { 
        this.fetchLeftCategoriesAndFirstCategoryProducts();
      }
    }
  },

  fetchAndSetCategoryInfo: async function(categoryId, callback) {
    if (!categoryId) {
      if (callback) callback();
      return;
    }
    console.log(`Fetching info for category ID: ${categoryId}`);
    try {
      // Assuming categories are fetched and stored in leftCategories or fetched directly
      const category = this.data.leftCategories.find(cat => cat._id === categoryId);
      if (category) {
        wx.setNavigationBarTitle({ title: category.name || `分类商品` });
      } else {
        // Fallback if not in leftCategories (e.g., direct link)
        const res = await wx.cloud.database().collection('categories').doc(categoryId).get();
        if (res.data) {
          wx.setNavigationBarTitle({ title: res.data.name || `分类商品` });
        } else {
          wx.setNavigationBarTitle({ title: `分类商品` });
        }
      }
    } catch (error) {
      console.error("Failed to fetch category info:", error);
      wx.setNavigationBarTitle({ title: `分类商品` });
    } finally {
      if (callback) callback();
    }
  },
  
  fetchLeftCategories: async function(activeCategoryId = null) {
    console.log("Fetching left categories, active ID:", activeCategoryId);
    this.setData({ isLoading: true });
    try {
        const res = await wx.cloud.callFunction({ name: 'getCategories' });
        if (res.result && res.result.code === 0 && Array.isArray(res.result.data)) {
            const categories = res.result.data;
            let activeIndex = 0;
            if (activeCategoryId) {
                const foundIndex = categories.findIndex(cat => cat._id === activeCategoryId);
                if (foundIndex !== -1) {
                    activeIndex = foundIndex;
                }
            }
            this.setData({
                leftCategories: categories,
                currentLeftCategoryIndex: activeIndex,
                showLeftCategories: categories.length > 0,
                isLoading: false
            });
            if (!activeCategoryId && categories.length > 0) {
                this.setData({ currentCategoryId: categories[0]._id });
                wx.setNavigationBarTitle({ title: categories[0].name || "商品列表" });
            } else if (activeCategoryId && categories[activeIndex]) {
                 wx.setNavigationBarTitle({ title: categories[activeIndex].name || "商品列表" });
            }
        } else {
            this.setData({ leftCategories: [], showLeftCategories: false, isLoading: false });
            this.showError((res.result && res.result.message) || "加载分类列表失败");
        }
    } catch (error) {
        console.error("Failed to fetch left categories:", error);
        this.showError("加载分类列表失败");
        this.setData({ isLoading: false, isPageError: true, errorMessage: "加载分类列表失败" });
    }
  },

  fetchLeftCategoriesAndFirstCategoryProducts: async function() {
    this.setData({ isLoading: true, isPageError: false, errorMessage: '', showLeftCategories: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getCategories' });
      if (res.result && res.result.code === 0 && Array.isArray(res.result.data) && res.result.data.length > 0) {
        const categories = res.result.data;
        this.setData({
          leftCategories: categories,
          currentLeftCategoryIndex: 0,
          currentCategoryId: categories[0]._id, 
          filterType: null,
        });
        wx.setNavigationBarTitle({ title: categories[0].name || "商品列表" }); 
        this.resetAndLoadProducts(); 
      } else {
        this.setData({ isEmpty: true, leftCategories: [], products: [], isLoading: false }); 
        wx.setNavigationBarTitle({ title: "暂无分类" });
        this.showError((res.result && res.result.message) || "暂无分类数据");
      }
    } catch (error) {
      console.error("Failed to fetch left categories and first products:", error);
      this.showError("加载分类失败");
      this.setData({ isPageError: true, errorMessage: "加载分类失败", products: [], isLoading: false });
    }
  },

  resetAndLoadProducts: function() {
    console.log("Resetting and loading products for filter/category:", this.data.filterType, this.data.currentCategoryId);
    this.setData({
      products: [],
      page: 1,
      isEnd: false,
      isLoading: false, 
      isEmpty: false,
      isPageError: false,
      errorMessage: ''
    });
    this.fetchProductsFromCloud(false); 
  },

  fetchProductsFromCloud: function (isLoadMore = false) {
    if (this.data.isLoading && isLoadMore) { // Allow initial load even if isLoading is true from category fetch
        console.log("Already loading more products, request skipped.");
        return;
    }
    if (isLoadMore && this.data.isEnd) { 
        console.log("Already at end, not fetching more.");
        return;
    }
    
    if (!this.data.filterType && !this.data.currentCategoryId) {
        console.log("No filterType or currentCategoryId to fetch products. Aborting.");
        this.setData({ isEmpty: true, products: [], isLoading: false, isEnd: true });
        return;
    }

    this.setData({ isLoading: true, isPageError: false }); // Reset isPageError for new attempt
    if (!isLoadMore) { 
        this.setData({ page: 1, products: [], isEnd: false, isEmpty: false });
    }

    const params = {
      action: 'list',
      page: this.data.page,
      pageSize: this.data.pageSize, // Ensure cloud function uses 'pageSize' or maps 'limit' to it
    };

    if (this.data.filterType === 'new') {
      params.isNew = true;
    } else if (this.data.filterType === 'hot') {
      params.isHot = true;
    } else if (this.data.currentCategoryId) { 
      params.categoryId = this.data.currentCategoryId;
    }
    
    console.log('[CategoryPage] Calling getProducts with params:', JSON.stringify(params));

    wx.cloud.callFunction({
      name: 'getProducts',
      data: params,
    })
    .then(res => {
      console.log('[CategoryPage] getProducts response:', JSON.stringify(res));
      if (res.result && res.result.code === 0 && res.result.data) {
        const newProducts = Array.isArray(res.result.data.list) ? res.result.data.list : [];
        
        newProducts.forEach(p => {
            // Basic image path handling (more robust handling might be in cloud function)
            if (p.imageUrl && !p.mainImage) { 
                p.mainImage = p.imageUrl; 
            }
        });

        this.setData({
          products: isLoadMore ? this.data.products.concat(newProducts) : newProducts,
          isEnd: newProducts.length < this.data.pageSize,
          page: this.data.page + 1, 
          isEmpty: !isLoadMore && newProducts.length === 0, // Check isEmpty only on first load
        });
      } else {
        const errMsg = (res.result && res.result.message) ? res.result.message : '加载商品列表失败';
        console.error('[CategoryPage] Failed to fetch products from cloud or bad response:', errMsg, 'Full result:', JSON.stringify(res.result));
        
        if (!isLoadMore) this.setData({ isEmpty: true, products: [], isPageError: true, errorMessage: errMsg }); 
        this.setData({ isEnd: true }); 
        // Don't show toast here if isPageError is true, as the WXML will display the error message
        // this.showError(errMsg); 
      }
    })
    .catch(err => {
      console.error('[CategoryPage] Failed to call getProducts cloud function:', err);
      const errMsg = '网络请求失败，请检查您的网络连接。';
      if (!isLoadMore) this.setData({ isEmpty: true, products: [], isPageError: true, errorMessage: errMsg });
      this.setData({ isEnd: true });
      // this.showError(errMsg);
    })
    .finally(() => {
      this.setData({ isLoading: false });
      wx.stopPullDownRefresh();
    });
  },

  onPullDownRefresh: function () {
    console.log('Category page pull down refresh');
    this.setData({ lastInteractionTime: Date.now() });
    this.resetAndLoadProducts();
  },

  onReachBottom: function () {
    console.log('Category page reach bottom');
    this.setData({ lastInteractionTime: Date.now() });
    this.fetchProductsFromCloud(true); 
  },

  onProductTap: function(e) {
    const productId = e.currentTarget.dataset.id;
    console.log("Product tapped, ID:", productId);
    if (productId) {
      wx.navigateTo({
        url: `/pages/detail/index?id=${productId}`
      });
    } else {
        console.warn("Product tap: productId is undefined or null", e.currentTarget.dataset);
    }
  },

  goHome: function() {
    wx.switchTab({
      url: '/pages/index/index',
    });
  },

  onLeftCategoryTap: function(e) {
    const index = e.currentTarget.dataset.index;
    if (index === undefined || !this.data.leftCategories[index]) {
        console.warn("Invalid index or category for left tap:", index);
        return;
    }
    const category = this.data.leftCategories[index];
    
    if (this.data.currentLeftCategoryIndex === index && this.data.currentCategoryId === category._id && !this.data.filterType) {
        console.log("Category already selected:", category.name);
        return; 
    }
    console.log("Left category tapped:", category.name, category._id);

    wx.setNavigationBarTitle({ title: category.name || "商品列表" });
    this.setData({
      currentLeftCategoryIndex: index,
      currentCategoryId: category._id, 
      filterType: null, 
      showLeftCategories: true, // Ensure left categories remain visible
    });
    this.resetAndLoadProducts();
  },
  
  retryLoadProducts: function() {
    console.log('Retrying to load products...');
    this.setData({
      isPageError: false, // Reset error state
      errorMessage: '',
      isLoading: false, // Reset loading state to allow fetch
    });
    // Determine what to load based on current state
    if (this.data.filterType || this.data.currentCategoryId) {
        this.resetAndLoadProducts();
    } else {
        this.fetchLeftCategoriesAndFirstCategoryProducts(); // Default load
    }
  },

  showError: function(message) { // This is for toasts, not the page error display
    wx.showToast({
      title: message || '发生错误',
      icon: 'none',
      duration: 2500
    });
  }
});
