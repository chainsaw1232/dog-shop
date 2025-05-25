// pages/user/index.js
const app = getApp();

Page({
  data: {
    userInfo: { // 默认用户信息
      nickName: '汪汪用户',
      avatarUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png'
    },
    isLoggedIn: false,
    isLoadingLoginStatus: true,

    orderCount: {
      unpaid: 0,
      unshipped: 0,
      shipped: 0,
      completed: 0,
      afterSale: 0
    },
    recommendProducts: [
      {
        id: "prod_001",
        name: '优质牛肉干 100g',
        price: 29.9,
        originalPrice: 39.9,
        imageUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/products/product_01.png',
        sales: 1500
      },
      {
        id: "prod_002",
        name: '天然骨形饼干 200g',
        price: 19.9,
        originalPrice: 25.9,
        imageUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/products/product_02.png',
        sales: 1200
      },
    ],
    menuIcons: {
      address: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/收货地址.png',
      coupon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/优惠卷.png',
      favorite: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/我的收藏.png',
      contactService: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/客服.png',
      aboutUs: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/关于我们.png'
    },
    orderStateIcons: {
      unpaid: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/待付款.png',
      unshipped: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/待发货.png',
      shipped: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/待收货.png',
      completed: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/已完成.png',
      afterSale: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/售后.png'
    }
  },

  onLoad: function() {
    this.setData({ isLoadingLoginStatus: true });
    app.listenLoginStatusUpdate(this, (isLoggedIn, userInfo) => {
      console.log('UserPage: Received login status update from app.js - isLoggedIn:', isLoggedIn, 'userInfo:', userInfo);
      this.setData({
        isLoggedIn: isLoggedIn,
        userInfo: isLoggedIn && userInfo ? userInfo : this.data.userInfo,
        isLoadingLoginStatus: false
      });
      if (isLoggedIn) {
        this.fetchOrderCount();
      } else {
         this.setData({
            orderCount: { unpaid: 0, unshipped: 0, shipped: 0, completed: 0, afterSale: 0 }
         });
      }
    });
  },

  onShow: function() {
    if (app.globalData.loginChecked) {
      console.log('UserPage onShow: app.loginChecked is true. Syncing state.');
      this.setData({
        isLoggedIn: app.globalData.isLoggedIn,
        userInfo: app.globalData.isLoggedIn && app.globalData.userInfo ? app.globalData.userInfo : this.data.userInfo,
        isLoadingLoginStatus: false
      });
      if (app.globalData.isLoggedIn) {
        this.fetchOrderCount();
      } else {
         this.setData({
            orderCount: { unpaid: 0, unshipped: 0, shipped: 0, completed: 0, afterSale: 0 }
         });
      }
    } else {
      console.log('UserPage onShow: app.loginChecked is false. Waiting for listener.');
      this.setData({ isLoadingLoginStatus: true });
    }

    if (app.globalData.openid) {
        app.getCartCount();
    }
  },

  // 用户点击登录/授权按钮 - 函数名已从 handleLogin 修改为 login
  login: function() {
    if (this.data.isLoggedIn && this.data.userInfo && this.data.userInfo.nickName !== '汪汪用户') {
      console.log("User is already logged in with profile.");
      return;
    }

    wx.showLoading({ title: '授权中...', mask: true });
    wx.getUserProfile({
        desc: '用于完善会员资料及订单服务',
        success: (res) => {
            console.log("wx.getUserProfile success:", res.userInfo);
            app.setUserInfoAndSyncToCloud(res.userInfo, (err, syncData) => {
              wx.hideLoading();
              if (err) {
                wx.showToast({ title: '信息同步失败: ' + err.message, icon: 'none' });
              } else {
                this.setData({
                  userInfo: res.userInfo,
                  isLoggedIn: true
                });
                this.fetchOrderCount();
                app.notifyPagesUserUpdate();
                wx.showToast({ title: '授权成功!', icon: 'success' });
              }
            });
        },
        fail: (err) => {
            wx.hideLoading();
            console.log("用户拒绝授权或获取信息失败: ", err);
            wx.showToast({ title: '授权失败，部分功能可能受限', icon: 'none' });
        }
    });
  },

  fetchOrderCount: function() {
    if (!app.globalData.openid) {
      this.setData({
        orderCount: { unpaid: 0, unshipped: 0, shipped: 0, completed: 0, afterSale: 0 }
      });
      return;
    }
    wx.cloud.callFunction({
      name: 'orders',
      data: { action: 'countByStatus' }
    })
    .then(res => {
      if (res.result && res.result.code === 0 && res.result.data) {
        const counts = res.result.data;
        this.setData({
          'orderCount.unpaid': counts.unpaid || 0,
          'orderCount.unshipped': counts.unshipped || 0,
          'orderCount.shipped': counts.shipped || 0,
        });
      }
    })
    .catch(err => {
      // console.error('User.js: fetchOrderCount - Error calling cloud function:', err);
    });
  },

  navigateToOrderList: function(e) {
    if (!this.checkAndPromptLogin()) return;
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/orderList/index?type=${type}`
    });
  },

  navigateToAddress: function() {
    if (!this.checkAndPromptLogin()) return;
    wx.navigateTo({ url: '/pages/address/index' });
  },

  navigateToCoupon: function() {
    if (!this.checkAndPromptLogin()) return;
    wx.navigateTo({ url: '/pages/coupon/index' });
  },

  navigateToFavorite: function() {
    if (!this.checkAndPromptLogin()) return;
    wx.navigateTo({ url: '/pages/favorite/index' });
  },

  contactService: function() {
    wx.makePhoneCall({ phoneNumber: '15051884139' });
  },

  navigateToAbout: function() {
    wx.navigateTo({ url: '/pages/about/index' });
  },

  navigateToDetail: function(e) {
    const productId = e.currentTarget.dataset.id;
    if (productId) {
        wx.navigateTo({ url: `/pages/detail/index?id=${productId}` });
    } else {
        wx.showToast({ title: '商品信息错误', icon: 'none'});
    }
  },

  checkAndPromptLogin: function() {
    if (!this.data.isLoggedIn || !app.globalData.openid) {
      wx.showModal({
        title: '登录提示',
        content: '您还未登录，请先完成授权登录哦~',
        confirmText: '去登录',
        cancelText: '暂不登录',
        success: res => {
          if (res.confirm) {
            this.login(); // 现在调用 login 函数
          }
        }
      });
      return false;
    }
    return true;
  },

  onUserLoginOrProfileUpdate: function() {
    console.log("User page notified of user update from app.js");
    this.setData({
        isLoggedIn: app.globalData.isLoggedIn,
        userInfo: app.globalData.isLoggedIn && app.globalData.userInfo ? app.globalData.userInfo : this.data.userInfo
    });
    if (app.globalData.isLoggedIn) {
        this.fetchOrderCount();
    }
  }
});
