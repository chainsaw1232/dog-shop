// pages/user/index.js
const app = getApp();

Page({
  data: {
    userInfo: { // 默认用户信息
      nickName: '汪汪用户',
      avatarUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png' // 请确保这个云存储路径是正确的，或者替换为你的本地默认头像路径
    },
    orderCount: { // 初始化订单数量为0
      unpaid: 0,
      unshipped: 0,
      shipped: 0,
      completed: 0, // “已完成”状态，如果也需要角标，则从云函数获取
      afterSale: 0  // “售后”状态，如果也需要角标，则从云函数获取
    },
    recommendProducts: [ // 示例推荐商品数据
      {
        id: "prod_001", // 确保ID是字符串，与数据库中_id对应或自定义的唯一ID
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
      {
        id: "prod_003",
        name: '洁齿磨牙棒 5支装',
        price: 15.9,
        originalPrice: 20.9,
        imageUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/products/product_03.png',
        sales: 1000
      },
      {
        id: "prod_004",
        name: '鸡肉训练奖励零食 100g',
        price: 22.9,
        originalPrice: 29.9,
        imageUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/products/product_04.png',
        sales: 2000
      }
    ],
    menuIcons: { // 菜单图标路径
      address: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/icons/address.png',
      coupon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/icons/coupon.png',
      favorite: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/icons/favorite.png',
      order: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/icons/order.png'
      // 确保这些图标路径在你的云存储或本地项目中存在
    }
  },

  onLoad: function() {
    // 页面加载时可以进行一些初始化操作
    // 推荐商品可以在这里或 onShow 中获取
    // this.fetchRecommendProducts(); // 如果推荐商品是动态获取的
  },

  onShow: function() {
    // 检查登录状态并获取/更新用户信息
    if (app.globalData.openid && app.checkLogin()) { // 确保 openid 已获取
      this.setData({
        userInfo: app.globalData.userInfo || this.data.userInfo
      });
      this.fetchOrderCount(); // 获取订单数量
    } else {
      // 用户未登录或 openid 未获取，显示默认信息和0订单数量
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
    // 更新购物车角标
    if (app.globalData.openid) {
        app.getCartCount();
    }
  },

  // 登录函数 (用户点击登录按钮时触发)
  login: function() {
    // 调用 app.js 中的方法来处理用户授权和信息同步
    // 假设 app.js 有一个统一的入口如 app.handleLoginAndProfile()
    // 或者直接在这里调用 wx.getUserProfile
    wx.getUserProfile({
        desc: '用于完善会员资料及订单服务', // 声明获取用户个人信息后的用途
        success: (res) => {
            if (app.globalData.openid) { // 确保 openid 已获取
                app.setUserInfoAndSyncToCloud(res.userInfo); // 调用 app.js 的方法更新并同步
                this.setData({ userInfo: res.userInfo }); // 立即更新当前页面的 userInfo
                this.fetchOrderCount(); // 登录成功后再次获取订单数量
            } else {
                // openid 获取流程可能还在进行中或失败，提示用户稍后
                wx.showToast({ title: '登录状态异常，请稍后重试', icon: 'none' });
                // 可以考虑延迟一点时间后再次尝试获取 openid 和订单数量
                // 或者引导用户重新进入页面触发 onLaunch 的登录流程
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
      this.setData({ // 未登录或openid无效时，确保角标为0
        orderCount: { unpaid: 0, unshipped: 0, shipped: 0, completed: 0, afterSale: 0 }
      });
      return;
    }

    wx.showLoading({ title: '加载中...', mask: true });
    wx.cloud.callFunction({
      name: 'orders', // 调用名为 'orders' 的云函数
      data: {
        action: 'countByStatus' // 指定操作为 'countByStatus'
        // openid 会在云函数端通过 getWXContext() 自动获取
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
          // 如果云函数也返回了 completed 和 afterSale 的数量，则可以更新
          'orderCount.completed': counts.completed || 0, // 假设云函数也统计了 completed
          'orderCount.afterSale': counts.afterSale || 0   // 假设云函数也统计了 afterSale
        });
      } else {
        const errMsg = res.result ? res.result.message : "加载订单数量失败";
        console.error("User.js: fetchOrderCount - " + errMsg, res);
        this.setData({ // 加载失败时，确保角标为0
          orderCount: { unpaid: 0, unshipped: 0, shipped: 0, completed: 0, afterSale: 0 }
        });
      }
    })
    .catch(err => {
      wx.hideLoading();
      console.error('User.js: fetchOrderCount - Error calling cloud function:', err);
      this.setData({ // 调用失败时，确保角标为0
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
    // }).then(res => {
    //   if (res.result && res.result.code === 0 && res.result.data && res.result.data.list) {
    //     this.setData({ recommendProducts: res.result.data.list });
    //   } else {
    //     console.warn("获取推荐商品失败或数据为空");
    //   }
    // }).catch(err => {
    //   console.error("获取推荐商品云函数调用失败", err);
    // });
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
    // 使用微信开放能力 button open-type="contact" 会更方便
    // 或者自定义弹窗显示客服信息
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
            // 触发登录/授权，可以切换到tabBar的user页面，让其onShow处理
            // 或者直接调用登录函数
            this.login();
          }
        }
      });
      return false;
    }
    return true;
  },

  // 供 app.js 通知用户信息更新的回调 (如果 app.js 中有类似 this.notifyPagesUserUpdate 的逻辑)
  onUserLoginOrProfileUpdate: function() {
    console.log("User page notified of user update from app.js");
    this.setData({
        userInfo: app.globalData.userInfo || this.data.userInfo
    });
    if (app.globalData.openid) { // 确保 openid 存在才刷新订单
        this.fetchOrderCount();
    }
  }
});
