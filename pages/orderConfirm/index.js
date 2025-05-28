// pages/orderConfirm/index.js
const app = getApp();
const util = require('../../utils/util.js'); // <--- 添加了这一行

Page({
  data: {
    type: '', // 'cart' 或 'buyNow'
    address: null, // 当前选中的收货地址对象
    orderItems: [], // 要结算的商品列表
    remark: '', // 订单备注
    productAmount: '0.00', // 商品总金额
    shippingFee: '0.00',   // 运费
    couponAmount: '0.00',  // 优惠券抵扣金额
    totalAmount: '0.00',   // 最终应付总金额
    availableCoupons: [],  // 当前订单可用的优惠券列表
    selectedCoupon: null,  // 用户当前选择的优惠券对象
    showCoupon: false,     // 是否显示优惠券选择弹窗
    tempSelectedCoupon: null, // 弹窗中临时选中的优惠券
    isSubmitting: false // 是否正在提交订单，防止重复提交
  },

  onLoad: function(options) {
    if (options.type) {
      this.setData({ type: options.type });
      
      let itemsToProcess = [];
      if (options.type === 'cart') {
        itemsToProcess = wx.getStorageSync('checkoutItems') || [];
        console.log('[OrderConfirm onLoad] 从缓存读取到的购物车结算商品:', itemsToProcess);
      } else if (options.type === 'buyNow') {
        const buyNowItem = wx.getStorageSync('buyNowItem');
        if (buyNowItem) {
          itemsToProcess = [buyNowItem];
        }
        console.log('[OrderConfirm onLoad] 从缓存读取到的立即购买商品:', itemsToProcess);
      }
      
      if (itemsToProcess.length === 0 && options.type !== 'buyNow') {
          wx.showToast({ title: '没有需要结算的商品', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 1500);
          return;
      }
      this.setData({ orderItems: itemsToProcess });
      this.calculateAmount(); 
      
    } else {
        wx.showToast({ title: '订单类型错误', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return; // Add return here to prevent further execution if type is missing
    }
    this.fetchDefaultAddress(); 
  },

  onShow: function() {
    const selectedAddressFromGlobal = app.globalData.selectedAddressForOrder;
    if (selectedAddressFromGlobal) {
        console.log('[OrderConfirm onShow] 接收到从全局数据传递的地址:', selectedAddressFromGlobal);
        this.setData({ address: selectedAddressFromGlobal });
        delete app.globalData.selectedAddressForOrder; 
        this.calculateAmount(); 
    }

    const chosenCoupon = app.globalData.selectedCouponForOrder;
    if (chosenCoupon) {
        console.log('[OrderConfirm onShow] 接收到从全局数据传递的优惠券:', chosenCoupon);
        this.setData({ selectedCoupon: chosenCoupon });
        delete app.globalData.selectedCouponForOrder; 
        this.calculateAmountOnly(); 
    }
  },

  setAddress: function(selectedAddress) {
    console.log('[OrderConfirm] setAddress 方法被调用，选中的地址:', selectedAddress);
    if (selectedAddress) {
      this.setData({
        address: selectedAddress
      });
      this.calculateAmount(); 
    } else {
      console.warn('[OrderConfirm] setAddress 方法接收到的地址为空');
    }
  },

  fetchDefaultAddress: function() {
    if (!app.globalData.openid) {
      console.warn('fetchDefaultAddress: openid is null, cannot fetch default address.');
      return;
    }
    
    wx.cloud.callFunction({
      name: 'address', 
      data: {
        action: 'list' 
      }
    }).then(res => {
      console.log('[OrderConfirm] fetchDefaultAddress - 云函数 address list 返回:', res.result);
      if (res.result && res.result.code === 200) { 
        const addresses = res.result.data || [];
        let currentAddress = this.data.address; 
        
        if (!currentAddress) { 
            const defaultAddress = addresses.find(addr => addr.isDefault);
            if (defaultAddress) {
              currentAddress = defaultAddress;
            } else if (addresses.length > 0) {
              currentAddress = addresses[0]; 
            }
        }
        this.setData({ address: currentAddress }); 
      } else {
        console.warn("获取默认地址失败:", (res.result && res.result.message) || "云函数返回错误");
      }
    }).catch(err => {
      console.error('[OrderConfirm] fetchDefaultAddress - 调用云函数 address list 失败:', err);
    });
  },

  fetchAvailableCoupons: function(productAmountNum) { 
    if (!app.globalData.openid) {
      console.warn('fetchAvailableCoupons: openid is null, cannot fetch coupons.');
      return;
    }
    
    if (isNaN(productAmountNum) || productAmountNum <= 0) { 
        console.warn(`fetchAvailableCoupons: productAmount (${productAmountNum}) is 0 or NaN, skipping coupon fetch.`);
        this.setData({ availableCoupons: [], selectedCoupon: null });
        return;
    }

    console.log('[OrderConfirm] fetchAvailableCoupons - Calling coupon cloud function with orderAmount:', productAmountNum);
    wx.cloud.callFunction({
      name: 'coupon', 
      data: {
        action: 'available',
        orderAmount: productAmountNum 
      }
    }).then(res => {
      console.log('[OrderConfirm] fetchAvailableCoupons - 云函数 coupon available 返回:', res.result);
      if (res.result && res.result.code === 0) { 
        const coupons = res.result.data || [];
        coupons.forEach(coupon => {
            if (coupon.startTime && !coupon.startTimeFormatted) {
                coupon.startTimeFormatted = util.formatTime(new Date(coupon.startTime), 'YYYY.MM.DD'); // <--- 修改处
            }
            if (coupon.endTime && !coupon.endTimeFormatted) {
                coupon.endTimeFormatted = util.formatTime(new Date(coupon.endTime), 'YYYY.MM.DD'); // <--- 修改处
            }
        });

        const currentSelectedId = this.data.selectedCoupon ? this.data.selectedCoupon._id : null;
        const stillAvailableSelectedCoupon = coupons.find(c => c._id === currentSelectedId);

        this.setData({ 
            availableCoupons: coupons,
            selectedCoupon: stillAvailableSelectedCoupon || null 
        });
        
        if (currentSelectedId && !stillAvailableSelectedCoupon) {
            this.calculateAmountOnly(); 
        }

      } else {
        this.setData({ availableCoupons: [], selectedCoupon: null }); 
        console.warn("获取可用优惠券失败:", (res.result && res.result.message) || "云函数返回错误");
      }
    }).catch(err => {
      this.setData({ availableCoupons: [], selectedCoupon: null }); 
      console.error('[OrderConfirm] fetchAvailableCoupons - 调用云函数 coupon available 失败:', err);
    });
  },

  calculateAmount: function() {
    const orderItems = this.data.orderItems;
    let currentProductAmount = 0;
    
    orderItems.forEach(item => {
      currentProductAmount += parseFloat(item.price) * parseInt(item.quantity);
    });
    
    const shippingFee = currentProductAmount >= 99 ? 0 : 10; 
    
    let currentCouponAmount = 0;
    if (this.data.selectedCoupon && this.data.selectedCoupon.amount) {
      if (this.data.selectedCoupon.type === 'fixed_amount') {
        currentCouponAmount = parseFloat(this.data.selectedCoupon.amount);
      } else if (this.data.selectedCoupon.type === 'discount' && currentProductAmount > 0) {
        currentCouponAmount = currentProductAmount * (1 - parseFloat(this.data.selectedCoupon.amount)); 
        currentCouponAmount = parseFloat(currentCouponAmount.toFixed(2)); 
      }
    }
    
    const totalAmount = currentProductAmount + shippingFee - currentCouponAmount;
    
    this.setData({
      productAmount: currentProductAmount.toFixed(2),
      shippingFee: shippingFee.toFixed(2),
      couponAmount: currentCouponAmount.toFixed(2),
      totalAmount: totalAmount > 0 ? totalAmount.toFixed(2) : '0.00'
    });

    if (currentProductAmount > 0) {
        this.fetchAvailableCoupons(currentProductAmount);
    } else {
        this.setData({ availableCoupons: [], selectedCoupon: null });
    }
  },

  calculateAmountOnly: function() {
    const orderItems = this.data.orderItems; 
    let currentProductAmount = parseFloat(this.data.productAmount); 
    if (isNaN(currentProductAmount)) { 
        currentProductAmount = 0;
        orderItems.forEach(item => {
          currentProductAmount += parseFloat(item.price) * parseInt(item.quantity);
        });
    }
        
    const shippingFee = currentProductAmount >= 99 ? 0 : 10;
    
    let currentCouponAmount = 0;
    if (this.data.selectedCoupon && this.data.selectedCoupon.amount) {
      if (this.data.selectedCoupon.type === 'fixed_amount') {
        currentCouponAmount = parseFloat(this.data.selectedCoupon.amount);
      } else if (this.data.selectedCoupon.type === 'discount' && currentProductAmount > 0) {
        currentCouponAmount = currentProductAmount * (1 - parseFloat(this.data.selectedCoupon.amount));
        currentCouponAmount = parseFloat(currentCouponAmount.toFixed(2));
      }
    }
    
    const totalAmount = currentProductAmount + shippingFee - currentCouponAmount;
    
    this.setData({
      productAmount: currentProductAmount.toFixed(2), 
      shippingFee: shippingFee.toFixed(2),
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
    if (this.data.availableCoupons.length === 0 && !this.data.selectedCoupon) { 
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
    const productAmountNum = parseFloat(this.data.productAmount);
    if (coupon.minAmount && productAmountNum < coupon.minAmount) {
        wx.showToast({ title: '当前商品金额不满足该券使用条件', icon: 'none' });
        return;
    }

    if (this.data.tempSelectedCoupon && this.data.tempSelectedCoupon._id === coupon._id) {
      // this.setData({ tempSelectedCoupon: null }); 
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
    this.calculateAmountOnly(); 
  },

  onRemarkInput: function(e) {
    this.setData({ remark: e.detail.value });
  },

  submitOrder: function() {
    if (this.data.isSubmitting) return; 

    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }
    
    if (!this.data.address) {
      wx.showToast({ title: '请选择收货地址', icon: 'none' });
      return;
    }
    if (!this.data.orderItems || this.data.orderItems.length === 0) {
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
          const cartItemIds = wx.getStorageSync('checkoutItems').map(item => item._id).filter(id => !!id);
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
      console.error('[OrderConfirm] submitOrder - 调用云函数 orders create 失败:', err);
      wx.showToast({ title: '网络请求失败，请重试', icon: 'none' });
    }).finally(()=>{
        this.setData({isSubmitting: false});
    });
  },

  clearCartItemsAfterOrder: function(cartItemIds) {
    if (!app.globalData.openid || !cartItemIds || cartItemIds.length === 0) return;
    
    wx.cloud.callFunction({
      name: 'cart',
      data: {
        action: 'removeMultiple',
        ids: cartItemIds
      }
    }).then(res => {
      if (res.result && res.result.code === 0) { 
        console.log('[OrderConfirm] 购物车已下单商品清除成功');
        if (typeof app.getCartCount === 'function') {
          app.getCartCount(); 
        }
      } else {
        console.warn('[OrderConfirm] 清除购物车商品失败:', (res.result && res.result.message));
      }
    }).catch(err => {
      console.error('[OrderConfirm] 清除购物车商品云函数调用失败:', err);
    });
  },

  showLoginModal: function() {
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
    if (app.globalData.selectedAddressForOrder) {
        delete app.globalData.selectedAddressForOrder;
    }
    if (app.globalData.selectedCouponForOrder) {
        delete app.globalData.selectedCouponForOrder;
    }
    if (this.data.type === 'cart') {
        wx.removeStorageSync('checkoutItems');
    } else if (this.data.type === 'buyNow') {
        wx.removeStorageSync('buyNowItem');
    }
  },

  // _formatTime: function(date, fmt) { // 这部分可以移除，因为已经改用 util.formatTime
  //   // ...
  // }
});