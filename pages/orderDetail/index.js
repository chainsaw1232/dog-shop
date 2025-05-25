// pages/orderDetail/index.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    id: '', // 订单ID
    orderDetail: null, // 订单详情
    statusIcon: '', // 状态图标
    statusDesc: '', // 状态描述
    isLoading: true,
    isProcessingAction: false,
  },

  onLoad: function(options) {
    if (options.id) {
      this.setData({ id: options.id });
      this.fetchOrderDetail();
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  fetchOrderDetail: function() {
    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }
    this.setData({ isLoading: true });
    wx.showLoading({ title: '加载中...' });

    wx.cloud.callFunction({
      name: 'orders', // Your order cloud function name
      data: {
        action: 'detail',
        orderId: this.data.id
        // openid is passed via context
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const orderDetail = res.result.data;

          // Format times
          if (orderDetail.createTime) {
            orderDetail.createTimeFormatted = util.formatTime(new Date(orderDetail.createTime), 'YYYY-MM-DD HH:mm:ss');
          }
          if (orderDetail.payTime) {
            orderDetail.payTimeFormatted = util.formatTime(new Date(orderDetail.payTime), 'YYYY-MM-DD HH:mm:ss');
          }
          if (orderDetail.shipTime) {
            orderDetail.shipTimeFormatted = util.formatTime(new Date(orderDetail.shipTime), 'YYYY-MM-DD HH:mm:ss');
          }
          if (orderDetail.completeTime) {
            orderDetail.completeTimeFormatted = util.formatTime(new Date(orderDetail.completeTime), 'YYYY-MM-DD HH:mm:ss');
          }
           if (orderDetail.cancelTime) {
            orderDetail.cancelTimeFormatted = util.formatTime(new Date(orderDetail.cancelTime), 'YYYY-MM-DD HH:mm:ss');
          }


          let statusIcon = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unknown.png'; // Default icon
          let statusDesc = '订单状态未知';
          let statusText = '未知状态';

          switch (orderDetail.status) {
            case 'unpaid':
              statusText = '待付款';
              statusIcon = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unpaid.png';
              statusDesc = '请在24小时内完成支付，超时订单将自动取消';
              break;
            case 'unshipped':
              statusText = '待发货';
              statusIcon = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unshipped.png';
              statusDesc = '商家正在处理您的订单，请耐心等待';
              break;
            case 'shipped':
              statusText = '待收货';
              statusIcon = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_shipped.png';
              statusDesc = '商品已发出，请注意查收';
              break;
            case 'completed':
              statusText = '已完成';
              statusIcon = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_completed.png';
              statusDesc = '订单已完成，感谢您的购买';
              break;
            case 'cancelled':
              statusText = '已取消';
              statusIcon = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_cancelled.png';
              statusDesc = '订单已取消';
              break;
            // Add cases for refunding, refunded if your system supports them
          }
          orderDetail.statusText = statusText;

          this.setData({ orderDetail, statusIcon, statusDesc, isLoading: false });
        } else {
          wx.showToast({
            title: (res.result && res.result.message) || '获取订单失败',
            icon: 'none'
          });
          this.setData({ isLoading: false });
          // setTimeout(() => { wx.navigateBack(); }, 1500);
        }
      },
      fail: () => {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        this.setData({ isLoading: false });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  copyOrderNumber: function() {
    if (this.data.orderDetail && this.data.orderDetail.orderNo) {
      wx.setClipboardData({
        data: this.data.orderDetail.orderNo,
        success: () => {
          wx.showToast({ title: '复制成功', icon: 'success' });
        }
      });
    }
  },

  cancelOrder: function() {
    if (this.data.isProcessingAction) return;
    wx.showModal({
      title: '提示',
      content: '确定要取消该订单吗？',
      success: res => {
        if (res.confirm) {
          this.setData({ isProcessingAction: true });
          wx.showLoading({ title: '处理中...' });
          wx.cloud.callFunction({
            name: 'orders',
            data: {
              action: 'cancel',
              orderId: this.data.id
            },
            success: cloudRes => {
              if (cloudRes.result && cloudRes.result.code === 0) {
                wx.showToast({ title: '取消成功', icon: 'success' });
                this.fetchOrderDetail(); // Refresh detail
              } else {
                util.showError((cloudRes.result && cloudRes.result.message) || '取消失败');
              }
            },
            fail: () => { util.showError('网络请求失败'); },
            complete: () => {
              wx.hideLoading();
              this.setData({ isProcessingAction: false });
            }
          });
        }
      }
    });
  },

  payOrder: function() {
    if (this.data.isProcessingAction) return;
    this.setData({ isProcessingAction: true });
    wx.showLoading({ title: '获取支付信息...' });

    wx.cloud.callFunction({
      name: 'orders',
      data: {
        action: 'getPaymentParams',
        orderId: this.data.id
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.paymentParams) {
          const payParams = res.result.data.paymentParams;
          wx.requestPayment({
            ...payParams,
            success: () => {
              wx.showToast({ title: '支付成功', icon: 'success' });
              // wx.redirectTo({ url: `/pages/payResult/index?orderId=${this.data.id}&status=success` });
              this.fetchOrderDetail(); // Refresh to show new status
            },
            fail: err => {
              console.log('支付失败或取消:', err);
              if (err.errMsg !== 'requestPayment:fail cancel') {
                util.showError('支付失败');
              }
            },
            complete: () => {
              this.setData({ isProcessingAction: false });
              wx.hideLoading(); // Hide loading from getPaymentParams
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

  viewLogistics: function() {
    // wx.navigateTo({ url: `/pages/logistics/index?id=${this.data.id}` });
    util.showError('物流功能暂未实现');
  },

  confirmReceive: function() {
    if (this.data.isProcessingAction) return;
    wx.showModal({
      title: '提示',
      content: '确认已收到商品吗？',
      success: res => {
        if (res.confirm) {
          this.setData({ isProcessingAction: true });
          wx.showLoading({ title: '处理中...' });
          wx.cloud.callFunction({
            name: 'orders',
            data: {
              action: 'confirmReceive',
              orderId: this.data.id
            },
            success: cloudRes => {
              if (cloudRes.result && cloudRes.result.code === 0) {
                wx.showToast({ title: '确认成功', icon: 'success' });
                this.fetchOrderDetail(); // Refresh detail
              } else {
                util.showError((cloudRes.result && cloudRes.result.message) || '确认失败');
              }
            },
            fail: () => { util.showError('网络请求失败'); },
            complete: () => {
              wx.hideLoading();
              this.setData({ isProcessingAction: false });
            }
          });
        }
      }
    });
  },

  buyAgain: function() {
    if (!this.data.orderDetail || !this.data.orderDetail.orderItems || this.data.orderDetail.orderItems.length === 0) {
      util.showError("订单中没有商品可以再次购买");
      return;
    }
    if (this.data.isProcessingAction) return;
    this.setData({ isProcessingAction: true });
    wx.showLoading({ title: '处理中...' });

    const items = this.data.orderDetail.orderItems;
    const addToCartPromises = items.map(item => {
      return wx.cloud.callFunction({
        name: 'cart',
        data: {
          action: 'add',
          productId: item.productId,
          quantity: item.quantity,
          specId: item.specId || '' // Ensure specId is handled
        }
      });
    });

    Promise.all(addToCartPromises)
      .then(results => {
        wx.hideLoading();
        let allSuccess = true;
        results.forEach(r => {
          if (!r.result || r.result.code !== 0) {
            allSuccess = false;
            console.warn("部分商品加入购物车失败:", r.result ? r.result.message : "未知错误", "对应商品:", items[results.indexOf(r)].productName);
          }
        });
        if (allSuccess) {
          wx.showToast({ title: '商品已再次加入购物车', icon: 'success' });
          app.getCartCount();
          wx.switchTab({ url: '/pages/cart/index' });
        } else {
          util.showError('部分商品添加失败，请稍后重试');
        }
      })
      .catch((err) => {
        wx.hideLoading();
        util.showError('再次购买失败，请检查网络');
        console.error("再次购买，Promise.all失败:", err);
      }).finally(()=>{
        this.setData({ isProcessingAction: false });
      });
  },

  writeReview: function() {
    if (this.data.orderDetail && this.data.orderDetail.hasReviewed) {
        util.showError("该订单已评价过啦");
        return;
    }
    if (this.data.orderDetail && (this.data.orderDetail.status === 'completed' || this.data.orderDetail.status === 'toEvaluate')) { // 假设 'toEvaluate' 也是可评价状态
        wx.navigateTo({
            url: `/pages/review/index?orderId=${this.data.id}`
        });
    } else {
        util.showError("当前订单状态无法评价");
    }
  },

  contactService: function() {
    wx.makePhoneCall({
      phoneNumber: '15051884139' // 从 about 页面获取或配置
    });
  },

  navigateToProduct: function(e) {
    const productId = e.currentTarget.dataset.id;
    if (productId) {
      wx.navigateTo({
        url: `/pages/detail/index?id=${productId}`
      });
    }
  },

  showLoginModal: function() {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      success: res => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/user/index' });
        } else {
          wx.navigateBack();
        }
      }
    });
  }
});
