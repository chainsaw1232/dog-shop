// pages/detail/index.js
const app = getApp();
const util = require('../../utils/util.js'); //

Page({
  data: {
    productId: null,
    product: { // 初始化product为一个包含基本结构的对象，避免早期访问undefined的属性
      _id: null, // 确保_id存在，即使是null
      images: [],
      name: '加载中...', // 初始显示加载中
      price: '0.00',
      originalPrice: '0.00',
      sales: 0,
      stock: 0,
      specs: [],
      description: '',
      mainImage: '' // 为mainImage提供一个初始值
    },
    isLoading: true,
    loadError: false,
    errorMessage: '',
    isFavorite: false,
    favoriteId: null,
    cartCount: 0,
    showSpecsPopup: false,
    selectedSpec: null,
    selectedSpecText: '',
    quantity: 1,
    currentStock: 0, // 整体库存或无规格时的库存
    currentStockInPopup: 0, // 弹窗中根据已选规格显示的库存
    popupActionType: 'addToCart', // 'addToCart' or 'buyNow'
    
    reviews: [],
    reviewStats: {
      total: 0,
      goodCount: 0,
      mediumCount: 0,
      badCount: 0,
      hasImageCount: 0,
      goodRate: 100,
      avgRating: 5
    },
    reviewPage: 1,
    reviewPageSize: 3, // 详情页默认少显示几条，可调整
    hasMoreReviews: true,
    isLoadingReviews: false,

    services: [ // 服务承诺数据可以放在这里或从配置获取
      { name: '7天无理由退货' },
      { name: '正品保障' },
      { name: '急速发货' }
    ],
  },

  onLoad: function(options) {
    let currentId = null;
    if (options.id) {
      currentId = options.id;
    } else if (options.productId) { // 兼容 productId
      currentId = options.productId;
    }
    
    console.log('[detail page] onLoad - options:', options, 'Parsed ID:', currentId);
    
    if (currentId) {
      this.setData({
        productId: String(currentId), // 确保是字符串
        isLoading: true, // 开始加载时设置
        loadError: false,
        errorMessage: ''
      });
      this.loadPageData(); // 调用封装的加载数据方法
    } else {
      console.error('[detail page] onLoad - Error: Missing productId.');
      this.setData({
        isLoading: false, // 加载结束（虽然是失败）
        loadError: true,
        errorMessage: '商品ID缺失，无法加载详情'
      });
      wx.showToast({ title: '商品ID缺失', icon: 'none' });
    }
  },

  onShow: function() {
    if (app.globalData.openid) {
      this.getCartCount();
      // 仅当product._id有效时才检查收藏状态
      if (this.data.product && this.data.product._id && this.data.product._id !== 'temp_id_placeholder' && !this.data.isLoading) {
        this.checkFavoriteStatus();
      }
    }
    if (typeof app.globalData.cartCount === 'number') {
        this.setData({ cartCount: app.globalData.cartCount });
    }
  },

  // 封装页面主要数据加载逻辑
  loadPageData: function() {
    this.setData({ isLoading: true, loadError: false, errorMessage: '' });
    
    // 使用 Promise.allSettled 来确保所有异步操作都完成后再统一处理
    // 或者链式调用
    this.fetchProductDetail()
      .then(productData => { // fetchProductDetail 成功获取商品数据
        if (productData) {
            let initialSelectedSpecText = '默认规格';
            let initialCurrentStock = productData.stock || 0;
            let initialSelectedSpec = null;

            if (productData.specs && productData.specs.length > 0) {
                initialSelectedSpecText = '请选择规格';
                 // 对于有规格的商品，不应默认选中任何规格或计算其库存，除非业务逻辑如此设计
                initialCurrentStock = 0; // 如果必须选规格，则商品整体库存无意义，或应展示一个范围
                if (productData.specs.length === 1 && !this.data.selectedSpec) { // 如果只有一个规格，可以考虑默认选中
                    // initialSelectedSpec = productData.specs[0];
                    // initialSelectedSpec.selected = true; // 标记选中
                    // initialSelectedSpecText = initialSelectedSpec.name;
                    // initialCurrentStock = initialSelectedSpec.stock || 0;
                }
            }

            this.setData({
                product: productData,
                selectedSpec: initialSelectedSpec, // 更新 selectedSpec
                selectedSpecText: initialSelectedSpecText,
                currentStock: initialSelectedSpec ? initialSelectedSpec.stock : (productData.specs && productData.specs.length > 0 ? 0 : productData.stock || 0),
                currentStockInPopup: initialSelectedSpec ? initialSelectedSpec.stock : (productData.specs && productData.specs.length > 0 ? 0 : productData.stock || 0),
                quantity: 1, // 重置数量
                isLoading: false, // 商品详情加载完成
                loadError: false
            });
            wx.setNavigationBarTitle({ title: productData.name || '商品详情' });

            if (app.globalData.openid) {
                this.checkFavoriteStatus();
            }
            // 在商品详情成功加载后再获取评价
            this.fetchProductReviewStats();
            this.fetchProductReviews(false); // false表示首次加载评价
        } else {
            // 如果 productData 为空或不符合预期 (虽然Promise应该reject这种情况)
             this.setData({isLoading: false, loadError: true, errorMessage: '未获取到商品数据'});
        }
      })
      .catch(error => {
        console.error('[detail page] loadPageData - Error in promise chain:', error);
        this.setData({
          isLoading: false,
          loadError: true,
          errorMessage: error.message || '加载页面数据失败'
        });
      });
  },

  fetchProductDetail: function() {
    return new Promise((resolve, reject) => {
      if (!this.data.productId) {
        const errMsg = '商品ID缺失，无法获取详情';
        // this.setData({ isLoading: false, loadError: true, errorMessage: errMsg }); // setData 放到调用者那里处理
        reject(new Error(errMsg));
        return;
      }
      
      console.log(`[detail page] Calling getProducts cloud function: action=detail, id=${this.data.productId}`);
      wx.cloud.callFunction({
        name: 'getProducts',
        data: {
          action: 'detail',
          id: this.data.productId
        }
      }).then(res => {
        console.log('[detail page] getProducts cloud function response:', res);
        if (res.result && res.result.code === 0 && res.result.data) {
          let productData = res.result.data;
          if (productData.description) {
            productData.description = productData.description.replace(/<img/g, '<img style="max-width:100%;height:auto;display:block;"');
          }
          if (productData.specs && productData.specs.length > 0) {
            productData.specs.forEach(spec => spec.selected = false);
          }
          resolve(productData);
        } else {
          const errMsg = (res.result && res.result.message) ? res.result.message : '获取商品详情失败';
          // this.setData({ isLoading: false, loadError: true, errorMessage: errMsg });
          reject(new Error(errMsg));
        }
      }).catch(err => {
        console.error('[detail page] getProducts cloud function call FAILED:', err);
        const errMsg = '网络请求失败或云函数异常';
        // this.setData({ isLoading: false, loadError: true, errorMessage: errMsg });
        reject(new Error(errMsg));
      });
    });
  },

  fetchProductReviewStats: function() {
    if (!this.data.productId) return;
    wx.cloud.callFunction({
      name: 'review',
      data: { action: 'getStatsByProduct', productId: this.data.productId }
    }).then(res => {
      if (res.result && res.result.code === 0 && res.result.data) {
        this.setData({ reviewStats: res.result.data });
      } else { console.warn("获取评价统计失败:", res.result); }
    }).catch(err => { console.error("调用评价统计云函数失败:", err); });
  },

  fetchProductReviews: function(isLoadMore = false) {
    if (!this.data.productId || this.data.isLoadingReviews) return;
    if (isLoadMore && !this.data.hasMoreReviews) return;

    this.setData({ isLoadingReviews: true });
    if (!isLoadMore) { this.setData({ reviewPage: 1, reviews: [], hasMoreReviews: true }); }

    wx.cloud.callFunction({
      name: 'review',
      data: {
        action: 'listByProduct',
        productId: this.data.productId,
        page: this.data.reviewPage,
        pageSize: this.data.reviewPageSize,
        type: this.data.currentReviewFilterType || 'all' //  假设有 currentReviewFilterType 用于筛选
      }
    }).then(res => {
      if (res.result && res.result.code === 0 && res.result.data) {
        const newReviews = res.result.data.list || [];
        this.setData({
          reviews: isLoadMore ? this.data.reviews.concat(newReviews) : newReviews,
          reviewPage: this.data.reviewPage + 1,
          hasMoreReviews: newReviews.length === this.data.reviewPageSize
        });
      } else {
        if (!isLoadMore) this.setData({ reviews: [] });
        this.setData({ hasMoreReviews: false });
        console.warn("加载评价列表失败:", res.result);
      }
    }).catch(err => {
      console.error("调用评价列表云函数失败:", err);
      if (!isLoadMore) this.setData({ reviews: [] });
      this.setData({ hasMoreReviews: false });
    }).finally(() => {
      this.setData({ isLoadingReviews: false });
    });
  },
  
  filterReviews: function(e){
    const type = e.currentTarget.dataset.type;
    this.setData({
      currentReviewFilterType: type, // 用于存储当前筛选类型
      reviewPage: 1,
      reviews: [],
      hasMoreReviews: true,
      isLoadingReviews: false // 重置加载状态以允许新的加载
    });
    this.fetchProductReviews(false); // 重新加载评价
  },

  checkFavoriteStatus: function() {
    if (!app.globalData.openid || !this.data.product || !this.data.product._id) return;
    wx.cloud.callFunction({
      name: 'favorite',
      data: { action: 'check', productId: this.data.product._id }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        this.setData({
          isFavorite: res.result.data.isFavorite,
          favoriteId: res.result.data.favoriteId || null
        });
      } else { console.warn('检查收藏状态失败:', res.result); }
    }).catch(err => { console.error('调用检查收藏状态云函数失败:', err); });
  },

  toggleFavorite: function() {
    if (!app.globalData.openid) { this.showLoginModal(); return; }
    if (!this.data.product || !this.data.product._id) { util.showError("商品信息错误"); return; }

    const currentIsFavorite = this.data.isFavorite;
    const actionType = currentIsFavorite ? 'remove' : 'add';
    const params = { action: actionType, productId: this.data.product._id };
    if (actionType === 'remove' && this.data.favoriteId) {
        params.favoriteId = this.data.favoriteId;
        delete params.productId;
    }

    wx.showLoading({ title: currentIsFavorite ? '取消中...' : '收藏中...' });
    wx.cloud.callFunction({ name: 'favorite', data: params })
    .then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 0) {
        const newIsFavorite = actionType === 'add';
        this.setData({
          isFavorite: newIsFavorite,
          favoriteId: newIsFavorite ? (res.result.data.favoriteId || this.data.favoriteId) : null
        });
        wx.showToast({ title: newIsFavorite ? '收藏成功' : '已取消收藏', icon: 'success' });
      } else { util.showError((res.result && res.result.message) || (currentIsFavorite ? '取消失败' : '收藏失败')); }
    }).catch(err => {
      wx.hideLoading();
      util.showError('操作失败，请重试');
      console.error('调用收藏/取消收藏云函数失败:', err);
    });
  },

  getCartCount: function() {
    if (!app.globalData.openid) return;
    app.getCartCount(); // 调用 app.js 中的方法更新全局数量和角标
    this.setData({ cartCount: app.globalData.cartCount }); // 同步到页面
  },

  showSpecsPopup: function(e) {
    if (!this.data.product || !this.data.product._id) { util.showError("商品信息加载中"); return; }
    const actionTypeFromButton = e.currentTarget.dataset.action;
    if (!actionTypeFromButton || (actionTypeFromButton !== 'addToCart' && actionTypeFromButton !== 'buyNow' && actionTypeFromButton !== 'noneAction')) {
        util.showError("操作类型错误"); return;
    }
     // 如果是noneAction（点击规格栏打开），则不改变popupActionType
    if (actionTypeFromButton !== 'noneAction') {
        this.setData({ popupActionType: actionTypeFromButton });
    }


    if (!this.data.product.specs || this.data.product.specs.length === 0) {
      if (actionTypeFromButton === 'noneAction') { // 如果是点击规格栏但无规格，则不执行后续操作
        wx.showToast({title: '该商品暂无多规格可选', icon: 'none'});
        return;
      }
      this.setData({
        currentStockInPopup: this.data.product.stock || 0, // 无规格，使用商品总库存
        quantity: 1,
        selectedSpec: null, // 明确无选中规格
        selectedSpecText: '默认规格'
      }, () => { this.confirmAction(); });
      return;
    }
    
    // 有规格的情况
    const updatedSpecs = this.data.product.specs.map(s => ({
        ...s,
        selected: this.data.selectedSpec ? (s._id || s.id) === (this.data.selectedSpec._id || this.data.selectedSpec.id) : false
    }));

    this.setData({
      showSpecsPopup: true,
      'product.specs': updatedSpecs,
      // selectedSpec 保持不变，除非需要重置
      // selectedSpecText: this.data.selectedSpec ? this.data.selectedSpec.name : '请选择规格',
      currentStockInPopup: this.data.selectedSpec ? (this.data.selectedSpec.stock || 0) : 0, // 如果未选，则弹窗内库存为0，强制选择
      quantity: 1 // 每次打开弹窗重置数量为1
    });
  },
  hideSpecsPopup: function() { this.setData({ showSpecsPopup: false }); },

  selectSpec: function(e) {
    const specToSelect = e.currentTarget.dataset.spec;
    if (!specToSelect) { return; }

    const updatedSpecs = this.data.product.specs.map(s => ({
        ...s, selected: (s._id || s.id) === (specToSelect._id || specToSelect.id)
    }));

    if (specToSelect.stock <= 0) {
      wx.showToast({ title: '该规格已售罄', icon: 'none' });
      // 即使售罄，也更新选中状态以在UI上反馈，但购买数量和确认按钮应受影响
      this.setData({
        'product.specs': updatedSpecs,
        selectedSpec: specToSelect,
        selectedSpecText: specToSelect.name || '',
        quantity: 1, // 如果之前数量大于1，应重置
        currentStockInPopup: 0 // 明确库存为0
      });
      return;
    }

    this.setData({
      'product.specs': updatedSpecs,
      selectedSpec: specToSelect,
      selectedSpecText: specToSelect.name || '',
      quantity: 1,
      currentStockInPopup: specToSelect.stock || 0
    });
  },

  decreaseQuantity: function() {
    if (this.data.quantity > 1) {
      this.setData({ quantity: this.data.quantity - 1 });
    }
  },

  increaseQuantity: function() {
    // 使用弹窗内的库存 currentStockInPopup，因为它反映了选中规格的库存
    const stockLimit = this.data.currentStockInPopup; 
    if (!this.data.selectedSpec && this.data.product.specs && this.data.product.specs.length > 0) {
      util.showError("请先选择规格"); return;
    }
    if (this.data.selectedSpec && this.data.selectedSpec.stock <= 0) {
      wx.showToast({ title: '该规格已售罄', icon: 'none' }); return;
    }
    if (this.data.quantity < stockLimit) {
      this.setData({ quantity: this.data.quantity + 1 });
    } else {
      wx.showToast({ title: '已达到库存上限', icon: 'none' });
    }
  },

  onQuantityInput: function(e) {
    let value = parseInt(e.detail.value);
    const stockLimit = this.data.currentStockInPopup;

    if (!this.data.selectedSpec && this.data.product.specs && this.data.product.specs.length > 0) {
      util.showError("请先选择规格"); this.setData({ quantity: 1 }); return;
    }
    if (this.data.selectedSpec && this.data.selectedSpec.stock <= 0) {
      wx.showToast({ title: '该规格已售罄', icon: 'none' }); this.setData({ quantity: 1 }); return;
    }
    if (isNaN(value) || value < 1) { value = 1; }
    if (value > stockLimit) { value = stockLimit; wx.showToast({ title: '已达到库存上限', icon: 'none' }); }
    this.setData({ quantity: value });
  },
  
  onQuantityBlur: function(e) { // 失去焦点时，如果输入为空或0，则设为1
    let value = parseInt(e.detail.value);
    if (isNaN(value) || value < 1) {
        this.setData({ quantity: 1 });
    }
  },

  confirmAction: function() {
    if (!app.globalData.openid) { this.showLoginModal(); return; }
    if (!this.data.product || !this.data.product._id) { util.showError("商品信息错误"); return; }

    const hasSpecs = this.data.product.specs && this.data.product.specs.length > 0;
    if (hasSpecs && !this.data.selectedSpec) { util.showError("请选择商品规格"); return; }
    
    // 再次确认库存
    const stockForAction = this.data.selectedSpec ? (this.data.selectedSpec.stock || 0) : (this.data.product.stock || 0);
    if (stockForAction <= 0) { util.showError(hasSpecs ? "此规格已售罄" : "此商品已售罄"); return; }
    if (this.data.quantity <= 0) { util.showError("购买数量必须大于0"); return; }
    if (this.data.quantity > stockForAction) {
      util.showError("所选数量超过库存");
      this.setData({ quantity: stockForAction > 0 ? stockForAction : 1 });
      return;
    }

    const actionType = this.data.popupActionType;
    if (actionType === 'addToCart') {
      const params = {
        action: 'add',
        productId: this.data.product._id,
        quantity: this.data.quantity,
        specId: this.data.selectedSpec ? (this.data.selectedSpec._id || this.data.selectedSpec.id || '') : ''
      };
      wx.showLoading({ title: '加入中...' });
      wx.cloud.callFunction({ name: 'cart', data: params })
      .then(res => {
        wx.hideLoading();
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: res.result.message || '已加入购物车', icon: 'success' });
          this.getCartCount();
          this.hideSpecsPopup();
        } else { util.showError((res.result && res.result.message) ? res.result.message : '添加失败'); }
      }).catch(err => { wx.hideLoading(); util.showError('网络请求失败'); console.error('加入购物车失败:', err); });
    } else if (actionType === 'buyNow') {
      const itemToBuy = {
        _id: this.data.product._id,
        productId: this.data.product._id,
        productName: this.data.product.name,
        productImage: this.data.selectedSpec && this.data.selectedSpec.image ? this.data.selectedSpec.image 
                      : (this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : '')),
        price: this.data.selectedSpec ? this.data.selectedSpec.price : this.data.product.price,
        quantity: this.data.quantity,
        specId: this.data.selectedSpec ? (this.data.selectedSpec._id || this.data.selectedSpec.id || '') : '',
        specName: this.data.selectedSpec ? this.data.selectedSpec.name : '',
        selected: true
      };
      wx.setStorageSync('buyNowItem', itemToBuy);
      this.hideSpecsPopup();
      wx.navigateTo({ url: '/pages/orderConfirm/index?type=buyNow' });
    } else { util.showError("未知操作类型"); }
  },

  navigateToHome: function() { wx.switchTab({ url: '/pages/index/index'}); },
  navigateToCart: function() { wx.switchTab({ url: '/pages/cart/index'}); },
  navigateToReviews: function() {
    if (this.data.product && this.data.product._id) {
      //  wx.navigateTo({ url: `/pages/reviewList/index?productId=${this.data.product._id}`});
       wx.showToast({ title: '完整评价列表暂未开放', icon: 'none' });
    } else { util.showError("商品信息错误"); }
  },
  
  previewImage: function(e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.product.images || [];
    if (urls.length > 0 && current) {
        wx.previewImage({ current: current, urls: urls.map(img => typeof img === 'string' ? img : img.url) });
    } else {
        console.warn("PreviewImage: current image or urls array is empty/invalid");
    }
  },

  previewReviewImage: function(e) {
    const currentImageUrl = e.currentTarget.dataset.currentimage;
    const allImages = e.currentTarget.dataset.allimages; // 这是当前评价的所有图片
    if (currentImageUrl && Array.isArray(allImages) && allImages.length > 0) {
      wx.previewImage({
        current: currentImageUrl,
        urls: allImages
      });
    }
  },

  showLoginModal: function() {
    wx.showModal({
      title: '登录提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      showCancel: false,
      success: res => {
        if (res.confirm) { wx.switchTab({ url: '/pages/user/index' }); }
      }
    });
  },
  doNothing: function() {}, 
  
  onShareAppMessage: function () {
    return {
      title: this.data.product.name ? `${this.data.product.name} - 火山零食小卖部好物推荐` : '火山零食小卖部好物推荐',
      path: `/pages/detail/index?id=${this.data.productId}`,
      imageUrl: this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : '')
    }
  },
  onShareTimeline: function() { // 确保开启了分享到朋友圈
    return {
      title: this.data.product.name ? `${this.data.product.name} - 火山零食小卖部好物推荐` : '火山零食小卖部好物推荐',
      query: `id=${this.data.productId}`,
      imageUrl: this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : '')
    }
  }
});