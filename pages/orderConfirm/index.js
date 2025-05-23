// orderConfirm/index.js
const app = getApp()

Page({
  data: {
    type: '', // 'cart' 或 'buyNow'
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
    tempSelectedCoupon: null // 临时选中的优惠券，确认后才会真正应用
  },

  onLoad: function(options) {
    // 获取订单类型：购物车结算 或 立即购买
    if (options.type) {
      this.setData({ type: options.type })
      
      // 根据类型获取订单商品
      if (options.type === 'cart') {
        // 从购物车结算
        const checkoutItems = wx.getStorageSync('checkoutItems') || []
        this.setData({ orderItems: checkoutItems })
      } else if (options.type === 'buyNow') {
        // 立即购买
        const buyNowItem = wx.getStorageSync('buyNowItem')
        if (buyNowItem) {
          this.setData({ orderItems: [buyNowItem] })
        }
      }
      
      // 计算订单金额
      this.calculateAmount()
    }
    
    // 获取默认收货地址
    this.fetchDefaultAddress()
    
    // 获取可用优惠券
    this.fetchAvailableCoupons()
  },

  // 获取默认收货地址
  fetchDefaultAddress: function() {
    if (!app.globalData.openid) {
      console.warn('fetchDefaultAddress: openid is null, cannot fetch default address.');
      return;
    }
    
    // 使用云函数获取地址列表，然后筛选默认地址
    wx.cloud.callFunction({
      name: 'address',
      data: {
        action: 'list',
        openid: app.globalData.openid
      },
      success: res => {
        console.log('[云函数] [address] [list] 获取地址列表成功:', res.result);
        if (res.result && res.result.code === 200) {
          const addresses = res.result.data || [];
          // 查找默认地址
          const defaultAddress = addresses.find(addr => addr.isDefault);
          if (defaultAddress) {
            this.setData({ address: defaultAddress });
          } else if (addresses.length > 0) {
            // 如果没有默认地址，使用第一个地址
            this.setData({ address: addresses[0] });
          }
        }
      },
      fail: err => {
        console.error('[云函数] [address] [list] 调用失败:', err);
      }
    });
  },

  // 获取可用优惠券
  fetchAvailableCoupons: function() {
    if (!app.globalData.openid) {
      console.warn('fetchAvailableCoupons: openid is null, cannot fetch coupons.');
      return;
    }
    
    const productAmount = parseFloat(this.data.productAmount);
    
    // 使用云函数获取可用优惠券
    wx.cloud.callFunction({
      name: 'coupon',
      data: {
        action: 'available',
        openid: app.globalData.openid,
        amount: productAmount
      },
      success: res => {
        console.log('[云函数] [coupon] [available] 获取可用优惠券成功:', res.result);
        if (res.result && res.result.code === 200) {
          this.setData({ availableCoupons: res.result.data || [] });
        }
      },
      fail: err => {
        console.error('[云函数] [coupon] [available] 调用失败:', err);
      }
    });
  },

  // 计算订单金额
  calculateAmount: function() {
    const orderItems = this.data.orderItems
    let productAmount = 0
    
    // 计算商品总金额
    orderItems.forEach(item => {
      productAmount += item.price * item.quantity
    })
    
    // 计算运费（这里简化处理，实际可能根据商品重量、地址等计算）
    const shippingFee = productAmount >= 99 ? 0 : 10
    
    // 计算优惠券金额
    let couponAmount = 0
    if (this.data.selectedCoupon) {
      couponAmount = this.data.selectedCoupon.amount
    }
    
    // 计算总金额
    const totalAmount = productAmount + shippingFee - couponAmount
    
    this.setData({
      productAmount: productAmount.toFixed(2),
      shippingFee: shippingFee.toFixed(2),
      couponAmount: couponAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2)
    })
  },

  // 跳转到地址管理
  navigateToAddress: function() {
    wx.navigateTo({
      url: '/pages/address/index?select=true'
    })
  },

  // 显示优惠券弹窗
  showCouponPopup: function() {
    this.setData({
      showCoupon: true,
      tempSelectedCoupon: this.data.selectedCoupon
    })
  },

  // 隐藏优惠券弹窗
  hideCouponPopup: function() {
    this.setData({ showCoupon: false })
  },

  // 选择优惠券
  selectCoupon: function(e) {
    const coupon = e.currentTarget.dataset.coupon
    
    // 如果点击的是已选中的优惠券，则取消选择
    if (this.data.tempSelectedCoupon && this.data.tempSelectedCoupon._id === coupon._id) {
      this.setData({ tempSelectedCoupon: null })
    } else {
      this.setData({ tempSelectedCoupon: coupon })
    }
  },

  // 确认选择优惠券
  confirmCoupon: function() {
    this.setData({
      selectedCoupon: this.data.tempSelectedCoupon,
      showCoupon: false
    })
    
    // 重新计算订单金额
    this.calculateAmount()
  },

  // 备注输入
  onRemarkInput: function(e) {
    this.setData({ remark: e.detail.value })
  },

  // 提交订单
  submitOrder: function() {
    if (!app.globalData.openid) {
      this.showLoginModal()
      return
    }
    
    if (!this.data.address) {
      wx.showToast({
        title: '请选择收货地址',
        icon: 'none'
      })
      return
    }
    
    wx.showLoading({ title: '提交中...' })
    
    // 构建订单数据
    const orderItems = this.data.orderItems.map(item => ({
      productId: item.productId || item._id,
      quantity: item.quantity,
      skuInfo: item.skuInfo || {}
    }));
    
    // 使用云函数创建订单
    wx.cloud.callFunction({
      name: 'orders',
      data: {
        action: 'create',
        openid: app.globalData.openid,
        addressId: this.data.address._id,
        items: orderItems,
        couponId: this.data.selectedCoupon ? this.data.selectedCoupon._id : '',
        remark: this.data.remark,
        totalAmount: parseFloat(this.data.totalAmount),
        shippingFee: parseFloat(this.data.shippingFee)
      },
      success: res => {
        console.log('[云函数] [orders] [create] 创建订单成功:', res.result);
        wx.hideLoading();
        
        if (res.result && res.result.code === 200) {
          const orderId = res.result.data.orderId;
          const orderNo = res.result.data.orderNo;
          const finalAmount = res.result.data.finalAmount;
          
          // 这里可以发起微信支付，但由于支付需要商户号等配置，这里简化处理
          // 假设支付成功，清除购物车中已购买的商品
          if (this.data.type === 'cart') {
            this.clearCartItems();
          }
          
          // 跳转到支付成功页面
          wx.redirectTo({
            url: `/pages/payResult/index?orderId=${orderId}&status=success`
          });
          
          /* 实际支付代码应类似如下：
          wx.requestPayment({
            timeStamp: '',
            nonceStr: '',
            package: '',
            signType: 'MD5',
            paySign: '',
            success: () => {
              // 支付成功，清除购物车中已购买的商品
              if (this.data.type === 'cart') {
                this.clearCartItems();
              }
              
              // 跳转到支付成功页面
              wx.redirectTo({
                url: `/pages/payResult/index?orderId=${orderId}&status=success`
              });
            },
            fail: err => {
              console.log('支付失败', err);
              // 跳转到订单详情页
              wx.redirectTo({
                url: `/pages/orderDetail/index?id=${orderId}`
              });
            }
          });
          */
        } else {
          wx.showToast({
            title: res.result.message || '创建订单失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('[云函数] [orders] [create] 调用失败:', err);
        wx.hideLoading();
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
      }
    });
  },

  // 清除购物车中已购买的商品
  clearCartItems: function() {
    const cartItemIds = this.data.orderItems.map(item => item._id);
    
    // 使用云函数清空购物车中已购买的商品
    wx.cloud.callFunction({
      name: 'cart',
      data: {
        action: 'removeMultiple',
        openid: app.globalData.openid,
        ids: cartItemIds
      },
      success: res => {
        console.log('[云函数] [cart] [removeMultiple] 清空购物车成功:', res.result);
        // 更新tabBar购物车数量
        app.getCartCount();
      },
      fail: err => {
        console.error('[云函数] [cart] [removeMultiple] 调用失败:', err);
      }
    });
  },

  // 显示登录提示
  showLoginModal: function() {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      success: res => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/user/index'
          })
        }
      }
    })
  },

  // 页面卸载时清除缓存数据
  onUnload: function() {
    wx.removeStorageSync('checkoutItems')
    wx.removeStorageSync('buyNowItem')
  }
})
