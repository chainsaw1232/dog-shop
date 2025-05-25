// pages/orderList/index.js
const app = getApp();
const util = require('../../utils/util.js'); // 假设 util.js 仍然需要用于日期格式化等

Page({
  data: {
    currentTab: 'all', // 当前选中的标签页：all, unpaid, unshipped, shipped, completed
    orders: [], // 订单列表
    page: 1, // 当前页码
    pageSize: 10, // 每页数量
    hasMore: true, // 是否有更多数据
    isLoading: false, // 是否正在加载
    isProcessingAction: false, // 防止重复操作（如支付、取消）
  },

  onLoad: function(options) {
    if (options.type) {
      this.setData({ currentTab: options.type });
    }
  },

  onShow: function() {
    this.setData({
      page: 1,
      orders: [],
      hasMore: true,
      isProcessingAction: false // 页面显示时重置操作状态
    });
    this.fetchOrders();
  },

  onPullDownRefresh: function() {
    this.setData({
      page: 1,
      orders: [],
      hasMore: true,
      isProcessingAction: false
    });
    this.fetchOrders().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMore();
    }
  },

  switchTab: function(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.currentTab) return;

    this.setData({
      currentTab: type,
      page: 1,
      orders: [],
      hasMore: true
    });
    this.fetchOrders();
  },

  fetchOrders: function() {
    if (!app.globalData.openid) {
      this.showLoginModal();
      return Promise.resolve();
    }

    this.setData({ isLoading: true });

    const params = {
      action: 'list',
      status: this.data.currentTab === 'all' ? undefined : this.data.currentTab, // 'all' 时不传 status 或传特定值
      page: this.data.page,
      pageSize: this.data.pageSize
    };

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'orders', // 你的订单云函数名称
        data: params,
        success: res => {
          console.log('[pages/orderList/index.js] 云函数 orders 调用成功 (list):', res);
          if (res.result && res.result.code === 0 && res.result.data) {
            const newOrders = res.result.data.list || [];

            newOrders.forEach(order => {
              order.totalQuantity = (order.orderItems || []).reduce((sum, product) => sum + product.quantity, 0);
              order.createTimeFormatted = order.createTime ? util.formatTime(new Date(order.createTime), 'YYYY-MM-DD HH:mm') : 'N/A';
              switch (order.status) {
                case 'unpaid': order.statusText = '待付款'; break;
                case 'unshipped': order.statusText = '待发货'; break;
                case 'shipped': order.statusText = '待收货'; break;
                case 'completed': order.statusText = '已完成'; break;
                case 'cancelled': order.statusText = '已取消'; break;
                case 'refunding': order.statusText = '退款中'; break;
                case 'refunded': order.statusText = '已退款'; break;
                default: order.statusText = '未知状态';
              }
            });

            this.setData({
              orders: this.data.page === 1 ? newOrders : this.data.orders.concat(newOrders),
              hasMore: newOrders.length === this.data.pageSize,
              isLoading: false
            });
            resolve(res.result.data);
          } else {
            const errMsg = (res.result && res.result.message) ? res.result.message : '获取订单失败';
            wx.showToast({ title: errMsg, icon: 'none' });
            this.setData({ isLoading: false });
            reject(new Error(errMsg));
          }
        },
        fail: err => {
          console.error('[pages/orderList/index.js] 云函数 orders 调用失败 (list):', err);
          wx.showToast({ title: '网络请求失败', icon: 'none' });
          this.setData({ isLoading: false });
          reject(err);
        }
      });
    });
  },

  loadMore: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 });
      this.fetchOrders();
    }
  },

  navigateToDetail: function(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/orderDetail/index?id=${id}`
    });
  },

  cancelOrder: function(e) {
    if (this.data.isProcessingAction) return;
    const orderId = e.currentTarget.dataset.id;

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
              orderId: orderId
            },
            success: cloudRes => {
              if (cloudRes.result && cloudRes.result.code === 0) {
                wx.showToast({ title: '取消成功', icon: 'success' });
                this.onShow(); // 刷新列表
              } else {
                wx.showToast({ title: (cloudRes.result && cloudRes.result.message) || '取消失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.showToast({ title: '网络请求失败', icon: 'none' });
            },
            complete: () => {
              wx.hideLoading();
              this.setData({ isProcessingAction: false });
            }
          });
        }
      }
    });
  },

  payOrder: function(e) {
    if (this.data.isProcessingAction) return;
    const orderId = e.currentTarget.dataset.id;
    this.setData({ isProcessingAction: true });
    wx.showLoading({ title: '获取支付信息...' });

    wx.cloud.callFunction({
      name: 'orders',
      data: {
        action: 'getPaymentParams', // 假设云函数中有这个 action
        orderId: orderId
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.paymentParams) {
          const payParams = res.result.data.paymentParams;
          wx.requestPayment({
            ...payParams, // timeStamp, nonceStr, package, signType, paySign
            success: () => {
              wx.showToast({ title: '支付成功', icon: 'success' });
              // 支付成功后，可以跳转到支付结果页或刷新当前列表
              // 为了简单，这里直接刷新列表，理想情况是跳转到支付结果页
              // wx.redirectTo({ url: `/pages/payResult/index?orderId=${orderId}&status=success` });
              this.onShow(); // 刷新列表查看状态变化
            },
            fail: err => {
              console.log('支付失败或取消:', err);
              if (err.errMsg !== 'requestPayment:fail cancel') {
                wx.showToast({ title: '支付失败', icon: 'none' });
              }
            },
            complete: () => {
                 this.setData({ isProcessingAction: false }); // 支付流程结束
                 wx.hideLoading();
            }
          });
        } else {
          wx.showToast({ title: (res.result && res.result.message) || '获取支付信息失败', icon: 'none' });
          this.setData({ isProcessingAction: false });
          wx.hideLoading();
        }
      },
      fail: () => {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        this.setData({ isProcessingAction: false });
        wx.hideLoading();
      }
      // complete 不在顶层 callFunction 加，因为 requestPayment 有自己的 complete
    });
  },

  viewLogistics: function(e) {
    const orderId = e.currentTarget.dataset.id;
    // 假设物流信息在订单详情页展示，或者有专门的物流页
    // wx.navigateTo({ url: `/pages/logistics/index?orderId=${orderId}` });
    wx.showToast({ title: '物流功能暂未实现', icon: 'none' });
  },

  confirmReceive: function(e) {
    if (this.data.isProcessingAction) return;
    const orderId = e.currentTarget.dataset.id;

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
              orderId: orderId
            },
            success: cloudRes => {
              if (cloudRes.result && cloudRes.result.code === 0) {
                wx.showToast({ title: '确认成功', icon: 'success' });
                this.onShow(); // 刷新列表
              } else {
                wx.showToast({ title: (cloudRes.result && cloudRes.result.message) || '确认失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.showToast({ title: '网络请求失败', icon: 'none' });
            },
            complete: () => {
              wx.hideLoading();
              this.setData({ isProcessingAction: false });
            }
          });
        }
      }
    });
  },

  buyAgain: function(e) {
    const orderId = e.currentTarget.dataset.id;
    // “再次购买”逻辑：获取订单详情，将其中的商品逐个添加到购物车
    // 这个逻辑比较复杂，暂时简化或提示用户手动操作
    wx.showLoading({ title: '处理中...' });
    wx.cloud.callFunction({
        name: 'orders',
        data: { action: 'detail', orderId: orderId }
    }).then(res => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.orderItems) {
            const items = res.result.data.orderItems;
            if (items.length === 0) {
                wx.showToast({ title: '订单中没有商品', icon: 'none' });
                wx.hideLoading();
                return;
            }
            // 逐个添加到购物车
            const addToCartPromises = items.map(item => {
                return wx.cloud.callFunction({
                    name: 'cart',
                    data: {
                        action: 'add',
                        productId: item.productId,
                        quantity: item.quantity,
                        specId: item.specId || '' // 如果有规格
                    }
                });
            });
            Promise.all(addToCartPromises).then(results => {
                wx.hideLoading();
                let allSuccess = true;
                results.forEach(r => {
                    if (!r.result || r.result.code !== 0) {
                        allSuccess = false;
                    }
                });
                if (allSuccess) {
                    wx.showToast({ title: '商品已再次加入购物车', icon: 'success' });
                    app.getCartCount(); // 更新购物车角标
                    wx.switchTab({ url: '/pages/cart/index' });
                } else {
                    wx.showToast({ title: '部分商品添加失败', icon: 'none' });
                }
            }).catch(() => {
                wx.hideLoading();
                wx.showToast({ title: '再次购买失败', icon: 'none' });
            });
        } else {
            wx.hideLoading();
            wx.showToast({ title: '获取订单信息失败', icon: 'none' });
        }
    }).catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  writeReview: function(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/review/index?orderId=${orderId}`
    });
  },

  contactService: function() {
    wx.makePhoneCall({
      phoneNumber: 'YOUR_SERVICE_PHONE_NUMBER' // 替换为你的客服电话
    });
  },

  navigateToShop: function() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  showLoginModal: function() {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      success: res => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/user/index'
          });
        }
      }
    });
  }
});
