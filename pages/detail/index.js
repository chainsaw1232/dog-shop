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
    },
    isLoading: true,
    loadError: false,
    errorMessage: '',
    isFavorite: false,
    cartCount: 0,
    showSpecsPopup: false,
    selectedSpec: null, // 当前选中的规格对象
    selectedSpecText: '', // 显示的已选规格文本
    quantity: 1, // 购买数量
    currentStock: 0, // 页面上根据是否选择规格显示的总库存或规格库存
    currentStockInPopup: 0, // 弹窗中根据当前选中规格显示的库存
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
        productId: String(currentId), 
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
      this.getCartCount(); 
      if (this.data.product && this.data.product._id && this.data.product._id !== 'temp_id_placeholder') {
        this.checkFavoriteStatus();
      }
    }
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
            const firstAvailableSpec = productData.specs.find(s => (s.stock || 0) > 0);
            if (firstAvailableSpec) {
                // No default selection
            } else {
                initialCurrentStock = 0; 
            }
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
          this.fetchProductReviews();
        } else {
          this.setData({isLoading: false});
        }
      })
      .catch((error) => {
        console.error('[detail page] loadPageData - Error fetching product detail:', error);
        this.setData({ isLoading: false });
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
            productData.description = productData.description.replace(/<img/g, '<img style="max-width:100%;height:auto;display:block;"');
          }
          if (productData.specs && productData.specs.length > 0) {
            productData.specs.forEach(spec => spec.selected = false);
          }
          resolve(productData);
        } else {
          const errMsg = (res.result && res.result.message) || '获取商品详情失败';
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
    // ... (保持原有逻辑)
  },

  checkFavoriteStatus: function() {
    // ... (保持原有逻辑)
  },

  toggleFavorite: function() {
    // ... (保持原有逻辑)
  },

  getCartCount: function() {
    // ... (保持原有逻辑)
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
    
    let stockInPopup = 0;
    if (this.data.selectedSpec) {
        stockInPopup = this.data.selectedSpec.stock || 0;
    } else {
        const firstAvailableSpec = this.data.product.specs.find(s => (s.stock || 0) > 0);
        if (firstAvailableSpec && !this.data.selectedSpec) { 
             // No default selection
        }
    }

    this.setData({
      showSpecsPopup: true,
      currentStockInPopup: this.data.selectedSpec ? (this.data.selectedSpec.stock || 0) : 0, 
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
        selectedSpec: specToSelect,
        selectedSpecText: specToSelect.name || '',
        quantity: 1, 
        currentStockInPopup: specToSelect.stock || 0 
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
      this.setData({
        quantity: this.data.quantity - 1
      });
    }
  },

  increaseQuantity: function() {
    const stockLimit = this.data.showSpecsPopup ? this.data.currentStockInPopup : this.data.currentStock;
    
    if (!this.data.showSpecsPopup && (!this.data.product.specs || this.data.product.specs.length === 0)) {
        // No spec product
    } else if (this.data.showSpecsPopup && !this.data.selectedSpec) {
        util.showError("请先选择规格");
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
      if (this.data.showSpecsPopup) return; 
    }

    const stock = hasSpecs ? (this.data.selectedSpec ? this.data.selectedSpec.stock || 0 : 0) 
                           : (this.data.product.stock || 0);
    
    if (hasSpecs && !this.data.selectedSpec) {
        // Already handled
    } else if (stock <= 0) { 
         util.showError(hasSpecs && this.data.selectedSpec ? "此规格已售罄" : "此商品已售罄"); return;
    }

    if (this.data.quantity <= 0) {
      util.showError("购买数量必须大于0"); return;
    }
    
    const currentEffectiveStock = this.data.selectedSpec ? this.data.selectedSpec.stock : this.data.product.stock;
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
          this.getCartCount();
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
        _id: this.data.product._id, 
        productId: this.data.product._id, 
        productName: this.data.product.name,
        productImage: this.data.selectedSpec && this.data.selectedSpec.image ? this.data.selectedSpec.image 
                      : (this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/placeholder.png')),
        price: this.data.selectedSpec ? this.data.selectedSpec.price : this.data.product.price,
        quantity: this.data.quantity,
        specId: this.data.selectedSpec ? (this.data.selectedSpec._id || this.data.selectedSpec.id || '') : '',
        specName: this.data.selectedSpec ? this.data.selectedSpec.name : '',
        selected: true 
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
        //   wx.navigateTo({ url: `/pages/reviewList/index?productId=${this.data.product._id}`}); 
      } else {
          util.showError("商品信息错误");
      }
  },
  previewImage: function(e) { 
    const current = e.currentTarget.dataset.src;
    const urls = this.data.product.images || [];
    if (urls.length > 0) {
        wx.previewImage({ current: current, urls: urls });
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
  doNothing: function() {}, 
  onShareAppMessage: function () { 
    return {
      title: this.data.product.name ? `${this.data.product.name} - 火山零食小卖部好物推荐` : '火山零食小卖部好物推荐', // <--- 修改点
      path: `/pages/detail/index?id=${this.data.productId}`,
      imageUrl: this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : '')
    }
  },
  onShareTimeline: function() { 
    return {
      title: this.data.product.name ? `${this.data.product.name} - 火山零食小卖部好物推荐` : '火山零食小卖部好物推荐', // <--- 修改点
      query: `id=${this.data.productId}`,
      imageUrl: this.data.product.mainImage || (this.data.product.images && this.data.product.images.length > 0 ? this.data.product.images[0] : '')
    }
  }
});
