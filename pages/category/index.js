// pages/category/index.js
const app = getApp();

Page({
  data: {
    // 页面状态
    isLoading: false,
    isEnd: false,
    isEmpty: false,
    isPageError: false,
    errorMessage: "",

    // 数据存储
    products: [],

    // 分页参数
    page: 1,
    pageSize: 10,

    // 筛选/分类参数
    filterType: null, // 'new', 'hot', or null
    currentCategoryId: null, // 当前选中的分类ID

    // 左侧分类导航
    leftCategories: [], // 左侧分类列表
    currentLeftCategoryIndex: 0, // 当前选中的左侧分类索引
    showLeftCategories: false, // 是否显示左侧分类导航

    lastInteractionTime: Date.now(),
    isProcessingGlobalFilter: false, 
  },

  onLoad: function (options) {
    console.log('Category page onLoad, options:', JSON.stringify(options));
    this.setData({ lastInteractionTime: Date.now() });

    const categoryId = options.categoryId || options.id;

    if (categoryId) {
      // onLoad 主要处理直接通过链接参数打开页面的情况。
      // 对于 switchTab 过来的，onShow 是主要处理入口。
      // 这里预设 currentCategoryId，onShow 中如果发现没有 globalFilter，会使用它。
      this.setData({
        currentCategoryId: categoryId, 
        filterType: null, 
        showLeftCategories: true,
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
    } else {
      console.log('No specific id or type in onLoad. Defaulting or waiting for onShow.');
    }
  },

  onShow: async function () { 
    console.log('Category page onShow triggered. Current isProcessingGlobalFilter:', this.data.isProcessingGlobalFilter);
    this.setData({ lastInteractionTime: Date.now() });

    // 如果当前正在处理上一次的 globalFilter（例如异步操作还没完全结束），则本次 onShow 调用直接返回，防止重入。
    // 这个检查点很重要，因为 switchTab 可能会非常快速地触发 onShow。
    if (this.data.isProcessingGlobalFilter && app.globalData.categoryPageFilter === undefined) {
        console.log("onShow: Exiting because isProcessingGlobalFilter is true and no new globalFilter. Likely an async operation is pending from previous globalFilter processing.");
        return;
    }

    const globalFilter = app.globalData.categoryPageFilter;

    if (globalFilter && Object.keys(globalFilter).length > 0) {
      // 1. 标记开始处理全局过滤器，并立即删除，防止重复处理
      this.setData({ isProcessingGlobalFilter: true }); 
      delete app.globalData.categoryPageFilter; // 删除全局过滤器，确保一次性使用

      const targetCategoryId = globalFilter.categoryId;
      const targetFilterType = globalFilter.type;
      
      console.log('Found and processing categoryPageFilter in globalData:', JSON.stringify(globalFilter));
      
      // 2. 使用 setData 的回调来确保状态更新后再执行后续异步操作
      this.setData({ 
        isLoading: true,
        products: [], // 清空旧商品
        page: 1,
        isEnd: false,
        isEmpty: false,
        isPageError: false,
        errorMessage: "",
        currentCategoryId: targetCategoryId || null, 
        filterType: targetCategoryId ? null : (targetFilterType || null), 
        showLeftCategories: !!targetCategoryId, 
      }, async () => { // setData 的回调函数，此时 this.data 已更新
        let successPathTaken = false; 
        try {
          if (this.data.currentCategoryId) { 
            console.log(`onShow (globalFilter): Processing specific category ID: ${this.data.currentCategoryId}`);
            await this.fetchLeftCategories(this.data.currentCategoryId); 
            await this.fetchAndSetCategoryInfo(this.data.currentCategoryId, null); 
            this.resetAndLoadProducts(); 
            successPathTaken = true;
          } else if (this.data.filterType) { 
            console.log(`onShow (globalFilter): Processing filter type: ${this.data.filterType}`);
            let title = "商品列表";
            if (this.data.filterType === 'new') { title = "新品尝鲜"; }
            else if (this.data.filterType === 'hot') { title = "热销榜单"; }
            wx.setNavigationBarTitle({ title: title });
            this.setData({ showLeftCategories: false }); 
            this.resetAndLoadProducts(); 
            successPathTaken = true;
          } else {
            console.warn("onShow (globalFilter): Global filter present but no actionable categoryId or type.", globalFilter);
            this.setData({isLoading: false, isEmpty: true, isPageError: true, errorMessage: "无效的筛选条件", isProcessingGlobalFilter: false}); 
          }
        } catch (categorySetupError) {
          console.warn("onShow (globalFilter): Error during category setup:", this.data.currentCategoryId, categorySetupError);
          this.setData({isLoading: false, isPageError: true, errorMessage: "分类信息加载失败", isProcessingGlobalFilter: false});
        }
        // 注意：isProcessingGlobalFilter 的最终重置现在主要依赖 fetchProductsFromCloud 的 finally 块
        // 如果上面的 try 块中没有调用到 resetAndLoadProducts (它会调用 fetchProductsFromCloud),
        // 那么 isProcessingGlobalFilter 需要在这里被重置。
        // fetchProductsFromCloud 的 finally 会将 isProcessingGlobalFilter 设为 false。
      });

    } else if (!this.data.isProcessingGlobalFilter) {
      // 仅当没有正在处理 globalFilter 时，才考虑其他加载逻辑
      if ((this.data.products.length === 0 || (!this.data.currentCategoryId && !this.data.filterType)) && !this.data.isLoading && !this.data.isPageError) {
        console.log("onShow: No active global filter, products empty or no category selected. Attempting default load.");
        this.setData({isLoading: true}); 
        try {
          if (this.data.filterType || this.data.currentCategoryId) {
            // 使用页面已有的 filterType 或 currentCategoryId (可能来自 onLoad)
            if (this.data.currentCategoryId) {
                await this.fetchLeftCategories(this.data.currentCategoryId); 
                await this.fetchAndSetCategoryInfo(this.data.currentCategoryId, null);
            } else { 
                wx.setNavigationBarTitle({ title: this.data.filterType === 'new' ? "新品尝鲜" : (this.data.filterType === 'hot' ? "热销榜单" : "商品列表") });
                this.setData({ showLeftCategories: false });
            }
            this.resetAndLoadProducts();
          } else if (this.data.leftCategories.length === 0) { 
            // 首次进入Tab，且左侧分类未加载
            await this.fetchLeftCategoriesAndFirstCategoryProducts();
          } else if (this.data.leftCategories.length > 0 && !this.data.currentCategoryId) {
            // 左侧分类已加载，但没有当前选中的分类ID (例如直接切换Tab过来)
            const firstCategory = this.data.leftCategories[0];
            this.setData({
                currentLeftCategoryIndex: 0,
                currentCategoryId: firstCategory._id,
                filterType: null,
                showLeftCategories: true,
            });
            await this.fetchAndSetCategoryInfo(firstCategory._id, null);
            this.resetAndLoadProducts();
          } else {
            console.log("onShow: No specific loading condition met in fallback block.");
            this.setData({isLoading: false}); 
          }
        } catch (e) {
          console.error("onShow: Error in fallback loading logic:", e);
          this.setData({isLoading: false, isPageError: true, errorMessage: "页面加载失败"});
        }
      } else {
        console.log("onShow: Conditions for fallback loading not met, or already loading/error/has products/processing global filter.");
      }
    } else {
      console.log("onShow: isProcessingGlobalFilter is true, skipping other logic this cycle.");
    }


    if (app.globalData.openid && typeof app.getCartCount === 'function') {
       app.getCartCount();
    }
  },

  fetchAndSetCategoryInfo: function (categoryId, callback) { 
    return new Promise(async (resolve, reject) => {
      if (!categoryId) {
        if (callback) callback();
        resolve();
        return;
      }
      console.log(`Setting title for category ID: ${categoryId}`);
      try {
        const category = this.data.leftCategories.find(cat => cat._id === categoryId);
        if (category && category.name) {
          wx.setNavigationBarTitle({ title: category.name });
        } else {
          console.log(`Category name for ${categoryId} not in leftCategories, fetching doc...`);
          const res = await wx.cloud.database().collection('categories').doc(categoryId).get();
          if (res.data && res.data.name) {
            wx.setNavigationBarTitle({ title: res.data.name });
          } else {
            wx.setNavigationBarTitle({ title: `分类商品` }); 
            console.warn(`Category document for ${categoryId} not found or has no name.`);
          }
        }
        if (callback) callback(); 
        resolve();
      } catch (error) {
        console.error("Failed to fetch/set category info for title:", categoryId, error);
        wx.setNavigationBarTitle({ title: `分类商品` }); 
        if (callback) callback(error); 
        resolve(); 
      }
    });
  },

  fetchLeftCategories: function (activeCategoryId = null) {
    console.log("Fetching left categories, active ID:", activeCategoryId);
    return new Promise(async (resolve, reject) => {
      if (app.globalData.allCategories && app.globalData.allCategories.length > 0) {
        console.log("Using prefetched categories from globalData.");
        const categories = app.globalData.allCategories;
        let activeIndex = 0;
        const categoryIdForActivation = activeCategoryId || this.data.currentCategoryId;

        if (categoryIdForActivation && categories.length > 0) {
          const foundIndex = categories.findIndex(cat => cat._id === categoryIdForActivation);
          if (foundIndex !== -1) { activeIndex = foundIndex; }
          else { 
            console.warn(`Active category ${categoryIdForActivation} not in prefetched. Defaulting index.`);
            activeIndex = 0; 
          }
        }
        
        this.setData({
          leftCategories: categories,
          currentLeftCategoryIndex: activeIndex,
          showLeftCategories: categories.length > 0,
          // 确保 currentCategoryId 与激活的 ID 一致
          currentCategoryId: categories.length > 0 ? (categories[activeIndex] ? categories[activeIndex]._id : categories[0]._id) : null
        }, () => { 
          resolve();
        });
        return;
      }

      console.log("Prefetched categories not found, fetching from cloud function.");
      try {
        const res = await wx.cloud.callFunction({ name: 'getCategories' });
        if (res.result && res.result.code === 0 && Array.isArray(res.result.data)) {
          const categories = res.result.data;
          app.globalData.allCategories = categories; 
          let activeIndex = 0;
          const categoryIdForActivation = activeCategoryId || this.data.currentCategoryId; 

          if (categoryIdForActivation && categories.length > 0) {
            const foundIndex = categories.findIndex(cat => cat._id === categoryIdForActivation);
            if (foundIndex !== -1) { activeIndex = foundIndex; }
            else { 
              console.warn(`Active category ${categoryIdForActivation} not in fetched. Defaulting index.`);
              activeIndex = 0; 
            }
          }
          
          this.setData({
            leftCategories: categories,
            currentLeftCategoryIndex: activeIndex,
            showLeftCategories: categories.length > 0,
            currentCategoryId: categories.length > 0 ? (categories[activeIndex] ? categories[activeIndex]._id : categories[0]._id) : null
          }, () => { 
            resolve();
          });
        } else {
          this.setData({ leftCategories: [], showLeftCategories: false, isPageError: true, errorMessage: "左侧分类加载失败" });
          const errMsg = (res.result && res.result.message) || "加载分类列表失败";
          console.error("fetchLeftCategories failed:", errMsg);
          reject(new Error(errMsg)); 
        }
      } catch (error) {
        console.error("Failed to call/process getCategories cloud function:", error);
        this.setData({ leftCategories: [], showLeftCategories: false, isPageError: true, errorMessage: "左侧分类加载失败" });
        reject(error);
      }
    });
  },

  fetchLeftCategoriesAndFirstCategoryProducts: async function () {
    this.setData({ isLoading: true, isPageError: false, errorMessage: '', showLeftCategories: true });
    try {
      await this.fetchLeftCategories(null); 
      if (this.data.leftCategories.length > 0 && this.data.currentCategoryId) {
        await this.fetchAndSetCategoryInfo(this.data.currentCategoryId, null);
        this.resetAndLoadProducts(); // This will handle isLoading and isProcessingGlobalFilter in its finally
      } else if (this.data.leftCategories.length === 0) {
        this.setData({ isEmpty: true, products: [], isLoading: false, isProcessingGlobalFilter: false });
        wx.setNavigationBarTitle({ title: "暂无分类" });
        this.showError("暂无分类数据");
      } else {
        this.setData({ isLoading: false, isPageError: true, errorMessage: "无法确定初始分类", isProcessingGlobalFilter: false });
      }
    } catch (error) {
      console.error("Failed to fetch left categories and first products:", error);
      this.setData({ isLoading: false, isPageError: true, errorMessage: "加载分类数据失败", isProcessingGlobalFilter: false });
      // No need to call showError if fetchLeftCategories already did, or if isPageError is already true
    }
  },

  resetAndLoadProducts: function () {
    console.log("Resetting and loading products for filter/category:", this.data.filterType, this.data.currentCategoryId);
    if (!this.data.currentCategoryId && !this.data.filterType) {
        console.warn("resetAndLoadProducts called without currentCategoryId or filterType. Aborting product load.");
        this.setData({isLoading: false, isEmpty: true, products: [], isPageError: true, errorMessage: "未指定分类", isProcessingGlobalFilter: false}); 
        return;
    }
    this.setData({
      products: [],
      page: 1,
      isEnd: false,
      isEmpty: false,
      isPageError: false, 
      errorMessage: ''
      // isLoading will be set to true at the start of fetchProductsFromCloud
    });
    this.fetchProductsFromCloud(false); 
  },

  fetchProductsFromCloud: function (isLoadMore = false) {
    if (this.data.isLoading && isLoadMore) { 
      console.log("Already loading more products, request skipped.");
      return;
    }
    if (isLoadMore && this.data.isEnd) { 
      console.log("Already at end, not fetching more.");
      return;
    }

    if (!this.data.filterType && !this.data.currentCategoryId) {
      console.error("fetchProductsFromCloud: Aborting because filterType and currentCategoryId are both null/undefined.");
      this.setData({ isEmpty: true, products: [], isLoading: false, isEnd: true, isPageError:true, errorMessage: "未指定分类", isProcessingGlobalFilter: false });
      return;
    }

    if (!this.data.isLoading) { 
        this.setData({ isLoading: true }); // Ensure isLoading is true before API call
    }
    if (!isLoadMore) { 
      this.setData({ page: 1, products: [], isEnd: false, isEmpty: false, isPageError: false });
    }

    const params = {
      action: 'list',
      page: this.data.page,
      pageSize: this.data.pageSize,
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
            if (p.imageUrl && !p.mainImage) { p.mainImage = p.imageUrl; }
          });
          this.setData({
            products: isLoadMore ? this.data.products.concat(newProducts) : newProducts,
            isEnd: newProducts.length < this.data.pageSize, 
            page: this.data.page + 1, 
            isEmpty: !isLoadMore && newProducts.length === 0, 
            isPageError: false 
          });
        } else {
          const errMsg = (res.result && res.result.message) ? res.result.message : '加载商品失败';
          console.error('[CategoryPage] Product fetch error or bad response:', errMsg, 'Full result:', JSON.stringify(res.result));
          if (!isLoadMore) this.setData({ isEmpty: true, products: [], isPageError: true, errorMessage: errMsg });
          this.setData({ isEnd: true }); 
        }
      })
      .catch(err => {
        console.error('[CategoryPage] Cloud function getProducts call failed:', err);
        const errMsg = '网络请求失败';
        if (!isLoadMore) this.setData({ isEmpty: true, products: [], isPageError: true, errorMessage: errMsg });
        this.setData({ isEnd: true }); 
      })
      .finally(() => {
        this.setData({ isLoading: false, isProcessingGlobalFilter: false }); 
        wx.stopPullDownRefresh(); 
      });
  },

  onPullDownRefresh: function () {
    console.log('Category page pull down refresh');
    this.setData({ lastInteractionTime: Date.now(), isLoading: true, isProcessingGlobalFilter: false }); 
    this.resetAndLoadProducts(); 
  },

  onReachBottom: function () {
    console.log('Category page reach bottom');
    this.setData({ lastInteractionTime: Date.now() });
    if (!this.data.isLoading && !this.data.isEnd) { 
        this.setData({ isLoading: true }); 
        this.fetchProductsFromCloud(true);
    }
  },

  onProductTap: function (e) {
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

  goHome: function () {
    wx.switchTab({
      url: '/pages/index/index',
    });
  },

  onLeftCategoryTap: async function (e) { 
    if (this.data.isProcessingGlobalFilter) {
        console.log("Currently processing global filter, left category tap ignored.");
        return;
    }
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
    
    this.setData({
      currentLeftCategoryIndex: index,
      currentCategoryId: category._id, 
      filterType: null, 
      showLeftCategories: true, 
      isLoading: true 
    });
    try {
        await this.fetchAndSetCategoryInfo(category._id, null); 
        this.resetAndLoadProducts();
    } catch (error) {
        console.error("Error processing left category tap:", error);
        this.setData({isLoading: false, isPageError: true, errorMessage: "切换分类失败"});
    }
  },

  retryLoadProducts: function () {
    console.log('Retrying to load products...');
    this.setData({
      isPageError: false, 
      errorMessage: '',
      isLoading: true, 
      isProcessingGlobalFilter: false, 
    });
    if (this.data.filterType || this.data.currentCategoryId) {
      this.resetAndLoadProducts();
    } else {
      this.fetchLeftCategoriesAndFirstCategoryProducts(); 
    }
  },

  showError: function (message) {
    wx.showToast({
      title: message || '发生错误',
      icon: 'none',
      duration: 2500
    });
  }
});
