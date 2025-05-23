// pages/cart/index.js
const app = getApp(); // 获取App实例

Page({
  data: {
    cartItems: [], 
    recommendProducts: [], 
    isCartEmpty: true, 
    allSelected: false, 
    selectedCount: 0, 
    totalPrice: '0.00', 
    lastInteractionTime: Date.now(), 
    isLoading: true, // 初始加载状态
    isRecommendLoading: false, 
    isSubmitting: false, // 防止重复提交结算或移除

    // 图标路径 - 老板，记得在这里填上你正确的云存储路径！
    CHOSEN_ICON_PATH: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/icons/checkbox_selected.png', // 示例
    UNCHOSEN_ICON_PATH: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/icons/checkbox_unselected.png', // 示例
  },

  onLoad: function() {
    this.setData({ isLoading: true }); // onLoad 时也设置加载中
    // this.fetchRecommendProducts(); // 推荐商品可以在购物车为空时再加载，或与购物车列表并行加载
  },

  onShow: function() {
    this.setData({
      lastInteractionTime: Date.now(),
      isLoading: true // 每次显示页面都应该重新加载购物车数据
    });
    this.fetchCartItems(); 
    if (app.globalData.openid && typeof app.getCartCount === 'function') {
        app.getCartCount();
    }
  },

  fetchCartItems: function() {
    if (!app.globalData.openid) {
      this.setData({
        cartItems: [],
        isCartEmpty: true,
        allSelected: false, 
        selectedCount: 0,
        totalPrice: '0.00',
        isLoading: false,
      });
      // 提示登录
      wx.showModal({ 
        title: '登录提示', 
        content: '您还未登录，请先登录查看购物车哦~', 
        confirmText: '去登录',
        cancelText: '暂不登录',
        success: (res) => { 
          if (res.confirm) { 
            wx.switchTab({ url: '/pages/user/index' });
          } else {
            // 用户选择暂不登录，可以加载推荐商品
             if (this.data.recommendProducts.length === 0) { // 避免重复加载
                this.fetchRecommendProducts();
            }
          }
        }
      });
      return;
    }

    this.setData({ isLoading: true });
    // wx.showLoading({ title: '加载中...' }); // 使用页面级别的isLoading替代

    wx.cloud.callFunction({
      name: 'cart', // 确保云函数名称正确
      data: {
        action: 'list' 
      }
    })
    .then(res => {
      console.log('[购物车JS] fetchCartItems - 云函数返回:', res.result);
      if (res.result && res.result.code === 0) {
        const items = res.result.data || [];
        const isEmpty = items.length === 0;
        
        items.forEach(item => {
          if (typeof item.selected === 'undefined') {
            item.selected = true; // 默认选中
          }
          item.price = parseFloat(item.price || 0).toFixed(2); // 确保价格是两位小数的字符串
          item.quantity = parseInt(item.quantity) || 1;
          // productImage 路径应该由云函数 formatImagePath 处理好
        });

        this.setData({
          cartItems: items,
          isCartEmpty: isEmpty,
        });
        if (isEmpty && this.data.recommendProducts.length === 0) { // 如果购物车为空且未加载推荐
            this.fetchRecommendProducts();
        }
      } else {
        this.setData({
          cartItems: [],
          isCartEmpty: true,
          allSelected: false, // 重置状态
        });
        wx.showToast({ title: (res.result && res.result.message) || '购物车加载失败', icon: 'none' });
      }
    })
    .catch(err => {
      console.error('[购物车JS] fetchCartItems - 调用失败:', err);
      this.setData({
        cartItems: [],
        isCartEmpty: true,
        allSelected: false,
      });
      wx.showToast({ title: '网络请求失败', icon: 'none' });
    })
    .finally(() => {
      this.setData({ isLoading: false });
      // wx.hideLoading();
      this.calculateTotal(); // 无论成功失败，都重新计算一次总价和状态
    });
  },

  fetchRecommendProducts: function() {
    this.setData({ isRecommendLoading: true });
    wx.cloud.callFunction({
      name: 'getProducts', 
      data: {
        action: 'list', 
        isRecommend: true, 
        pageSize: 4 
      }
    })
    .then(res => {
      if (res.result && res.result.code === 0 && res.result.data && res.result.data.list) {
        this.setData({
          recommendProducts: res.result.data.list,
        });
      } else {
        this.setData({ recommendProducts: [] });
      }
    })
    .catch(err => {
      console.error('[推荐商品] 加载失败:', err);
      this.setData({ recommendProducts: [] });
    })
    .finally(() => {
        this.setData({ isRecommendLoading: false });
    });
  },

  toggleSelect: function(e) {
    this.setData({ lastInteractionTime: Date.now() });
    const index = e.currentTarget.dataset.index;
    const cartItems = this.data.cartItems;
    if (cartItems[index]) {
      cartItems[index].selected = !cartItems[index].selected;
      this.setData({ cartItems });
      this.calculateTotal();
    }
  },

  toggleSelectAll: function() {
    this.setData({ lastInteractionTime: Date.now() });
    const newAllSelectedState = !this.data.allSelected;
    const cartItems = this.data.cartItems.map(item => {
      return {...item, selected: newAllSelectedState};
    });
    this.setData({
      cartItems,
      allSelected: newAllSelectedState 
    });
    this.calculateTotal();
  },

  decreaseQuantity: function(e) {
    this.setData({ lastInteractionTime: Date.now() });
    const index = e.currentTarget.dataset.index;
    const cartItems = this.data.cartItems;
    if (cartItems[index] && cartItems[index].quantity > 1) {
      cartItems[index].quantity -= 1;
      this.setData({ cartItems });
      this.calculateTotal();
      this.updateCartItemQuantity(cartItems[index]);
    }
  },

  increaseQuantity: function(e) {
    this.setData({ lastInteractionTime: Date.now() });
    const index = e.currentTarget.dataset.index;
    const cartItems = this.data.cartItems;
    const stock = cartItems[index].stock || 99; // 假设默认最大99或使用实际库存
    if (cartItems[index] && cartItems[index].quantity < stock) {
      cartItems[index].quantity += 1;
      this.setData({ cartItems });
      this.calculateTotal();
      this.updateCartItemQuantity(cartItems[index]);
    } else if (cartItems[index]) {
        wx.showToast({ title: '已达到库存上限', icon: 'none'});
    }
  },

  onQuantityInput: function(e) {
    this.setData({ lastInteractionTime: Date.now() });
    const index = e.currentTarget.dataset.index;
    const cartItems = this.data.cartItems;
    let value = parseInt(e.detail.value);

    if (cartItems[index]) {
        const stock = cartItems[index].stock || 99;
        if (isNaN(value) || value < 1) {
          value = 1;
        }
        if (value > stock) {
          value = stock;
          wx.showToast({ title: '已达到库存上限', icon: 'none'});
        }
        // 仅当值变化时才更新，避免不必要的setData和云函数调用
        if (cartItems[index].quantity !== value) {
            cartItems[index].quantity = value;
            this.setData({ cartItems }); 
            this.calculateTotal();
            this.updateCartItemQuantity(cartItems[index]);
        }
    }
  },
  
  onQuantityBlur: function(e) {
    const index = e.currentTarget.dataset.index;
    const cartItems = this.data.cartItems;
    if (cartItems[index]) {
        if (cartItems[index].quantity === "" || isNaN(cartItems[index].quantity) || cartItems[index].quantity < 1) {
            if (cartItems[index].quantity !== 1) { // 避免不必要的更新
                cartItems[index].quantity = 1; 
                this.setData({ cartItems });
                this.calculateTotal();
                this.updateCartItemQuantity(cartItems[index]);
            }
        }
    }
  },

  updateCartItemQuantity: function(item) {
    if (!app.globalData.openid || !item || !item._id) return;
    // 节流或防抖可以考虑，但数量调整通常希望即时反馈
    wx.cloud.callFunction({
      name: 'cart',
      data: {
        action: 'update',
        cartItemId: item._id,
        quantity: item.quantity
      }
    })
    .then(res => {
      console.log('[购物车JS] updateCartItemQuantity - 云函数返回:', res.result);
      if (res.result && res.result.code === 0) {
        if (typeof app.getCartCount === 'function') {
          app.getCartCount(); 
        }
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '更新数量失败', icon: 'none' });
        this.fetchCartItems(); // 失败时回滚或重新拉取
      }
    })
    .catch(err => {
      console.error('[购物车JS] updateCartItemQuantity - 调用失败:', err);
      wx.showToast({ title: '网络错误，更新失败', icon: 'none' });
      this.fetchCartItems();
    });
  },

  removeSelectedItems: function() {
    this.setData({ lastInteractionTime: Date.now() });
    if (this.data.selectedCount === 0 || this.data.isSubmitting) return;
    if (!app.globalData.openid) { this.showLoginModal(); return; }

    const selectedItems = this.data.cartItems.filter(item => item.selected);
    const selectedItemIds = selectedItems.map(item => item._id);

    if (selectedItemIds.length === 0) {
        wx.showToast({ title: '请选择要移除的商品', icon: 'none' });
        return;
    }

    wx.showModal({
      title: '确认操作',
      content: `确定要移除选中的 ${selectedItemIds.length} 项商品吗？`,
      success: res => {
        if (res.confirm) {
          this.setData({ isSubmitting: true });
          wx.showLoading({ title: '移除中...' });
          wx.cloud.callFunction({
            name: 'cart',
            data: {
              action: 'removeMultiple',
              ids: selectedItemIds 
            }
          })
          .then(cloudRes => {
            console.log('[购物车JS] removeSelectedItems - 云函数返回:', cloudRes.result);
            if (cloudRes.result && cloudRes.result.code === 0) {
              const remainingItems = this.data.cartItems.filter(item => selectedItemIds.indexOf(item._id) === -1);
              this.setData({
                cartItems: remainingItems,
                isCartEmpty: remainingItems.length === 0
              });
              this.calculateTotal(); 
              if (typeof app.getCartCount === 'function') {
                app.getCartCount(); 
              }
              wx.showToast({ title: '移除成功', icon: 'success' });
            } else {
              wx.showToast({ title: (cloudRes.result && cloudRes.result.message) || '移除失败', icon: 'none' });
            }
          })
          .catch(cloudErr => {
            console.error('[购物车JS] removeSelectedItems - 调用失败:', cloudErr);
            wx.showToast({ title: '网络错误，移除失败', icon: 'none' });
          })
          .finally(() => {
            wx.hideLoading();
            this.setData({ isSubmitting: false });
          });
        }
      }
    });
  },

  calculateTotal: function() {
    const cartItems = this.data.cartItems;
    let currentTotalPrice = 0;
    let currentSelectedCount = 0; 
    let currentAllSelected = cartItems.length > 0; 

    cartItems.forEach(item => {
      if (item.selected) {
        currentTotalPrice += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0);
        currentSelectedCount += (parseInt(item.quantity) || 0); 
      } else {
        currentAllSelected = false; 
      }
    });

    if (cartItems.length === 0) {
        currentAllSelected = false;
    }

    this.setData({
      totalPrice: currentTotalPrice.toFixed(2),
      selectedCount: currentSelectedCount,
      allSelected: currentAllSelected
    });
  },

  checkout: function() {
    this.setData({ lastInteractionTime: Date.now() });
    if (this.data.selectedCount === 0 || this.data.isSubmitting) return;
    if (!app.globalData.openid) { this.showLoginModal(); return; }

    const selectedItems = this.data.cartItems.filter(item => item.selected);
    const checkoutItemsForStorage = selectedItems.map(item => ({
        _id: item._id, 
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage, 
        price: item.price,
        quantity: item.quantity,
        specId: item.specId,
        specName: item.specName,
        // stock: item.stock // 订单确认页可能需要库存信息进行最后校验
    }));

    wx.setStorageSync('checkoutItems', checkoutItemsForStorage); 
    this.setData({ isSubmitting: true }); // 开始结算，防止重复点击
    wx.navigateTo({
      url: '/pages/orderConfirm/index?type=cart',
      complete: () => {
        // 页面跳转完成后，可以考虑重置 isSubmitting，但通常订单确认页会有自己的处理
        // this.setData({ isSubmitting: false }); 
      }
    });
  },
  
  // onHide 或 onUnload 时，可以考虑清除 isSubmitting 状态
  onHide: function() {
    this.setData({ isSubmitting: false });
  },
  onUnload: function() {
    this.setData({ isSubmitting: false });
  },

  navigateToDetail: function(e) {
    this.setData({ lastInteractionTime: Date.now() });
    const productId = e.currentTarget.dataset.id;
    if (productId) {
      wx.navigateTo({ url: `/pages/detail/index?id=${productId}` });
    }
  },

  navigateToIndex: function() {
    this.setData({ lastInteractionTime: Date.now() });
    wx.switchTab({ url: '/pages/index/index' });
  },
  
  showLoginModal: function() {
    wx.showModal({
      title: '登录提示',
      content: '请先登录后再操作哦~',
      confirmText: '去登录',
      showCancel: false, // 可以不显示取消按钮，强制去登录页
      success: res => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/user/index' });
        }
      }
    });
  },
});
