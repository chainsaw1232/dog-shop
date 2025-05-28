// pages/policy/userAgreement/index.js (或 privacyPolicy/index.js)
Page({
  data: {},
  onLoad: function (options) {
    // 根据实际页面设置标题
    const pageRoute = this.route;
    let title = '政策详情';
    if (pageRoute.includes('userAgreement')) {
      title = '用户协议';
    } else if (pageRoute.includes('privacyPolicy')) {
      title = '隐私政策';
    }
    wx.setNavigationBarTitle({
      title: title
    });
  }
});