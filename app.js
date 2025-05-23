// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
    cartCount: 0,
    cloudEnvId: 'cloud1-2gz5tcgibdf4bfc0', // 你的云环境ID
    // loginPromise: null, // 用于确保登录完成后再执行其他操作
  },

  onLaunch: function() {
    console.log('App.js: onLaunch started.');
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: this.globalData.cloudEnvId,
        traceUser: true,
      });
      console.log('云开发环境初始化成功，环境ID：', this.globalData.cloudEnvId);
    }

    // 尝试登录并获取 OpenID
    this.performLoginSequence();
  },

  // 执行完整的登录和初始化序列
  performLoginSequence: function() {
    console.log('App.js: Starting performLoginSequence...');
    // this.globalData.loginPromise = // 这行可以去掉，直接用 then/catch
    this.cloudLoginAndGetOpenid()
      .then(openid => { // cloudLoginAndGetOpenid 成功时会 resolve openid
        console.log('App.js: performLoginSequence - cloudLoginAndGetOpenid SUCCESS, openid:', openid);
        // OpenID 获取成功后，可以进行后续操作
        this.tryGetUserProfileAndSync(); // 尝试获取用户信息并同步
        this.getCartCount();          // 获取购物车数量
        // TODO: 在这里可以触发一个全局事件，通知其他页面登录已完成
        // wx.eventBus.emit('loggedIn');
      })
      .catch(err => {
        console.error('App.js: performLoginSequence - cloudLoginAndGetOpenid FAILED:', err);
        // 登录失败或获取 OpenID 失败，设置默认状态
        this.setDefaultUserAndCartState();
        // TODO: 在这里可以触发一个全局事件，通知其他页面登录失败
        // wx.eventBus.emit('loginFailed');
      });
  },

  // 调用 login 云函数获取 OpenID
  cloudLoginAndGetOpenid: function() {
    console.log('App.js: Attempting cloudLoginAndGetOpenid...');
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login', // 确保云函数名称正确
        data: {} // login 云函数通常不需要前端传递 data
      })
      .then(res => {
        console.log('App.js: cloudLoginAndGetOpenid - wx.cloud.callFunction response:', JSON.stringify(res));
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.openid) {
          const openid = res.result.data.openid;
          console.log('[云函数 login] 返回的 openid: ', openid);
          this.globalData.openid = openid;
          wx.setStorageSync('openid', openid);
          console.log('App.js: globalData.openid SET to:', this.globalData.openid);
          resolve(openid); // 成功时 resolve openid
        } else {
          const errMsg = (res.result && res.result.message) ? res.result.message : '获取 openid 失败 - 云函数返回异常或数据结构不符';
          console.error('[云函数 login] 获取 openid 失败, result:', JSON.stringify(res.result));
          this.globalData.openid = null;
          wx.removeStorageSync('openid');
          reject(new Error(errMsg));
        }
      })
      .catch(err => {
        console.error('[云函数 login] 调用失败 (wx.cloud.callFunction catch):', JSON.stringify(err));
        this.globalData.openid = null;
        wx.removeStorageSync('openid');
        reject(err); // 将云函数调用本身的错误也 reject 出去
      });
    });
  },

  // 尝试获取用户信息并同步（应在 openid 获取成功后调用）
  tryGetUserProfileAndSync: function() {
    // 注意：wx.getUserProfile 必须由用户主动触发（如点击按钮）。
    // 在 onLaunch 中直接调用通常是为了静默获取已授权信息或引导用户授权。
    // 如果是首次登录或用户未授权，这里会失败，属于正常现象。
    // 更好的做法是在个人中心页等地方引导用户点击按钮来触发此操作。
    console.log('App.js: Attempting tryGetUserProfileAndSync. Current openid:', this.globalData.openid);
    if (!this.globalData.openid) {
        console.warn("App.js: tryGetUserProfileAndSync - openid not available, skipping user profile fetch.");
        this.setDefaultUserAndCartState(); // 确保有默认用户信息
        return;
    }

    // 尝试从缓存读取用户信息，如果存在，可以先用着，再尝试更新
    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedUserInfo) {
        this.globalData.userInfo = cachedUserInfo;
        console.log('App.js: Loaded userInfo from cache:', cachedUserInfo);
    } else {
        this.setDefaultUserAndCartState(); // 设置默认用户信息
    }

    // wx.getUserProfile 推荐由用户点击触发，这里仅为示例，可能无法在onLaunch中直接成功弹窗
    // 如果你希望在 onLaunch 中尝试获取（可能失败），可以保留。
    // 否则，应将此逻辑移至用户手动触发的事件中。
    wx.getUserProfile({
      desc: '用于完善会员资料及个性化服务', // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
      success: (res) => {
        console.log('App.js: wx.getUserProfile SUCCESS:', res.userInfo);
        this.setUserInfoAndSyncToCloud(res.userInfo);
        // 可以通知页面更新用户信息
        this.notifyPagesUserUpdate();
      },
      fail: (err) => {
        console.log('App.js: wx.getUserProfile FAILED or user denied:', err);
        // 用户拒绝或API失败，确保 globalData.userInfo 有默认值
        if (!this.globalData.userInfo) { // 避免覆盖已有的（比如从缓存加载的）
            this.setDefaultUserAndCartState();
        }
      }
    });
  },

  // 设置并同步用户信息到云端
  setUserInfoAndSyncToCloud: function(userInfo) {
    console.log('App.js: Setting and syncing userInfo:', userInfo);
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);

    if (this.globalData.openid) {
      console.log('App.js: Attempting to update user info to cloud with openid:', this.globalData.openid);
      wx.cloud.callFunction({
        name: 'updateUser', // 确保云函数名称正确
        data: {
          // openid 会在云函数端通过 getWXContext 自动获取，这里传递需要更新的字段
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          gender: userInfo.gender,
          country: userInfo.country,
          province: userInfo.province,
          city: userInfo.city
        }
      })
      .then(res => {
        if (res.result && res.result.code === 0) {
          console.log('[云函数 updateUser] 用户信息同步成功');
        } else {
          console.error('[云函数 updateUser] 用户信息同步失败:', res.result ? res.result.message : '无详细错误信息');
        }
      })
      .catch(err => {
        console.error('[云函数 updateUser] 调用失败:', err);
      });
    } else {
      console.warn('App.js: setUserInfoAndSyncToCloud - openid is null, cannot sync user info to cloud.');
    }
  },

  // 获取购物车数量
  getCartCount: function() {
    if (!this.globalData.openid) {
      console.warn('App.js: getCartCount - openid is null, cannot fetch cart count.');
      this.updateCartBadge(0); // 清空角标
      return;
    }

    console.log('App.js: Attempting to get cart count from cloud for openid:', this.globalData.openid);
    wx.cloud.callFunction({
      name: 'cart', // 确保云函数名称正确
      data: {
        action: 'count'
        // openid 会在云函数端自动获取
      }
    })
    .then(res => {
      if (res.result && res.result.code === 0 && typeof res.result.data.count !== 'undefined') {
        const count = res.result.data.count;
        console.log('[云函数 cart_count] 购物车数量: ', count);
        this.updateCartBadge(count);
      } else {
        console.error('[云函数 cart_count] 获取购物车数量失败:', res.result ? res.result.message : '无详细信息');
        this.updateCartBadge(0);
      }
    })
    .catch(err => {
      console.error('[云函数 cart_count] 调用失败:', err);
      this.updateCartBadge(0);
    });
  },

  // 更新购物车角标的辅助函数
  updateCartBadge: function(count) {
    this.globalData.cartCount = count;
    if (count > 0) {
      wx.setTabBarBadge({
        index: 2, // 购物车的tabBar索引，请根据你的app.json确认，通常是2 (0首页, 1分类, 2购物车, 3我的)
        text: String(count)
      });
    } else {
      wx.removeTabBarBadge({
        index: 2
      });
    }
  },

  // 设置默认的用户和购物车状态（通常在登录失败或未登录时调用）
  setDefaultUserAndCartState: function() {
    console.log('App.js: Setting default user and cart state.');
    const defaultUserInfo = {
      nickName: '汪汪用户',
      avatarUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png' // 确保这个路径是正确的
    };
    if (!this.globalData.userInfo || this.globalData.userInfo.nickName === '汪汪用户') {
        this.globalData.userInfo = defaultUserInfo;
        wx.setStorageSync('userInfo', defaultUserInfo);
    }
    this.updateCartBadge(0);
  },

  // 检查登录状态（主要给页面使用）
  checkLogin: function() {
    // 这个函数现在更多的是检查 globalData.openid 是否已存在
    // 真正的登录流程由 onLaunch 触发
    if (this.globalData.openid) {
      // 如果需要，可以从缓存恢复 userInfo，但更推荐 userInfo 的管理也通过 globalData
      // const userInfo = wx.getStorageSync('userInfo');
      // if (userInfo && !this.globalData.userInfo) {
      //   this.globalData.userInfo = userInfo;
      // }
      return true;
    }
    return false;
  },

  // 辅助函数：通知页面用户状态已更新（可选）
  notifyPagesUserUpdate: function() {
    const pages = getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      if (currentPage && typeof currentPage.onUserLoginOrProfileUpdate === 'function') {
        currentPage.onUserLoginOrProfileUpdate();
      }
    }
  }
})
