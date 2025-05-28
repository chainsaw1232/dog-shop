// pages/orderConfirm/index.js
const app = getApp();

Page({
  data: {
    type: '', 
    address: null,
    orderItems: [],
    remark: '',
    productAmount: '0.00', 
    shippingFee: '0.00',   
    couponAmount: '0.00',  
    totalAmount: '0.00',   
    availableCoupons: [],  
    selectedCoupon: null,  
    showCoupon: false,     
    tempSelectedCoupon: null, 
    isSubmitting: false 
  },

  onLoad: function(options) {
    if (options.type) {
      this.setData({ type: options.type });
      
      let itemsToProcess = [];
      if (options.type === 'cart') {
        itemsToProcess = wx.getStorageSync('checkoutItems') || [];
      } else if (options.type === 'buyNow') {
        const buyNowItem = wx.getStorageSync('buyNowItem');
        if (buyNowItem) {
          itemsToProcess = [buyNowItem];
        }
      }
      
      if (itemsToProcess.length === 0 && options.type !== 'buyNow') { // buyNow可能后续添加商品
          wx.showToast({ title: '没有需要结算的商品', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 1500);
          return;
      }
      this.setData({ orderItems: itemsToProcess });
      this.calculateAmount(); 
      
    } else {
        wx.showToast({ title: '订单类型错误', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
    }
    this.fetchDefaultAddress(); 
  },

  onShow: function() {
    const selectedAddressFromGlobal = app.globalData.selectedAddressForOrder;
    if (selectedAddressFromGlobal) {
        this.setData({ address: selectedAddressFromGlobal });
        delete app.globalData.selectedAddressForOrder; 
        this.calculateAmount(); 
    }
    const chosenCoupon = app.globalData.selectedCouponForOrder;
    if (chosenCoupon) {
        this.setData({ selectedCoupon: chosenCoupon });
        delete app.globalData.selectedCouponForOrder; 
        this.calculateAmount(); 
    }
  },

  fetchDefaultAddress: function() {
    // ... (代码与上一版相同，此处省略以节省空间)
    if (!app.globalData.openid) {
      console.warn('fetchDefaultAddress: openid is null, cannot fetch default address.');
      this.showLoginModal();
      return;
    }
    
    wx.cloud.callFunction({
      name: 'address', 
      data: {
        action: 'list' 
      }
    }).then(res => {
      console.log('[orderConfirm] fetchDefaultAddress - 云函数 address list 返回:', res.result);
      if (res.result && res.result.code === 200) { 
        const addresses = res.result.data || [];
        const defaultAddress = addresses.find(addr => addr.isDefault);
        if (defaultAddress) {
          this.setData({ address: defaultAddress });
        } else if (addresses.length > 0) {
          this.setData({ address: addresses[0] }); 
        }
      } else {
        console.warn("获取默认地址失败:", (res.result && res.result.message) || "云函数返回错误");
      }
    }).catch(err => {
      console.error('[orderConfirm] fetchDefaultAddress - 调用云函数 address list 失败:', err);
    });
  },

  // **修改点：接收 productAmountNum 作为参数**
  fetchAvailableCoupons: function(productAmountNum) { 
    if (!app.globalData.openid) {
      console.warn('fetchAvailableCoupons: openid is null, cannot fetch coupons.');
      return;
    }
    
    // **使用传入的参数**
    if (isNaN(productAmountNum) || productAmountNum <= 0) { 
        console.warn(`WorkspaceAvailableCoupons: productAmount (${productAmountNum}) is 0 or NaN, skipping coupon fetch.`);
        this.setData({ availableCoupons: [], selectedCoupon: null });
        // 不需要再次调用 calculateAmount，因为它可能导致循环
        return;
    }

    console.log('[orderConfirm] fetchAvailableCoupons - Calling coupon cloud function with orderAmount:', productAmountNum);
    wx.cloud.callFunction({
      name: 'coupon', 
      data: {
        action: 'available',
        orderAmount: productAmountNum 
      }
    }).then(res => {
      console.log('[orderConfirm] fetchAvailableCoupons - 云函数 coupon available 返回:', res.result);
      if (res.result && res.result.code === 0) { 
        const coupons = res.result.data || [];
        this.setData({ 
            availableCoupons: coupons,
            // 每次获取新列表后，检查当前选中的 selectedCoupon 是否仍然有效，如果无效则清空
            selectedCoupon: coupons.find(c => c._id === (this.data.selectedCoupon && this.data.selectedCoupon._id)) || null
        });
        // 如果清空了 selectedCoupon，需要重新计算总价
        if (!this.data.selectedCoupon && this.data.couponAmount !== '0.00') {
            this.calculateAmountOnly(); // 创建一个只计算金额不获取优惠券的辅助函数
        }

      } else {
        this.setData({ availableCoupons: [], selectedCoupon: null }); 
        console.warn("获取可用优惠券失败:", (res.result && res.result.message) || "云函数返回错误");
      }
    }).catch(err => {
      this.setData({ availableCoupons: [], selectedCoupon: null }); 
      console.error('[orderConfirm] fetchAvailableCoupons - 调用云函数 coupon available 失败:', err);
    });
  },

  // calculateAmount 现在主要负责计算和触发获取优惠券
  calculateAmount: function() {
    const orderItems = this.data.orderItems;
    let currentProductAmount = 0; // 使用局部变量存储当前计算的商品金额
    
    orderItems.forEach(item => {
      currentProductAmount += parseFloat(item.price) * parseInt(item.quantity);
    });
    
    const shippingFee = currentProductAmount >= 99 ? 0 : 10;
    
    let currentCouponAmount = 0; // 局部变量
    if (this.data.selectedCoupon && this.data.selectedCoupon.amount) {
      currentCouponAmount = parseFloat(this.data.selectedCoupon.amount);
    }
    
    const totalAmount = currentProductAmount + shippingFee - currentCouponAmount;
    
    this.setData({
      productAmount: currentProductAmount.toFixed(2),
      shippingFee: shippingFee.toFixed(2),
      couponAmount: currentCouponAmount.toFixed(2),
      totalAmount: totalAmount > 0 ? totalAmount.toFixed(2) : '0.00'
    });

    // **修改点：在金额计算完成后，将准确的商品金额传递给 fetchAvailableCoupons**
    if (currentProductAmount > 0) {
        this.fetchAvailableCoupons(currentProductAmount); // 传递金额
    } else {
        this.setData({ availableCoupons: [], selectedCoupon: null });
    }
  },

  // 新增：一个只计算总额和相关金额，不重新获取优惠券的函数
  // 用于在用户取消选择优惠券或从弹窗确认选择后更新总价
  calculateAmountOnly: function() {
    const orderItems = this.data.orderItems;
    let currentProductAmount = parseFloat(this.data.productAmount); // 从已有的data中取，避免重复计算商品总额
    if (isNaN(currentProductAmount)) currentProductAmount = 0;
        
    const shippingFee = currentProductAmount >= 99 ? 0 : 10;
    
    let currentCouponAmount = 0;
    if (this.data.selectedCoupon && this.data.selectedCoupon.amount) {
      currentCouponAmount = parseFloat(this.data.selectedCoupon.amount);
    }
    
    const totalAmount = currentProductAmount + shippingFee - currentCouponAmount;
    
    this.setData({
      // productAmount 和 shippingFee 保持不变，除非商品或地址变了
      couponAmount: currentCouponAmount.toFixed(2),
      totalAmount: totalAmount > 0 ? totalAmount.toFixed(2) : '0.00'
    });
  },


  navigateToAddress: function() {
    wx.navigateTo({
      url: `/pages/address/index?select=true&currentAddressId=${this.data.address ? this.data.address._id : ''}`
    });
  },

  showCouponPopup: function() {
    if (this.data.availableCoupons.length === 0) {
        wx.showToast({ title: '暂无可用优惠券', icon: 'none' });
        return;
    }
    this.setData({
      showCoupon: true,
      tempSelectedCoupon: this.data.selectedCoupon 
    });
  },

  hideCouponPopup: function() {
    this.setData({ showCoupon: false });
  },

  selectCoupon: function(e) {
    const coupon = e.currentTarget.dataset.coupon;
    if (this.data.tempSelectedCoupon && this.data.tempSelectedCoupon._id === coupon._id) {
      this.setData({ tempSelectedCoupon: null });
    } else {
      this.setData({ tempSelectedCoupon: coupon });
    }
  },

  selectNoCoupon: function() {
    this.setData({ tempSelectedCoupon: null });
  },

  confirmCoupon: function() {
    this.setData({
      selectedCoupon: this.data.tempSelectedCoupon, 
      showCoupon: false
    });
    // **修改点：优惠券选择后，只更新金额，不重新获取优惠券列表**
    this.calculateAmountOnly(); 
  },

  onRemarkInput: function(e) {
    this.setData({ remark: e.detail.value });
  },

  submitOrder: function() {
    // ... (代码与上一版相同，此处省略)
    if (this.data.isSubmitting) return; 

    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }
    
    if (!this.data.address) {
      wx.showToast({ title: '请选择收货地址', icon: 'none' });
      return;
    }
    if (this.data.orderItems.length === 0) {
        wx.showToast({ title: '订单中没有商品', icon: 'none' });
        return;
    }
    
    this.setData({isSubmitting: true});
    wx.showLoading({ title: '提交中...' });
    
    const orderItemsPayload = this.data.orderItems.map(item => ({
      productId: item.productId || item._id,
      productName: item.productName,
      productImage: item.productImage,
      price: parseFloat(item.price),
      quantity: parseInt(item.quantity),
      specId: item.specId || '',
      specName: item.specName || '',
      amount: parseFloat(item.price) * parseInt(item.quantity)
    }));
    
    const orderData = {
        action: 'create',
        addressId: this.data.address._id,
        orderItems: orderItemsPayload, 
        couponId: this.data.selectedCoupon ? this.data.selectedCoupon._id : '',
        remark: this.data.remark,
        productAmount: parseFloat(this.data.productAmount),
        shippingFee: parseFloat(this.data.shippingFee),
        totalAmount: parseFloat(this.data.totalAmount)
    };

    wx.cloud.callFunction({
      name: 'orders',
      data: orderData,
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 0) { 
        const { orderId, orderNo, totalAmount: serverCalculatedTotalAmount } = res.result.data;
        
        if (this.data.type === 'cart') {
          const cartItemIds = this.data.orderItems.map(item => item._id).filter(id => !!id);
          if (cartItemIds.length > 0) {
            this.clearCartItemsAfterOrder(cartItemIds);
          }
        }
        
        console.log(`订单 ${orderNo} 创建成功，金额 ${serverCalculatedTotalAmount}，准备跳转支付结果页`);
        wx.redirectTo({ 
          url: `/pages/payResult/index?orderId=${orderId}&status=success&amount=${serverCalculatedTotalAmount}`
        });
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '创建订单失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('[orderConfirm] submitOrder - 调用云函数 orders create 失败:', err);
      wx.showToast({ title: '网络请求失败，请重试', icon: 'none' });
    }).finally(()=>{
        this.setData({isSubmitting: false});
    });
  },

  clearCartItemsAfterOrder: function(cartItemIds) {
    // ... (代码与上一版相同，此处省略)
    if (!app.globalData.openid || !cartItemIds || cartItemIds.length === 0) return;
    
    wx.cloud.callFunction({
      name: 'cart',
      data: {
        action: 'removeMultiple',
        ids: cartItemIds
      }
    }).then(res => {
      if (res.result && res.result.code === 0) { 
        console.log('[orderConfirm] 购物车已下单商品清除成功');
        if (typeof app.getCartCount === 'function') {
          app.getCartCount();
        }
      } else {
        console.warn('[orderConfirm] 清除购物车商品失败:', (res.result && res.result.message));
      }
    }).catch(err => {
      console.error('[orderConfirm] 清除购物车商品云函数调用失败:', err);
    });
  },

  showLoginModal: function() {
    // ... (代码与上一版相同，此处省略)
    wx.showModal({
      title: '登录提示',
      content: '请先登录后再操作。',
      confirmText: '去登录',
      showCancel: false,
      success: res => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/user/index' });
        }
      }
    });
  },

  onUnload: function() {
    // ... (代码与上一版相同，此处省略)
    if (app.globalData.selectedAddressForOrder) {
        delete app.globalData.selectedAddressForOrder;
    }
    if (app.globalData.selectedCouponForOrder) {
        delete app.globalData.selectedCouponForOrder;
    }
    wx.removeStorageSync('checkoutItems');
    wx.removeStorageSync('buyNowItem');
  }
});