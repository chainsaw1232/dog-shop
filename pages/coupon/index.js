// pages/coupon/index.js
const app = getApp();
const util = require('../../utils/util.js'); // 引入 util.js

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
            
            newCoupons.forEach(coupon => {
              if (coupon.startTime) {
                // 使用 util.formatTime 来格式化日期
                coupon.startTimeFormatted = util.formatTime(new Date(coupon.startTime), 'YYYY.MM.DD');
              }
              if (coupon.endTime) {
                coupon.endTimeFormatted = util.formatTime(new Date(coupon.endTime), 'YYYY.MM.DD');
              }

              // **修改点：优先使用 description 字段作为显示信息**
              // 如果 WXML 中是直接使用 coupon.scope 来显示那一行信息，
              // 这里的修改会将 coupon.scope 的值替换为 coupon.description (如果存在)
              // 或者一个更友好的 scope 文本。
              if (coupon.description && typeof coupon.description === 'string' && coupon.description.trim() !== '') {
                coupon.displayInfo = coupon.description;
              } else if (coupon.scope === 'all') {
                coupon.displayInfo = '全场通用';
              } else if (coupon.scope === 'category_ids' && coupon.scopeDetails && coupon.scopeDetails.length > 0) {
                coupon.displayInfo = '指定分类可用'; // 可以进一步处理显示分类名称
              } else if (coupon.scope === 'product_ids' && coupon.scopeDetails && coupon.scopeDetails.length > 0) {
                coupon.displayInfo = '指定商品可用'; // 可以进一步处理显示商品名称
              } else {
                coupon.displayInfo = '具体使用范围见详情'; // 默认的适用范围文本
              }
            });

            this.setData({
              coupons: this.data.page === 1 ? newCoupons : this.data.coupons.concat(newCoupons),
              hasMore: newCoupons.length === this.data.pageSize,
              isLoading: false
            });
            resolve(res.result.data);
          } else {
            const errMsg = (res.result && res.result.message) ? res.result.message : '获取优惠券失败';
            wx.showToast({
              title: errMsg,
              icon: 'none'
            });
            this.setData({ isLoading: false });
            reject(new Error(errMsg));
          }
        },
        fail: err => {
          console.error('[pages/coupon/index.js] 云函数 coupon 调用失败:', err);
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          });
          this.setData({ isLoading: false });
          reject(err);
        },
        complete: () => {
          // isLoading 已经在 success 和 fail 中处理了
        }
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
    const coupon = e.currentTarget.dataset.coupon; 

    if (!coupon) {
        wx.showToast({ title: '优惠券信息错误', icon: 'none' });
        return;
    }

    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];

    if (prevPage && prevPage.route === 'pages/orderConfirm/index') {
      if (coupon.status !== 'available' || (coupon.endTime && new Date(coupon.endTime) < new Date())) {
          wx.showToast({ title: '该优惠券已不可用', icon: 'none' });
          return;
      }
      
      if (typeof prevPage.selectCouponCallback === 'function') { 
        prevPage.selectCouponCallback(coupon); 
        wx.navigateBack();
      } else {
        console.warn('上一页没有 selectCouponCallback 方法');
        wx.switchTab({ url: '/pages/index/index' });
      }
    } else {
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
