// pages/coupon/index.js
const app = getApp();

Page({
  data: {
    currentTab: 'available', // 当前选中的标签页：available, used, expired
    coupons: [], // 优惠券列表
    page: 1, // 当前页码
    pageSize: 10, // 每页数量
    hasMore: true, // 是否有更多数据
    isLoading: false // 是否正在加载
  },

  onLoad: function(options) {
    // 如果有传入类型参数，则切换到对应标签页
    if (options.type) {
      this.setData({ currentTab: options.type });
    }
  },

  onShow: function() {
    // 重置页码并重新加载数据
    this.setData({
      page: 1,
      coupons: [],
      hasMore: true
    });
    this.fetchCoupons();
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    // 重置页码并重新加载数据
    this.setData({
      page: 1,
      coupons: [],
      hasMore: true
    });
    this.fetchCoupons().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMore();
    }
  },

  // 切换标签页
  switchTab: function(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.currentTab) return;

    this.setData({
      currentTab: type,
      page: 1,
      coupons: [],
      hasMore: true
    });

    this.fetchCoupons();
  },

  // 获取优惠券列表
  fetchCoupons: function() {
    if (!app.globalData.openid) {
      this.showLoginModal();
      return Promise.resolve(); // 返回一个 resolved Promise 以便链式调用 .then() 不报错
    }

    this.setData({ isLoading: true });

    // 构建传递给云函数的参数
    const params = {
      action: 'list', // 告诉云函数要执行的是 "list" 操作
      status: this.data.currentTab,
      page: this.data.page,
      pageSize: this.data.pageSize
      // openid 会自动通过云函数上下文传递
    };

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'coupon', // 你的优惠券云函数名称
        data: params,
        success: res => {
          console.log('[pages/coupon/index.js] 云函数 coupon 调用成功:', res);
          if (res.result && res.result.code === 0 && res.result.data) {
            const newCoupons = res.result.data.list || [];
            // 可以在这里对 newCoupons 的日期等进行格式化
            newCoupons.forEach(coupon => {
              if (coupon.startTime) {
                coupon.startTimeFormatted = new Date(coupon.startTime).toLocaleDateString();
              }
              if (coupon.endTime) {
                coupon.endTimeFormatted = new Date(coupon.endTime).toLocaleDateString();
              }
            });

            this.setData({
              coupons: this.data.page === 1 ? newCoupons : this.data.coupons.concat(newCoupons),
              hasMore: newCoupons.length === this.data.pageSize,
              isLoading: false // 确保在成功时也设置 isLoading 为 false
            });
            resolve(res.result.data);
          } else {
            const errMsg = (res.result && res.result.message) ? res.result.message : '获取优惠券失败';
            wx.showToast({
              title: errMsg,
              icon: 'none'
            });
            this.setData({ isLoading: false }); // 确保在失败时也设置 isLoading 为 false
            reject(new Error(errMsg));
          }
        },
        fail: err => {
          console.error('[pages/coupon/index.js] 云函数 coupon 调用失败:', err);
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          });
          this.setData({ isLoading: false }); // 确保在网络失败时也设置 isLoading 为 false
          reject(err);
        }
        // complete 回调不是必须的，因为 success 和 fail 都会执行
        // complete: () => {
        //   this.setData({ isLoading: false });
        // }
      });
    });
  },

  // 加载更多
  loadMore: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({
        page: this.data.page + 1
      });
      this.fetchCoupons();
    }
  },

  // 使用优惠券
  useCoupon: function(e) {
    // const id = e.currentTarget.dataset.id; // 获取优惠券的 _id
    const coupon = e.currentTarget.dataset.coupon; // 直接获取整个 coupon 对象

    if (!coupon) {
        wx.showToast({ title: '优惠券信息错误', icon: 'none' });
        return;
    }

    // 如果是从订单确认页面跳转过来选择优惠券
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];

    if (prevPage && prevPage.route === 'pages/orderConfirm/index') {
      // 检查优惠券是否可用 (例如，是否已过期，是否满足最小金额 - 虽然理论上列表里应该是可用的)
      if (coupon.status !== 'available' || (coupon.endTime && new Date(coupon.endTime) < new Date())) {
          wx.showToast({ title: '该优惠券已不可用', icon: 'none' });
          return;
      }
      
      // 将选中的优惠券传回上一页
      // 确保 prevPage 有 selectCoupon 方法
      if (typeof prevPage.selectCouponCallback === 'function') { // 假设上一页的方法名叫 selectCouponCallback
        prevPage.selectCouponCallback(coupon); // 将整个 coupon 对象传递回去
        wx.navigateBack();
      } else {
        console.warn('上一页没有 selectCouponCallback 方法');
        // 如果没有回调，可以尝试直接跳转到首页或提示用户
        wx.switchTab({ url: '/pages/index/index' });
      }
    } else {
      // 普通查看，跳转到首页去使用
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  },

  // 跳转到商城首页
  navigateToShop: function() {
    wx.switchTab({
      url: '/pages/index/index'
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
          });
        }
      }
    });
  }
});
