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
    isProcessingAction: false, // 防止重复点击按钮
  },

  onLoad: function(options) {
    if (options.id) {
      this.setData({ 
        id: options.id,
        isLoading: true, // 开始加载时设置
        orderDetail: null // 清空旧数据，避免显示残留
      });
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

  onShow: function() {
    // 如果是从支付结果页返回，或者其他可能更新了订单状态的场景，可以考虑刷新
    // 但通常支付后会直接跳转到支付结果页，再返回详情页时 onLoad 会重新拉取
    // 如果是从列表页进入，onLoad已拉取。
    // 为确保状态最新，可以每次 onShow 都刷新，但要注意性能和用户体验
    if (this.data.id && !this.data.isLoading) { // 仅当已有订单ID且非首次加载时
        console.log('[OrderDetail onShow] Re-fetching order detail for potentially updated status.');
        this.fetchOrderDetail();
    }
  },

  fetchOrderDetail: function() {
    if (!this.data.id) {
        console.error('[OrderDetail] fetchOrderDetail called without order ID.');
        this.setData({ isLoading: false, orderDetail: null });
        return;
    }
    if (!app.globalData.openid) {
      // 理想情况下，应有全局登录检查，此处仅作防御
      wx.showToast({ title: '用户登录状态异常', icon: 'none' });
      this.setData({ isLoading: false });
      return;
    }
    this.setData({ isLoading: true }); // 开始加载时设置
    // wx.showLoading({ title: '加载中...' }); // 可以用页面自身的isLoading状态

    wx.cloud.callFunction({
      name: 'orders',
      data: {
        action: 'detail',
        orderId: this.data.id
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data) {
          let orderDetail = res.result.data;

          console.log('Fetched Order Detail (Raw from Cloud):', JSON.stringify(orderDetail, null, 2));

          // 金额和价格格式化
          orderDetail.productAmountFormatted = (typeof orderDetail.productAmount === 'number' ? orderDetail.productAmount.toFixed(2) : '0.00');
          orderDetail.shippingFeeFormatted = (typeof orderDetail.shippingFee === 'number' ? orderDetail.shippingFee.toFixed(2) : '0.00');
          orderDetail.couponAmountFormatted = (typeof orderDetail.couponAmount === 'number' ? orderDetail.couponAmount.toFixed(2) : '0.00');
          orderDetail.totalAmountFormatted = (typeof orderDetail.totalAmount === 'number' ? orderDetail.totalAmount.toFixed(2) : '0.00');

          if (orderDetail.orderItems && Array.isArray(orderDetail.orderItems)) {
            orderDetail.orderItems = orderDetail.orderItems.map(item => ({
              ...item,
              priceFormatted: (typeof item.price === 'number' ? item.price.toFixed(2) : '0.00')
            }));
          }

          // 时间格式化
          const timeFields = ['createTime', 'payTime', 'shipTime', 'completeTime', 'cancelTime'];
          timeFields.forEach(field => {
            if (orderDetail[field]) {
              orderDetail[`${field}Formatted`] = util.formatTime(new Date(orderDetail[field]), 'YYYY-MM-DD HH:mm:ss');
            }
          });
          
          let statusIcon = orderDetail.statusIconPath || 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unknown.png'; // 默认未知图标
          let statusDesc = '订单状态详情';
          let statusText = '未知状态';

          // 状态文本和图标映射 (可以提取为公共配置或在云函数中处理)
          const statusConfig = {
            unpaid: { text: '待付款', icon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unpaid.png', desc: '请在24小时内完成支付，超时订单将自动取消' },
            unshipped: { text: '待发货', icon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_unshipped.png', desc: '商家正在加紧备货中，请耐心等待' },
            shipped: { text: '待收货', icon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_shipped.png', desc: '商品已发出，请注意查收物流信息' },
            completed: { text: '已完成', icon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_completed.png', desc: '订单已交易成功，感谢您的购买！' },
            cancelled: { text: '已取消', icon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/status_cancelled.png', desc: '订单已取消' }
            // 可以添加退款中、已退款等状态
          };

          if (statusConfig[orderDetail.status]) {
            statusText = statusConfig[orderDetail.status].text;
            statusIcon = statusConfig[orderDetail.status].icon; // 优先使用配置的图标
            statusDesc = statusConfig[orderDetail.status].desc;
          }
          orderDetail.statusText = statusText;
          
          console.log('Processed Order Detail (For WXML):', JSON.stringify(orderDetail, null, 2));

          this.setData({ orderDetail, statusIcon, statusDesc, isLoading: false });
        } else {
          wx.showToast({
            title: (res.result && res.result.message) || '获取订单详情失败',
            icon: 'none'
          });
          this.setData({ isLoading: false, orderDetail: null });
        }
      },
      fail: (err) => {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        console.error("获取订单详情云函数调用失败:", err);
        this.setData({ isLoading: false, orderDetail: null });
      },
      complete: () => {
        // wx.hideLoading();
      }
    });
  },

  copyOrderNumber: function() {
    if (this.data.orderDetail && this.data.orderDetail.orderNo) {
      wx.setClipboardData({
        data: this.data.orderDetail.orderNo,
        success: () => {
          wx.showToast({ title: '订单号已复制', icon: 'success' });
        }
      });
    }
  },

  navigateToProduct: function(e) {
    const productId = e.currentTarget.dataset.id;
    if (productId) {
      wx.navigateTo({
        url: `/pages/detail/index?id=${productId}`
      });
    }
  },

  goBackToOrderList: function() {
    // 尝试返回，如果无法返回（例如直接打开的详情页），则跳转到订单列表
    if (getCurrentPages().length > 1) {
        wx.navigateBack({ delta: 1 });
    } else {
        wx.redirectTo({ url: '/pages/orderList/index' });
    }
  },

  payOrder: function() {
    if (this.data.isProcessingAction || !this.data.orderDetail || this.data.orderDetail.status !== 'unpaid') {
      if (this.data.orderDetail && this.data.orderDetail.status !== 'unpaid') {
        wx.showToast({ title: '订单状态已更新', icon: 'none' });
      }
      return;
    }
    this.setData({ isProcessingAction: true });
    wx.showLoading({ title: '获取支付参数...' });

    wx.cloud.callFunction({
      name: 'orders',
      data: {
        action: 'getPaymentParams',
        orderId: this.data.id
      },
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.paymentParams) {
          const payParams = res.result.data.paymentParams;
          console.log('[OrderDetail] Requesting payment with params:', payParams);
          wx.requestPayment({
            ...payParams, // timeStamp, nonceStr, package, signType, paySign
            success: (paySuccessRes) => {
              console.log('微信支付成功回调:', paySuccessRes);
              wx.showLoading({ title: '更新订单状态...' });

              wx.cloud.callFunction({
                name: 'orders',
                data: {
                  action: 'markOrderAsPaid',
                  orderId: this.data.id,
                  // transaction_id: '来自微信的真实支付单号', // 如果能获取到并希望记录
                }
              }).then(updateRes => {
                wx.hideLoading();
                if (updateRes.result && updateRes.result.code === 0) {
                  wx.showToast({ title: '支付成功!', icon: 'success', duration: 1500 });
                } else {
                  wx.showToast({ title: '支付成功，状态更新可能稍有延迟', icon: 'none', duration: 2500 });
                }
                this.fetchOrderDetail(); // 刷新订单详情
              }).catch(updateErr => {
                wx.hideLoading();
                wx.showToast({ title: '支付成功，但状态更新请求失败', icon: 'none', duration: 2500 });
                console.error('调用 markOrderAsPaid 失败:', updateErr);
                this.fetchOrderDetail();
              }).finally(() => {
                 this.setData({ isProcessingAction: false });
              });
            },
            fail: err => {
              this.setData({ isProcessingAction: false });
              console.log('支付失败或取消:', err);
              if (err.errMsg !== 'requestPayment:fail cancel') {
                util.showError('支付失败，请稍后重试');
              }
            }
          });
        } else {
          this.setData({ isProcessingAction: false });
          util.showError((res.result && res.result.message) || '获取支付参数失败');
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ isProcessingAction: false });
        util.showError('获取支付参数网络请求失败');
        console.error("调用getPaymentParams云函数失败:", err);
      }
    });
  },

  cancelOrder: function() {
    if (this.data.isProcessingAction || !this.data.orderDetail || this.data.orderDetail.status !== 'unpaid') return;
    
    wx.showModal({
      title: '提示',
      content: '确定要取消该订单吗？操作后无法恢复。',
      success: resModal => {
        if (resModal.confirm) {
          this.setData({ isProcessingAction: true });
          wx.showLoading({ title: '正在取消...' });
          wx.cloud.callFunction({
            name: 'orders',
            data: { action: 'cancel', orderId: this.data.id }
          }).then(res => {
            if (res.result && res.result.code === 0) {
              wx.showToast({ title: '订单已取消', icon: 'success' });
              this.fetchOrderDetail();
            } else {
              util.showError((res.result && res.result.message) || '取消失败');
            }
          }).catch(err => {
            util.showError('取消订单请求失败');
            console.error("调用cancelOrder云函数失败:", err);
          }).finally(() => {
            wx.hideLoading();
            this.setData({ isProcessingAction: false });
          });
        }
      }
    });
  },

  confirmReceive: function() {
    if (this.data.isProcessingAction || !this.data.orderDetail || this.data.orderDetail.status !== 'shipped') return;

    wx.showModal({
      title: '确认收货',
      content: '请确保您已收到商品并核对无误。确认收货后订单将完成。',
      success: resModal => {
        if (resModal.confirm) {
          this.setData({ isProcessingAction: true });
          wx.showLoading({ title: '正在确认...' });
          wx.cloud.callFunction({
            name: 'orders',
            data: { action: 'confirmReceive', orderId: this.data.id }
          }).then(res => {
            if (res.result && res.result.code === 0) {
              wx.showToast({ title: '确认收货成功', icon: 'success' });
              this.fetchOrderDetail();
            } else {
              util.showError((res.result && res.result.message) || '确认失败');
            }
          }).catch(err => {
            util.showError('确认收货请求失败');
            console.error("调用confirmReceive云函数失败:", err);
          }).finally(() => {
            wx.hideLoading();
            this.setData({ isProcessingAction: false });
          });
        }
      }
    });
  },
  
  buyAgain: function() {
    if (this.data.isProcessingAction || !this.data.orderDetail || !this.data.orderDetail.orderItems || this.data.orderDetail.orderItems.length === 0) {
      util.showError("订单中没有商品可以再次购买");
      return;
    }
    this.setData({ isProcessingAction: true });
    wx.showLoading({ title: '正在加入购物车...' });

    const items = this.data.orderDetail.orderItems;
    const addToCartPromises = items.map(item => {
      return wx.cloud.callFunction({
        name: 'cart', // 确保这是您的购物车云函数名
        data: {
          action: 'add',
          productId: item.productId,
          quantity: item.quantity,
          specId: item.specId || '' // 如果有规格信息
        }
      });
    });

    Promise.all(addToCartPromises)
      .then(results => {
        let allSuccess = true;
        let someFailed = false;
        results.forEach((r, index) => {
          if (!r.result || r.result.code !== 0) {
            allSuccess = false;
            someFailed = true;
            console.warn(`商品 "${items[index].productName}" 加入购物车失败:`, r.result ? r.result.message : "未知错误");
          }
        });
        if (allSuccess) {
          wx.showToast({ title: '商品已全部加入购物车', icon: 'success', duration: 2000 });
          if (typeof app.getCartCount === 'function') app.getCartCount();
          setTimeout(() => { wx.switchTab({ url: '/pages/cart/index' }); }, 1500);
        } else if (someFailed) {
          util.showError('部分商品添加失败，请检查购物车');
           if (typeof app.getCartCount === 'function') app.getCartCount();
        } else { // Should not happen if someFailed is true
          util.showError('再次购买操作完成');
        }
      })
      .catch((err) => {
        util.showError('再次购买操作失败，请稍后重试');
        console.error("再次购买，Promise.all调用失败:", err);
      }).finally(() => {
        wx.hideLoading();
        this.setData({ isProcessingAction: false });
      });
  },

  writeReview: function() {
    if (!this.data.orderDetail) return;
    if (this.data.orderDetail.hasReviewed) {
        util.showError("该订单已经评价过啦");
        return;
    }
    if (this.data.orderDetail.status === 'completed' || this.data.orderDetail.status === 'toEvaluate') {
        wx.navigateTo({
            url: `/pages/review/index?orderId=${this.data.id}`
        });
    } else {
        util.showError("当前订单状态无法评价");
    }
  },

  viewLogistics: function() {
    // 实际项目中，这里会跳转到物流详情页，并传递物流公司和单号
    // wx.navigateTo({ url: `/pages/logistics/index?orderId=${this.data.id}` });
    if (this.data.orderDetail && this.data.orderDetail.logisticsInfo && this.data.orderDetail.logisticsInfo.number) {
        wx.showModal({
            title: '物流信息（模拟）',
            content: `公司: ${this.data.orderDetail.logisticsInfo.company || '暂无'} \n单号: ${this.data.orderDetail.logisticsInfo.number}`,
            showCancel: false
        });
    } else {
        util.showError('暂无物流信息');
    }
  },

  contactService: function() {
    // 确保您已在小程序后台配置客服电话，或在此处硬编码
    const servicePhone = app.globalData.servicePhone || '15051884137'; // 示例电话
    if (servicePhone) {
      wx.makePhoneCall({ phoneNumber: servicePhone });
    } else {
      util.showError('15051884137');
    }
  }
});