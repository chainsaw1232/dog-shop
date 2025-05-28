// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
    cartCount: 0,
    cloudEnvId: 'cloud1-2gz5tcgibdf4bfc0', // 您的云环境ID
    loginChecked: false, // 新增：标记登录流程是否已检查完毕
    isLoggedIn: false,   // 新增：标记用户是否已成功获取openid (视为基础登录成功)
    // loginPromise: null, // 可以移除或保留，当前逻辑未使用
    // baseUrl: 'https://your-actual-base-url.com' // <--- 这行已经被移除了
  },

  onLaunch: function() {
    console.log('App.js: onLaunch started.');
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: this.globalData.cloudEnvId,
        traceUser: true,
      });
      console.log('云开发环境初始化成功，环境ID：', this.globalData.cloudEnvId);
    }
    this.performLoginSequence();
  },

  performLoginSequence: function() {
    console.log('App.js: Starting performLoginSequence...');
    this.cloudLoginAndGetOpenid()
      .then(openid => {
        console.log('App.js: performLoginSequence - cloudLoginAndGetOpenid SUCCESS, openid:', openid);
        this.globalData.isLoggedIn = true; // 获取到openid视为基础登录成功
        // OpenID 获取成功后，可以尝试获取已授权的用户信息
        this.tryGetCachedUserProfile(); // 尝试从缓存加载用户信息
        this.getCartCount();
        // 通知页面登录状态已检查完毕
        this.globalData.loginChecked = true;
        this.notifyPagesLoginStatusUpdate();
      })
      .catch(err => {
        console.error('App.js: performLoginSequence - cloudLoginAndGetOpenid FAILED:', err);
        this.setDefaultUserAndCartState(); // 登录失败，设置默认状态
        this.globalData.loginChecked = true; // 同样标记检查完毕
        this.notifyPagesLoginStatusUpdate();
      });
  },

  cloudLoginAndGetOpenid: function() {
    console.log('App.js: Attempting cloudLoginAndGetOpenid...');
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        data: {}
      })
      .then(res => {
        console.log('App.js: cloudLoginAndGetOpenid - wx.cloud.callFunction response:', JSON.stringify(res));
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.openid) {
          const openid = res.result.data.openid;
          console.log('[云函数 login] 返回的 openid: ', openid);
          this.globalData.openid = openid;
          wx.setStorageSync('openid', openid); // 将 openid 存入本地缓存
          console.log('App.js: globalData.openid SET to:', this.globalData.openid);
          resolve(openid);
        } else {
          const errMsg = (res.result && res.result.message) ? res.result.message : '获取 openid 失败 - 云函数返回异常';
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
        reject(err);
      });
    });
  },

  // 新增：尝试从缓存加载用户信息
  tryGetCachedUserProfile: function() {
    if (!this.globalData.openid) return; // 必须在有openid的前提下

    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedUserInfo && cachedUserInfo.nickName !== '汪汪用户') { // 简单判断非默认值
      this.globalData.userInfo = cachedUserInfo;
      console.log('App.js: Loaded userInfo from cache:', cachedUserInfo);
      // 如果需要，可以在这里再次通知页面更新，但通常 performLoginSequence 结束后的通知已足够
      // this.notifyPagesUserUpdate(); // 如果有专门处理用户资料更新的通知
    } else {
      // 缓存中没有有效用户信息，等待用户在个人中心页主动授权
      console.log('App.js: No valid userInfo in cache. Waiting for user to authorize on profile page.');
      // 确保如果缓存是默认值，globalData 也不是默认值
      if (!this.globalData.userInfo || this.globalData.userInfo.nickName === '汪汪用户') {
          this.setDefaultUserAndCartState(false); // 只设置用户，不重置登录状态
      }
    }
  },

  // 用户信息设置与同步到云端 (由页面调用)
  setUserInfoAndSyncToCloud: function(userInfo, callback) {
    console.log('App.js: Setting and syncing userInfo:', userInfo);
    if (!userInfo || !userInfo.nickName) {
        console.warn('App.js: setUserInfoAndSyncToCloud - Invalid userInfo provided.');
        if (callback) callback(new Error('无效的用户信息'));
        return;
    }
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);

    if (this.globalData.openid) {
      console.log('App.js: Attempting to update user info to cloud with openid:', this.globalData.openid);
      wx.cloud.callFunction({
        name: 'updateUser',
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          gender: userInfo.gender,
          country: userInfo.country,
          province: userInfo.province,
          city: userInfo.city
          // openid 会自动通过云函数上下文传递
        }
      })
      .then(res => {
        if (res.result && res.result.code === 0) {
          console.log('[云函数 updateUser] 用户信息同步成功');
          if (callback) callback(null, res.result.data);
        } else {
          const errMsg = res.result ? res.result.message : '用户信息同步失败';
          console.error('[云函数 updateUser] 用户信息同步失败:', errMsg);
          if (callback) callback(new Error(errMsg));
        }
      })
      .catch(err => {
        console.error('[云函数 updateUser] 调用失败:', err);
        if (callback) callback(err);
      });
    } else {
      const errMsg = 'OpenID 不可用，无法同步用户信息到云端';
      console.warn('App.js: setUserInfoAndSyncToCloud -', errMsg);
      if (callback) callback(new Error(errMsg));
    }
  },

  getCartCount: function() {
    if (!this.globalData.openid) {
      // console.warn('App.js: getCartCount - openid is null, cannot fetch cart count.');
      this.updateCartBadge(0);
      return;
    }
    // console.log('App.js: Attempting to get cart count from cloud for openid:', this.globalData.openid);
    wx.cloud.callFunction({
      name: 'cart', // 假设你的购物车云函数名为 'cart'
      data: {
        action: 'count' // 假设 'count' action 用于获取数量
        // openid 会自动通过云函数上下文传递
      }
    })
    .then(res => {
      if (res.result && res.result.code === 0 && typeof res.result.data.count !== 'undefined') {
        const count = res.result.data.count;
        // console.log('[云函数 cart_count] 购物车数量: ', count);
        this.updateCartBadge(count);
      } else {
        // console.error('[云函数 cart_count] 获取购物车数量失败:', res.result ? res.result.message : '无详细信息');
        this.updateCartBadge(0);
      }
    })
    .catch(err => {
      // console.error('[云函数 cart_count] 调用失败:', err);
      this.updateCartBadge(0);
    });
  },

  updateCartBadge: function(count) {
    this.globalData.cartCount = count;
    if (count > 0) {
      wx.setTabBarBadge({
        index: 2, // 假设购物车在 tabBar 的第3个位置 (索引从0开始)
        text: String(count)
      });
    } else {
      wx.removeTabBarBadge({
        index: 2
      });
    }
  },

  setDefaultUserAndCartState: function(resetLoginStatus = true) {
    console.log('App.js: Setting default user and cart state. Reset login status:', resetLoginStatus);
    const defaultUserInfo = {
      nickName: '汪汪用户', // 和你的wxml中默认显示一致
      avatarUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png' // 默认头像路径
    };
    // 只有当 globalData.userInfo 不存在，或者还是初始的“汪汪用户”时，才用默认值覆盖
    // 避免已从缓存加载的有效 userInfo 被意外重置
    if (!this.globalData.userInfo || this.globalData.userInfo.nickName === '汪汪用户') {
        this.globalData.userInfo = defaultUserInfo;
        // wx.setStorageSync('userInfo', defaultUserInfo); // 仅在用户主动授权后才更新缓存
    }
    if (resetLoginStatus) {
        this.globalData.isLoggedIn = false;
        this.globalData.openid = null; // 确保 openid 也清空
        wx.removeStorageSync('openid');
        wx.removeStorageSync('userInfo'); // 如果登录失败，也清除用户信息缓存
    }
    this.updateCartBadge(0);
  },

  checkLogin: function() { // 这个函数现在主要用于页面判断是否已获取openid
    return !!this.globalData.openid && this.globalData.isLoggedIn;
  },

  // 新增：通知页面登录状态已更新 (例如，从 Page.onLoad 调用以等待登录检查完成)
  listenLoginStatusUpdate: function(pageInstance, callback) {
    if (this.globalData.loginChecked) {
      // 如果登录检查已完成，立即回调
      callback(this.globalData.isLoggedIn, this.globalData.userInfo);
    } else {
      // 如果登录流程尚未完成，将回调存储起来，待完成后执行
      if (!this.loginStatusUpdateCallbacks) {
        this.loginStatusUpdateCallbacks = [];
      }
      this.loginStatusUpdateCallbacks.push({ page: pageInstance, cb: callback });
    }
  },

  // 新增：当登录状态检查完毕后，通知所有监听的页面
  notifyPagesLoginStatusUpdate: function() {
    if (this.loginStatusUpdateCallbacks && this.loginStatusUpdateCallbacks.length > 0) {
      this.loginStatusUpdateCallbacks.forEach(item => {
        // 确保页面实例仍然存在 (防止页面已销毁)
        if (item.page && typeof item.cb === 'function') {
          try {
            item.cb(this.globalData.isLoggedIn, this.globalData.userInfo);
          } catch (e) {
            console.error("Error in login status update callback for page:", item.page, e);
          }
        }
      });
      this.loginStatusUpdateCallbacks = []; // 清空回调
    }
    // 也可以通过 wx.eventBus (如果引入了的话) 或其他方式通知
    // 例如，触发一个全局自定义事件
    wx.switchTab({ // 尝试触发一次tab页的onShow，让它们也能感知到变化
        url: '/pages/index/index', // 切换到首页，通常会触发首页的onShow
        complete: () => {
            // 尝试切换回之前的页面，如果不是首页的话
            // 这个逻辑比较复杂，因为 switchTab 后 getCurrentPages 的行为可能不符合预期
            // 简单起见，可以只切换到首页，让用户自行导航
            // 或者，如果知道当前是哪个tab，可以尝试切回去，但要小心死循环
            const currentPage = getCurrentPages().pop();
            if (currentPage && currentPage.route !== 'pages/index/index') {
                // 如果当前页不是首页，并且是tab页，可以尝试切回去
                // 不过这个逻辑有点复杂，暂时简化
                // console.log('Attempting to switch back to:', currentPage.route);
                // wx.switchTab({ url: `/${currentPage.route}` });
            }
        }
    });
  },

  // 辅助函数：通知特定页面用户资料已更新（例如，个人中心页）
  notifyPagesUserUpdate: function() {
    const pages = getCurrentPages();
    if (pages.length > 0) {
      pages.forEach(page => {
        if (page && typeof page.onUserLoginOrProfileUpdate === 'function') {
          page.onUserLoginOrProfileUpdate();
        }
      });
    }
  }
})