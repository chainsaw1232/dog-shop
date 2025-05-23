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
    selectedSpec: null,
    selectedSpecText: '', 
    quantity: 1,
    currentStock: 0, 
    currentStockInPopup: 0, 
    popupActionType: 'addToCart', // 默认打开弹窗的意图是加入购物车
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
          if (productData.specs && productData.specs.length > 0) {
            initialSelectedSpecText = '请选择规格';
            // 如果有规格，尝试找到第一个有库存的规格作为默认选中，或者不选
            const firstAvailableSpec = productData.specs.find(s => (s.stock || 0) > 0);
            if (firstAvailableSpec) {
                // initialSelectedSpecText = firstAvailableSpec.name; // 可以考虑默认选中第一个可用的
                // this.setData({ selectedSpec: firstAvailableSpec }); // 并设置selectedSpec
                initialCurrentStock = firstAvailableSpec.stock;
            } else {
                initialCurrentStock = 0; // 所有规格都没库存
            }
          }

          this.setData({
            product: productData,
            selectedSpecText: initialSelectedSpecText,
            currentStock: initialCurrentStock, 
            currentStockInPopup: initialCurrentStock, 
            isLoading: false,
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
    if (!this.data.product || !this.data.product._id) return;
    // ... (保持原有逻辑)
  },

  checkFavoriteStatus: function() {
    if (!app.globalData.openid || !this.data.product || !this.data.product._id) return;
    wx.cloud.callFunction({
      name: 'favorite', 
      data: {
        action: 'check', 
        productId: this.data.product._id 
      }
    }).then(res => {
      if (res.result && res.result.code === 0 && typeof res.result.data.isFavorite === 'boolean') {
        this.setData({ isFavorite: res.result.data.isFavorite });
      } else {
        console.warn("检查收藏状态失败或返回格式不正确:", res);
      }
    }).catch(err => console.error("检查收藏状态调用失败:", err));
  },

  toggleFavorite: function() {
    if (!app.globalData.openid) { this.showLoginModal(); return; }
    if (!this.data.product || !this.data.product._id) { util.showError("商品信息错误"); return; }

    const isFavorite = this.data.isFavorite;
    const actionName = isFavorite ? 'remove' : 'add'; 
    const favoriteId = isFavorite && this.data.product.favoriteId ? this.data.product.favoriteId : null; // 假设favoriteId存在product对象中

    wx.showLoading({ title: isFavorite ? '取消中...' : '收藏中...' });
    wx.cloud.callFunction({
      name: 'favorite',
      data: {
        action: actionName,
        productId: this.data.product._id,
        favoriteId: actionName === 'remove' && favoriteId ? favoriteId : undefined // 仅在取消时且有favoriteId时传递
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 0) {
        this.setData({ isFavorite: !isFavorite });
        // 如果是添加收藏成功，后端应该返回新的favoriteId，可以考虑更新到 this.data.product.favoriteId
        if (actionName === 'add' && res.result.data && res.result.data.favoriteId) {
            // this.setData({'product.favoriteId': res.result.data.favoriteId});
        }
        wx.showToast({ title: res.result.message || (isFavorite ? '取消成功' : '收藏成功'), icon: 'success' });
      } else {
        util.showError((res.result && res.result.message) || '操作失败');
      }
    }).catch(err => {
      wx.hideLoading();
      util.showError('网络请求失败');
      console.error("Favorite action failed:", err);
    });
  },

  getCartCount: function() {
    if (app.globalData.openid) {
      app.getCartCount(); 
      this.setData({ cartCount: app.globalData.cartCount || 0 });
    } else {
      this.setData({ cartCount: 0 });
    }
  },

  showSpecsPopup: function(e) {
    if (!this.data.product || !this.data.product._id) {
      util.showError("商品信息加载中，请稍候");
      return;
    }
    const actionTypeFromButton = e.currentTarget.dataset.action; // 'addToCart' 或 'buyNow'
    
    // 必须从按钮获取意图，并设置到 popupActionType
    if (!actionTypeFromButton || (actionTypeFromButton !== 'addToCart' && actionTypeFromButton !== 'buyNow')) {
        console.error("showSpecsPopup: 无效的 action 类型来自按钮:", actionTypeFromButton);
        util.showError("操作类型错误");
        return;
    }
    this.setData({ popupActionType: actionTypeFromButton });

    if (!this.data.product.specs || this.data.product.specs.length === 0) {
      console.log("商品无规格，将直接执行操作:", this.data.popupActionType);
      this.confirmAction(); // 修改：调用统一的确认方法
      return;
    }

    let stockInPopup = 0;
    if (this.data.selectedSpec) {
      stockInPopup = this.data.selectedSpec.stock || 0;
    } else if (this.data.product.specs && this.data.product.specs.length > 0) {
      const firstAvailableSpec = this.data.product.specs.find(s => (s.stock || 0) > 0);
      if (firstAvailableSpec) {
        stockInPopup = firstAvailableSpec.stock;
      }
    }
    this.setData({
      showSpecsPopup: true,
      currentStockInPopup: stockInPopup,
      quantity: 1 
    });
  },
  hideSpecsPopup: function() { this.setData({ showSpecsPopup: false }); },

  selectSpec: function(e) {
    const spec = e.currentTarget.dataset.spec;
    if (!spec) {
        console.warn("selectSpec: spec data is undefined", e.currentTarget.dataset);
        return;
    }
    if (spec.stock <= 0) {
      wx.showToast({ title: '该规格已售罄或无效', icon: 'none' });
      // 保持当前选中（如果有）或不选任何规格
      return;
    }
    this.setData({
      selectedSpec: spec,
      selectedSpecText: spec.name || '',
      quantity: 1, 
      currentStockInPopup: spec.stock || 0 
    });
  },

  decreaseQuantity: function() { /* ... 保持原有 ... */ },
  increaseQuantity: function() { /* ... 保持原有 ... */ },
  onQuantityInput: function(e) { /* ... 保持原有 ... */ },

  // 修改：统一弹窗确认按钮和无规格直接操作的调用
  confirmAction: function() {
    if (!app.globalData.openid) { this.showLoginModal(); return; }
    if (!this.data.product || !this.data.product._id) { util.showError("商品信息错误"); return; }

    const hasSpecs = this.data.product.specs && this.data.product.specs.length > 0;
    
    if (hasSpecs && !this.data.selectedSpec) {
      util.showError("请选择商品规格");
      // 如果是弹窗打开的情况下，不自动关闭，让用户继续选择
      // 如果不是弹窗打开（即无规格商品直接调用到这里），则不需要额外操作
      if (this.data.showSpecsPopup) return; 
    }

    const stock = hasSpecs ? (this.data.selectedSpec ? this.data.selectedSpec.stock || 0 : 0) 
                           : (this.data.product.stock || 0);
    
    if (stock <= 0 && hasSpecs && this.data.selectedSpec) { // 仅在已选规格且库存为0时提示
      util.showError("此规格已售罄"); return;
    } else if (stock <= 0 && !hasSpecs) { // 商品本身无规格且库存为0
      util.showError("此商品已售罄"); return;
    }

    if (this.data.quantity <= 0) {
      util.showError("购买数量必须大于0"); return;
    }
    // 再次确认库存，以防选择规格后，数量未重置导致的问题
    const currentEffectiveStock = this.data.selectedSpec ? this.data.selectedSpec.stock : this.data.product.stock;
    if (this.data.quantity > currentEffectiveStock) {
      util.showError("所选数量超过库存"); 
      this.setData({ quantity: currentEffectiveStock > 0 ? currentEffectiveStock : 1 }); // 调整数量到库存上限或1
      return;
    }


    const actionType = this.data.popupActionType; 
    console.log("Confirming action:", actionType, "with quantity:", this.data.quantity, "selectedSpec:", this.data.selectedSpec);


    if (actionType === 'addToCart') {
      const params = {
        action: 'add',
        productId: this.data.product._id, 
        quantity: this.data.quantity,
        // 如果 selectedSpec 为 null (无规格或未选)，则 specId 传空字符串
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

  navigateToHome: function() { /* ... */ },
  navigateToCart: function() { /* ... */ },
  navigateToReviews: function() { /* ... */ },
  previewImage: function(e) { /* ... */ },
  showLoginModal: function() { /* ... */ },
  doNothing: function() {}, 
  onShareAppMessage: function () { /* ... */ },
  onShareTimeline: function() { /* ... */ }
});
