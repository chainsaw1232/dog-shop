// pages/user/index.js
const app = getApp();

Page({
  data: {
    userInfo: { // 默认用户信息
      nickName: '汪汪用户',
      avatarUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png' // 默认头像路径
    },
    orderCount: { // 初始化订单数量为0
      unpaid: 0,
      unshipped: 0,
      shipped: 0,
      completed: 0, 
      afterSale: 0  
    },
    recommendProducts: [ // 示例推荐商品数据
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
      // ... 更多推荐商品
    ],
    menuIcons: { // 菜单图标路径 - 已更新为您的云存储路径
      address: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/收货地址.png',
      coupon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/优惠卷.png', // 注意文件名是“优惠卷”
      favorite: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/我的收藏.png',
      contactService: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/客服.png',
      aboutUs: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/关于我们.png'
    },
    orderStateIcons: { // 新增：订单状态图标路径
      unpaid: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/待付款.png',
      unshipped: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/待发货.png',
      shipped: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/待收货.png',
      completed: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/已完成.png',
      afterSale: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/售后.png'
    }
  },

  onLoad: function() {
    // 页面加载时可以进行一些初始化操作
  },

  onShow: function() {
    // 检查登录状态并获取/更新用户信息
    if (app.globalData.openid && app.checkLogin()) { 
      this.setData({
        userInfo: app.globalData.userInfo || this.data.userInfo
      });
      this.fetchOrderCount(); // 获取订单数量
    } else {
      this.setData({
        userInfo: {
          nickName: '汪汪用户',
          avatarUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png'
        },
        orderCount: {
          unpaid: 0,
          unshipped: 0,
          shipped: 0,
          completed: 0,
          afterSale: 0
        }
      });
    }
    if (app.globalData.openid) {
        app.getCartCount();
    }
  },

  // 登录函数 (用户点击登录按钮时触发)
  login: function() {
    wx.getUserProfile({
        desc: '用于完善会员资料及订单服务', 
        success: (res) => {
            if (app.globalData.openid) { 
                app.setUserInfoAndSyncToCloud(res.userInfo); 
                this.setData({ userInfo: res.userInfo }); 
                this.fetchOrderCount(); 
            } else {
                wx.showToast({ title: '登录状态异常，请稍后重试', icon: 'none' });
            }
        },
        fail: (err) => {
            console.log("用户拒绝授权或获取信息失败: ", err);
            wx.showToast({ title: '授权失败', icon: 'none' });
        }
    });
  },

  // 获取订单数量统计
  fetchOrderCount: function() {
    if (!app.globalData.openid) {
      console.warn("User.js: fetchOrderCount - openid not available, skipping.");
      this.setData({ 
        orderCount: { unpaid: 0, unshipped: 0, shipped: 0, completed: 0, afterSale: 0 }
      });
      return;
    }

    wx.showLoading({ title: '加载中...', mask: true });
    wx.cloud.callFunction({
      name: 'orders', 
      data: {
        action: 'countByStatus' 
      }
    })
    .then(res => {
      wx.hideLoading();
      console.log('User.js: fetchOrderCount response from cloud function:', res);
      if (res.result && res.result.code === 0 && res.result.data) {
        const counts = res.result.data;
        this.setData({
          'orderCount.unpaid': counts.unpaid || 0,
          'orderCount.unshipped': counts.unshipped || 0,
          'orderCount.shipped': counts.shipped || 0,
          'orderCount.completed': counts.completed || 0, 
          'orderCount.afterSale': counts.afterSale || 0   
        });
      } else {
        const errMsg = res.result ? res.result.message : "加载订单数量失败";
        console.error("User.js: fetchOrderCount - " + errMsg, res);
        this.setData({ 
          orderCount: { unpaid: 0, unshipped: 0, shipped: 0, completed: 0, afterSale: 0 }
        });
      }
    })
    .catch(err => {
      wx.hideLoading();
      console.error('User.js: fetchOrderCount - Error calling cloud function:', err);
      this.setData({ 
        orderCount: { unpaid: 0, unshipped: 0, shipped: 0, completed: 0, afterSale: 0 }
      });
      wx.showToast({ title: '加载订单数量出错', icon: 'none' });
    });
  },

  // 获取推荐商品 (如果需要动态获取)
  fetchRecommendProducts: function() {
    // 示例：调用云函数获取推荐商品
    // wx.cloud.callFunction({
    //   name: 'getProducts',
    //   data: {
    //     action: 'list', // 或者 'recommend'
    //     isRecommend: true, // 或者其他筛选条件
    //     pageSize: 4
    //   }
    //   // ...
    // })
  },

  // 跳转到订单列表
  navigateToOrderList: function(e) {
    if (!this.checkLoginStatus()) return;
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/orderList/index?type=${type}`
    });
  },

  // 跳转到收货地址
  navigateToAddress: function() {
    if (!this.checkLoginStatus()) return;
    wx.navigateTo({
      url: '/pages/address/index'
    });
  },

  // 跳转到优惠券
  navigateToCoupon: function() {
    if (!this.checkLoginStatus()) return;
    wx.navigateTo({
      url: '/pages/coupon/index'
    });
  },

  // 跳转到收藏
  navigateToFavorite: function() {
    if (!this.checkLoginStatus()) return;
    wx.navigateTo({
      url: '/pages/favorite/index'
    });
  },

  // 联系客服
  contactService: function() {
    wx.showModal({
        title: '联系客服',
        content: '客服电话：400-888-9999\n工作时间：9:00-21:00',
        confirmText: '拨打',
        cancelText: '取消',
        success: (res) => {
            if(res.confirm) {
                wx.makePhoneCall({ phoneNumber: '4008889999' });
            }
        }
    });
  },

  // 跳转到关于我们
  navigateToAbout: function() {
    wx.navigateTo({
      url: '/pages/about/index'
    });
  },

  // 跳转到商品详情
  navigateToDetail: function(e) {
    const productId = e.currentTarget.dataset.id;
    if (productId) {
        wx.navigateTo({
          url: `/pages/detail/index?id=${productId}`
        });
    } else {
        console.warn("navigateToDetail: productId is missing from dataset", e.currentTarget.dataset);
        wx.showToast({ title: '商品信息错误', icon: 'none'});
    }
  },

  // 检查登录状态并提示
  checkLoginStatus: function() {
    if (!app.globalData.openid) {
      wx.showModal({
        title: '登录提示',
        content: '您还未登录，请先登录哦~',
        confirmText: '去登录',
        cancelText: '暂不登录',
        success: res => {
          if (res.confirm) {
            this.login();
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
        userInfo: app.globalData.userInfo || this.data.userInfo
    });
    if (app.globalData.openid) { 
        this.fetchOrderCount();
    }
  }
});
