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
    isPolicyAgreed: false, 

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
    app.listenLoginStatusUpdate(this, (isLoggedIn, globalUserInfo) => {
      console.log('UserPage (onLoad listener): App.js login status - isLoggedIn:', isLoggedIn, 'globalUserInfo:', globalUserInfo);
      let currentLocalUserInfo = this.data.userInfo;
      const defaultAvatarPath = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png';
      if (isLoggedIn && globalUserInfo && globalUserInfo.avatarUrl !== defaultAvatarPath) {
        currentLocalUserInfo = globalUserInfo;
      } else if (isLoggedIn && (!globalUserInfo || globalUserInfo.avatarUrl === defaultAvatarPath)) {
        // If logged in but globalUserInfo is still default (or undefined), keep local default
        currentLocalUserInfo = { nickName: '汪汪用户', avatarUrl: defaultAvatarPath };
      } else {
        // Not logged in, use local default
        currentLocalUserInfo = { nickName: '汪汪用户', avatarUrl: defaultAvatarPath };
      }
      this.setData({
        isLoggedIn: isLoggedIn,
        userInfo: currentLocalUserInfo,
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
    const defaultAvatarPath = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png';
    if (app.globalData.loginChecked) {
      console.log('UserPage (onShow): App.js loginChecked is true. Syncing state.');
      let currentLocalUserInfo = this.data.userInfo;
      if (app.globalData.isLoggedIn && app.globalData.userInfo && app.globalData.userInfo.avatarUrl !== defaultAvatarPath) {
        currentLocalUserInfo = app.globalData.userInfo;
      } else if (app.globalData.isLoggedIn && (!app.globalData.userInfo || app.globalData.userInfo.avatarUrl === defaultAvatarPath)){
         currentLocalUserInfo = { nickName: '汪汪用户', avatarUrl: defaultAvatarPath };
      } else {
         currentLocalUserInfo = { nickName: '汪汪用户', avatarUrl: defaultAvatarPath };
      }
      this.setData({
        isLoggedIn: app.globalData.isLoggedIn,
        userInfo: currentLocalUserInfo,
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
      console.log('UserPage (onShow): App.js loginChecked is false. Waiting for listener from onLoad or app.js notification.');
    }

    if (app.globalData.openid) { 
        app.getCartCount();
    }
  },

  onPolicyChange: function(e) {
    this.setData({
      isPolicyAgreed: e.detail.value.includes('agreed')
    });
  },

  login: function() {
    if (!this.data.isPolicyAgreed) {
      wx.showToast({ title: '请先阅读并同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    const defaultAvatarPath = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png';
    if (this.data.isLoggedIn && this.data.userInfo.avatarUrl && this.data.userInfo.avatarUrl !== defaultAvatarPath) {
      console.log("User profile already authorized.");
      return;
    }

    wx.showLoading({ title: '授权中...', mask: true });
    wx.getUserProfile({
        desc: '用于完善会员资料及订单服务', 
        success: (res) => {
            console.log("wx.getUserProfile success:", res.userInfo);
            if (res.userInfo) {
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
                    if (typeof app.notifyPagesUserUpdate === 'function') {
                        app.notifyPagesUserUpdate();
                    }
                    wx.showToast({ title: '授权成功!', icon: 'success' });
                  }
                });
            } else {
                 wx.hideLoading();
                 wx.showToast({ title: '未能获取到用户信息', icon: 'none' });
            }
        },
        fail: (err) => {
            wx.hideLoading();
            console.log("用户拒绝授权或获取信息失败: ", err);
            if (err.errMsg === 'getUserProfile:fail auth deny') {
              wx.showToast({ title: '您取消了授权', icon: 'none' });
            } else if (err.errMsg !== 'getUserProfile:fail cancel') { 
              wx.showToast({ title: '授权失败，请稍后重试', icon: 'none' });
            }
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
      } else {
        console.warn("fetchOrderCount - Failed to get order counts:", res.result);
      }
    })
    .catch(err => {
      console.error('User.js: fetchOrderCount - Error calling cloud function:', err);
    });
  },

  navigateToOrderList: function(e) {
    if (!this.checkAndPromptLogin(true)) return; 
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/orderList/index?type=${type}`
    });
  },

  navigateToAddress: function() {
    if (!this.checkAndPromptLogin(true)) return;
    wx.navigateTo({ url: '/pages/address/index' });
  },

  navigateToCoupon: function() {
    if (!this.checkAndPromptLogin(true)) return;
    wx.navigateTo({ url: '/pages/coupon/index' });
  },

  navigateToFavorite: function() {
    if (!this.checkAndPromptLogin(true)) return;
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

  navigateToUserAgreement: function() {
    wx.navigateTo({ 
      url: '/pages/policy/userAgreement/index',
      fail: (err) => {
        console.error("Failed to navigate to User Agreement:", err);
        wx.showToast({ title: '无法打开用户协议', icon: 'none'});
      }
    });
  },

  navigateToPrivacyPolicy: function() {
    wx.navigateTo({ 
      url: '/pages/policy/privacyPolicy/index',
      fail: (err) => {
        console.error("Failed to navigate to Privacy Policy:", err);
        wx.showToast({ title: '无法打开隐私政策', icon: 'none'});
      }
    });
  },

  checkAndPromptLogin: function(requireProfile = false) {
    const defaultAvatar = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png';
    const profileAuthorized = this.data.userInfo.avatarUrl && this.data.userInfo.avatarUrl !== defaultAvatar;

    if (!this.data.isLoggedIn || (requireProfile && !profileAuthorized) ) {
      wx.showModal({
        title: '登录提示',
        content: '您还未登录或授权个人信息，请先完成授权登录哦~',
        confirmText: '去授权',
        cancelText: '暂不授权',
        success: res => {
          if (res.confirm) {
            wx.pageScrollTo({ scrollTop: 0, duration: 300 });
            if (!profileAuthorized) {
                 wx.showToast({ title: '请点击上方的“微信授权登录”按钮', icon: 'none', duration: 2500 });
            }
          }
        }
      });
      return false;
    }
    return true;
  },

  onUserLoginOrProfileUpdate: function() {
    console.log("User page notified of user update from app.js");
    const defaultAvatar = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png';
    let newLocalUserInfo = this.data.userInfo; // Start with current local
    if(app.globalData.isLoggedIn && app.globalData.userInfo) {
        if(app.globalData.userInfo.avatarUrl && app.globalData.userInfo.avatarUrl !== defaultAvatar) {
            newLocalUserInfo = app.globalData.userInfo; // Use app's if it's non-default
        } else {
            // App has info, but it's default, so ensure local is also default
            newLocalUserInfo = { nickName: '汪汪用户', avatarUrl: defaultAvatar };
        }
    } else if (!app.globalData.isLoggedIn) {
        // App says not logged in, reset local to default
        newLocalUserInfo = { nickName: '汪汪用户', avatarUrl: defaultAvatar };
    }

    this.setData({
        isLoggedIn: app.globalData.isLoggedIn,
        userInfo: newLocalUserInfo
    });

    if (app.globalData.isLoggedIn) {
        this.fetchOrderCount();
    }
  }
});