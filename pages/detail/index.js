// pages/detail/index.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    productId: null,
    product: {
      images: [],
      name: '加载中...',
      price: '0.00',
      originalPrice: '0.00',
      sales: 0,
      stock: 0,
      specs: [],
      description: ''
      // _id is important for cloud function calls
    },
    isLoading: true,
    loadError: false,
    errorMessage: '',
    isFavorite: false,
    favoriteId: null, // Store the _id of the favorite record
    cartCount: 0,
    showSpecsPopup: false,
    selectedSpec: null,
    selectedSpecText: '',
    quantity: 1,
    currentStock: 0,
    currentStockInPopup: 0,
    popupActionType: 'addToCart',
    reviews: [],
    reviewTotal: 0,
    services: [
      { name: '7天无理由退货' },
      { name: '正品保障' },
      { name: '急速发货' }
    ],
  },

  onLoad: function(options) {
    let currentId = null;
    if (options.id) {
      currentId = options.id;
    } else if (options.productId) {
      currentId = options.productId;
    }
    console.log('[detail page] onLoad - options:', options, 'Parsed ID:', currentId);
    if (currentId) {
      this.setData({
        productId: String(currentId), // Ensure it's a string if used as doc ID
      });
      this.loadPageData();
    } else {
      console.error('[detail page] onLoad - Error: Missing productId.');
      this.setData({
        isLoading: false,
        loadError: true,
        errorMessage: '商品ID缺失，无法加载详情'
      });
      wx.showToast({ title: '商品ID缺失', icon: 'none' });
    }
  },

  onShow: function() {
    if (app.globalData.openid) {
      this.getCartCount(); // Use the cloud function version
      // Check favorite status only if product data (especially _id) is loaded
      if (this.data.product && this.data.product._id && this.data.product._id !== 'temp_id_placeholder') {
        this.checkFavoriteStatus();
      }
    }
    // Sync cart count from globalData if app.js updates it
    if (typeof app.globalData.cartCount === 'number') {
        this.setData({ cartCount: app.globalData.cartCount });
    }
  },

  loadPageData: function() {
    this.setData({ isLoading: true, loadError: false, errorMessage: '' });
    this.fetchProductDetail()
      .then((productData) => {
        if (productData) {
          let initialSelectedSpecText = '默认规格';
          let initialCurrentStock = productData.stock || 0;
          let initialSelectedSpec = null;

          if (productData.specs && productData.specs.length > 0) {
            initialSelectedSpecText = '请选择规格';
             // No default selection, user must choose
          }

          this.setData({
            product: productData,
            selectedSpec: initialSelectedSpec,
            selectedSpecText: initialSelectedSpecText,
            currentStock: initialCurrentStock,
            currentStockInPopup: initialSelectedSpec ? initialSelectedSpec.stock : (productData.specs && productData.specs.length > 0 ? 0 : initialCurrentStock),
            isLoading: false,
            quantity: 1
          });
          wx.setNavigationBarTitle({ title: productData.name || '商品详情' });

          if (app.globalData.openid) {
            this.checkFavoriteStatus();
          }
          // this.fetchProductReviews(); // Assuming this will also be converted or handled elsewhere
        } else {
          this.setData({isLoading: false}); // Ensure loading is false if no product data
        }
      })
      .catch((error) => {
        console.error('[detail page] loadPageData - Error fetching product detail:', error);
        this.setData({ isLoading: false, loadError: true, errorMessage: error.message || '加载商品数据失败' });
      });
  },

  fetchProductDetail: function() {
    return new Promise((resolve, reject) => {
      if (!this.data.productId) {
        const errMsg = '商品ID缺失，无法获取详情';
        this.setData({ product: null, errorMessage: errMsg, loadError: true, isLoading: false });
        reject(new Error(errMsg));
        return;
      }
      console.log(`[云函数 getProducts] 调用: action=detail, id=${this.data.productId}`);
      wx.cloud.callFunction({
        name: 'getProducts',
        data: {
          action: 'detail',
          id: this.data.productId
        }
      }).then(res => {
        console.log('[云函数 getProducts] [detail] 返回:', res);
        if (res.result && res.result.code === 0 && res.result.data) {
          let productData = res.result.data;
          if (productData.description) {
            // Simple replace for img tags, consider a more robust HTML parser if complex HTML is involved
            productData.description = productData.description.replace(/<img/g, '<img style="max-width:100%;height:auto;display:block;"');
          }
          if (productData.specs && productData.specs.length > 0) {
            productData.specs.forEach(spec => spec.selected = false); // Initialize selection state
          }
          resolve(productData);
        } else {
          const errMsg = (res.result && res.result.message) ? res.result.message : '获取商品详情失败';
          this.setData({ product: null, errorMessage: errMsg, loadError: true, isLoading: false });
          reject(new Error(errMsg));
        }
      }).catch(err => {
        console.error('[云函数 getProducts] [detail] 调用失败:', err);
        const errMsg = '网络请求失败或云函数调用异常';
        this.setData({ product: null, errorMessage: errMsg, loadError: true, isLoading: false });
        reject(err);
      });
    });
  },

  fetchProductReviews: function() {
    // TODO: Convert this to use wx.cloud.callFunction if reviews are fetched from cloud
    // For now, this is a placeholder
    console.warn("fetchProductReviews is not implemented with cloud functions yet.");
    // Example:
    // wx.cloud.callFunction({ name: 'review', data: { action: 'listByProduct', productId: this.data.productId, page: 1, pageSize: 3 }})
    // .then(res => { ... })
  },

  checkFavoriteStatus: function() {
    if (!app.globalData.openid || !this.data.product || !this.data.product._id) {
      return;
    }
    wx.cloud.callFunction({
      name: 'favorite', // Your favorite cloud function name
      data: {
        action: 'check',
        productId: this.data.product._id
        // openid is automatically included in cloud function context
      }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        this.setData({
          isFavorite: res.result.data.isFavorite,
          favoriteId: res.result.data.favoriteId || null
        });
      } else {
        console.warn('检查收藏状态失败:', (res.result && res.result.message) || '未知错误');
      }
    }).catch(err => {
      console.error('调用检查收藏状态云函数失败:', err);
    });
  },

  toggleFavorite: function() {
    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }
    if (!this.data.product || !this.data.product._id) {
      util.showError("商品信息错误");
      return;
    }

    const currentIsFavorite = this.data.isFavorite;
    const actionType = currentIsFavorite ? 'remove' : 'add';
    const params = {
      action: actionType,
      productId: this.data.product._id,
    };
    // If removing by favoriteId is preferred and available
    if (actionType === 'remove' && this.data.favoriteId) {
        params.favoriteId = this.data.favoriteId;
        delete params.productId; // Remove by favoriteId if present
    }


    wx.showLoading({ title: currentIsFavorite ? '取消中...' : '收藏中...' });

    wx.cloud.callFunction({
      name: 'favorite',
      data: params
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 0) {
        const newIsFavorite = actionType === 'add' ? true : false;
        this.setData({
          isFavorite: newIsFavorite,
          favoriteId: newIsFavorite ? (res.result.data.favoriteId || this.data.favoriteId) : null
        });
        wx.showToast({ title: newIsFavorite ? '收藏成功' : '已取消收藏', icon: 'success' });
      } else {
        util.showError((res.result && res.result.message) || (currentIsFavorite ? '取消失败' : '收藏失败'));
      }
    }).catch(err => {
      wx.hideLoading();
      util.showError('操作失败，请重试');
      console.error('调用收藏/取消收藏云函数失败:', err);
    });
  },

  getCartCount: function() {
    if (!app.globalData.openid) return;
    // This function can now rely on app.js to update globalData.cartCount
    // and then sync it in onShow or via a listener if needed.
    // For an immediate update here, call the app.js version.
    app.getCartCount(); // This will update app.globalData.cartCount and the badge
    // Then update page data from globalData
    this.setData({ cartCount: app.globalData.cartCount });
  },

  showSpecsPopup: function(e) {
    if (!this.data.product || !this.data.product._id) {
      util.showError("商品信息加载中，请稍候");
      return;
    }
    const actionTypeFromButton = e.currentTarget.dataset.action;

    if (!actionTypeFromButton || (actionTypeFromButton !== 'addToCart' && actionTypeFromButton !== 'buyNow')) {
      console.error("showSpecsPopup: 无效的 action 类型来自按钮:", actionTypeFromButton);
      util.showError("操作类型错误");
      return;
    }
    this.setData({ popupActionType: actionTypeFromButton });

    if (!this.data.product.specs || this.data.product.specs.length === 0) {
      console.log("商品无规格，将直接执行操作:", this.data.popupActionType);
      this.setData({
        currentStockInPopup: this.data.product.stock || 0,
        quantity: 1
      }, () => {
        this.confirmAction();
      });
      return;
    }

    // Reset selected spec in popup if not already selected or if it's out of stock
    let currentPopupSpec = this.data.selectedSpec;
    if (currentPopupSpec && currentPopupSpec.stock <= 0) {
        currentPopupSpec = null; // Force re-selection if current is out of stock
    }
    
    const updatedSpecs = this.data.product.specs.map(s => ({
        ...s,
        selected: currentPopupSpec ? (s._id || s.id) === (currentPopupSpec._id || currentPopupSpec.id) : false
    }));


    this.setData({
      showSpecsPopup: true,
      'product.specs': updatedSpecs, // Ensure spec selection state is fresh in popup
      selectedSpec: currentPopupSpec, // Keep current selection if valid
      selectedSpecText: currentPopupSpec ? currentPopupSpec.name : '请选择规格',
      currentStockInPopup: currentPopupSpec ? (currentPopupSpec.stock || 0) : 0,
      quantity: 1
    });
  },
  hideSpecsPopup: function() { this.setData({ showSpecsPopup: false }); },

  selectSpec: function(e) {
    const specToSelect = e.currentTarget.dataset.spec;
    if (!specToSelect) {
      console.warn("selectSpec: spec data is undefined", e.currentTarget.dataset);
      return;
    }

    const updatedSpecs = this.data.product.specs.map(s => {
      return { ...s, selected: (s._id || s.id) === (specToSelect._id || specToSelect.id) };
    });

    if (specToSelect.stock <= 0) {
      wx.showToast({ title: '该规格已售罄', icon: 'none' });
      this.setData({
        'product.specs': updatedSpecs,
        selectedSpec: specToSelect, // Still select it to show it's chosen but out of stock
        selectedSpecText: specToSelect.name || '',
        quantity: 1, // Reset quantity
        currentStockInPopup: specToSelect.stock || 0
      });
      return;
    }

    this.setData({
      'product.specs': updatedSpecs,
      selectedSpec: specToSelect,
      selectedSpecText: specToSelect.name || '',
      quantity: 1, // Reset quantity on new spec selection
      currentStockInPopup: specToSelect.stock || 0
    });
  },

  decreaseQuantity: function() {
    if (this.data.quantity > 1) {
      this.setData({
        quantity: this.data.quantity - 1
      });
    }
  },

  increaseQuantity: function() {
    const stockLimit = this.data.showSpecsPopup ? this.data.currentStockInPopup : this.data.currentStock;

    if (!this.data.showSpecsPopup && (!this.data.product.specs || this.data.product.specs.length === 0)) {
      // No spec product, stockLimit is product.stock
    } else if (this.data.showSpecsPopup && !this.data.selectedSpec) {
      util.showError("请先选择规格");
      return;
    }
     if (this.data.selectedSpec && this.data.selectedSpec.stock <=0){
        wx.showToast({ title: '该规格已售罄', icon: 'none' });
        return;
    }


    if (this.data.quantity < stockLimit) {
      this.setData({
        quantity: this.data.quantity + 1
      });
    } else {
      wx.showToast({ title: '已达到库存上限', icon: 'none' });
    }
  },

  onQuantityInput: function(e) {
    let value = parseInt(e.detail.value);
    const stockLimit = this.data.showSpecsPopup ? this.data.currentStockInPopup : this.data.currentStock;

    if (!this.data.showSpecsPopup && (!this.data.product.specs || this.data.product.specs.length === 0)) {
      // No spec product
    } else if (this.data.showSpecsPopup && !this.data.selectedSpec && value > 0) {
      util.showError("请先选择规格");
      this.setData({ quantity: 1 }); // Reset to 1 if trying to input without spec
      return;
    }
     if (this.data.selectedSpec && this.data.selectedSpec.stock <=0 && value > 0){
        wx.showToast({ title: '该规格已售罄', icon: 'none' });
        this.setData({ quantity: 1 });
        return;
    }


    if (isNaN(value) || value < 1) {
      value = 1;
    }
    if (value > stockLimit) {
      value = stockLimit;
      wx.showToast({ title: '已达到库存上限', icon: 'none' });
    }
    this.setData({ quantity: value });
  },

  confirmAction: function() {
    if (!app.globalData.openid) { this.showLoginModal(); return; }
    if (!this.data.product || !this.data.product._id) { util.showError("商品信息错误"); return; }

    const hasSpecs = this.data.product.specs && this.data.product.specs.length > 0;

    if (hasSpecs && !this.data.selectedSpec) {
      util.showError("请选择商品规格");
      // if (this.data.showSpecsPopup) return; // No, this should not return if popup is open, error is valid
      return;
    }

    const stock = hasSpecs ? (this.data.selectedSpec ? this.data.selectedSpec.stock || 0 : 0)
                           : (this.data.product.stock || 0);

    if (stock <= 0 && !(hasSpecs && !this.data.selectedSpec) ) { // If spec not selected, error is "select spec"
         util.showError(hasSpecs && this.data.selectedSpec ? "此规格已售罄" : "此商品已售罄"); return;
    }


    if (this.data.quantity <= 0) {
      util.showError("购买数量必须大于0"); return;
    }

    const currentEffectiveStock = this.data.selectedSpec ? (this.data.selectedSpec.stock || 0) : (this.data.product.stock || 0);
    if (this.data.quantity > currentEffectiveStock) {
      util.showError("所选数量超过库存");
      this.setData({ quantity: currentEffectiveStock > 0 ? currentEffectiveStock : 1 });
      return;
    }

    const actionType = this.data.popupActionType;
    console.log("Confirming action:", actionType, "with quantity:", this.data.quantity, "selectedSpec:", this.data.selectedSpec);

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
          this.getCartCount(); // Update cart count
          this.hideSpecsPopup();
        } else {
          util.showError((res.result && res.result.message) ? res.result.message : '添加失败');
        }
      }).catch(err => {
        wx.hideLoading();
        util.showError('网络请求失败');
        console.error('[加入购物车]失败:', err);
      });
    } else if (actionType === 'buyNow') {
      const itemToBuy = {
        _id: this.data.product._id, // Use product's main _id
        productId: this.data.product._id,
        productName: this.data.product.name,
        productImage: this.data.selectedSpec && this.data.selectedSpec.image ? this.data.selectedSpec.image
                      : (this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/placeholder.png')), // Placeholder if no image
        price: this.data.selectedSpec ? this.data.selectedSpec.price : this.data.product.price,
        quantity: this.data.quantity,
        specId: this.data.selectedSpec ? (this.data.selectedSpec._id || this.data.selectedSpec.id || '') : '',
        specName: this.data.selectedSpec ? this.data.selectedSpec.name : '',
        selected: true // For orderConfirm page logic
      };
      wx.setStorageSync('buyNowItem', itemToBuy);
      this.hideSpecsPopup();
      wx.navigateTo({ url: '/pages/orderConfirm/index?type=buyNow' });
    } else {
        console.error("confirmAction: 未知的 popupActionType:", actionType);
        util.showError("未知操作类型");
    }
  },

  navigateToHome: function() { wx.switchTab({ url: '/pages/index/index'}); },
  navigateToCart: function() { wx.switchTab({ url: '/pages/cart/index'}); },
  navigateToReviews: function() {
      if (this.data.product && this.data.product._id) {
        //   wx.navigateTo({ url: `/pages/reviewList/index?productId=${this.data.product._id}`}); // Assuming a reviewList page
         wx.showToast({ title: '评价列表暂未开放', icon: 'none' });
      } else {
          util.showError("商品信息错误");
      }
  },
  previewImage: function(e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.product.images || [];
    if (urls.length > 0) {
        wx.previewImage({ current: current, urls: urls.map(img => typeof img === 'string' ? img : img.url) }); // Handle if images are objects
    }
  },
  showLoginModal: function() {
    wx.showModal({
      title: '登录提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      success: res => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/user/index' });
        }
      }
    });
  },
  doNothing: function() {}, // Placeholder for events that stop propagation
  onShareAppMessage: function () {
    return {
      title: this.data.product.name ? `${this.data.product.name} - 火山零食小卖部好物推荐` : '火山零食小卖部好物推荐',
      path: `/pages/detail/index?id=${this.data.productId}`,
      imageUrl: this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : '')
    }
  },
  onShareTimeline: function() {
    return {
      title: this.data.product.name ? `${this.data.product.name} - 火山零食小卖部好物推荐` : '火山零食小卖部好物推荐',
      query: `id=${this.data.productId}`,
      imageUrl: this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : '')
    }
  }
});
