// pages/payResult/index.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    orderId: '',
    status: 'success', // 'success' or 'fail'
    orderDetail: null, // For displaying order number and amount
    recommendProducts: [],
    isLoading: true,
    isProcessingAction: false,
  },

  onLoad: function(options) {
    if (options.orderId) {
      this.setData({
        orderId: options.orderId,
        status: options.status || 'success', // Default to success if status not provided
        isLoading: true
      });
      this.fetchOrderSummary(); // Fetch minimal details for result page
      this.fetchRecommendProducts();
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1500);
    }
  },

  // Fetch only necessary summary like orderNo and totalAmount
  fetchOrderSummary: function() {
    if (!app.globalData.openid) {
      // If not logged in, can't fetch. But usually, user is logged in to reach here.
      this.setData({ isLoading: false });
      return;
    }
    wx.cloud.callFunction({
      name: 'orders',
      data: {
        action: 'getSummary', // A new action in 'orders' cloud function
        orderId: this.data.orderId
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data) {
          this.setData({ orderDetail: res.result.data, isLoading: false });
        } else {
          util.showError((res.result && res.result.message) || '获取订单信息失败');
          this.setData({ isLoading: false });
        }
      },
      fail: () => {
        util.showError('网络请求失败');
        this.setData({ isLoading: false });
      }
    });
  },

  fetchRecommendProducts: function() {
    // Using getProducts with isHot as a stand-in for recommendations
    wx.cloud.callFunction({
      name: 'getProducts',
      data: {
        action: 'list',
        isHot: true, // Or isRecommend: true if your cloud function supports it
        page: 1,
        pageSize: 4
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.list) {
          this.setData({ recommendProducts: res.result.data.list });
        }
      },
      fail: err => {
        console.error("获取推荐商品失败:", err);
      }
    });
  },

  viewOrder: function() {
    wx.redirectTo({ // Use redirectTo to avoid too many pages in stack if coming from order confirm
      url: `/pages/orderDetail/index?id=${this.data.orderId}`
    });
  },

  backToHome: function() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // "返回订单" might be confusing if already on a result page. "查看订单" is better.
  // backToOrder: function() {
  //   wx.redirectTo({
  //     url: `/pages/orderDetail/index?id=${this.data.orderId}`
  //   });
  // },

  retryPay: function() {
    if (this.data.isProcessingAction) return;
    this.setData({ isProcessingAction: true });
    wx.showLoading({ title: '获取支付信息...' });

    wx.cloud.callFunction({
      name: 'orders',
      data: {
        action: 'getPaymentParams',
        orderId: this.data.orderId
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.paymentParams) {
          const payParams = res.result.data.paymentParams;
          wx.requestPayment({
            ...payParams,
            success: () => {
              wx.showToast({ title: '支付成功', icon: 'success' });
              this.setData({ status: 'success' }); // Update status on page
              this.fetchOrderSummary(); // Refresh summary
            },
            fail: err => {
              console.log('支付失败或取消:', err);
              if (err.errMsg !== 'requestPayment:fail cancel') {
                util.showError('支付失败');
              }
            },
            complete: () => {
              this.setData({ isProcessingAction: false });
              wx.hideLoading();
            }
          });
        } else {
          util.showError((res.result && res.result.message) || '获取支付信息失败');
          this.setData({ isProcessingAction: false });
          wx.hideLoading();
        }
      },
      fail: () => {
        util.showError('网络请求失败');
        this.setData({ isProcessingAction: false });
        wx.hideLoading();
      }
    });
  },

  navigateToDetail: function(e) {
    const productId = e.currentTarget.dataset.id;
    if (productId) {
      wx.navigateTo({
        url: `/pages/detail/index?id=${productId}`
      });
    }
  }
});
