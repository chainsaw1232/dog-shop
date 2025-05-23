// about/index.js
Page({
  data: {
    // 页面数据
  },

  onLoad: function() {
    // 页面加载时执行
  },

  // 拨打电话
  callService: function() {
    wx.makePhoneCall({
      phoneNumber: '4008888888'
    })
  },

  // 复制邮箱
  copyEmail: function() {
    wx.setClipboardData({
      data: 'service@wangwang.com',
      success: function() {
        wx.showToast({
          title: '邮箱已复制',
          icon: 'success'
        })
      }
    })
  },

  // 查看地图位置
  viewLocation: function() {
    wx.openLocation({
      latitude: 39.9219,
      longitude: 116.4551,
      name: '汪汪零食铺总部',
      address: '北京市朝阳区宠物大道88号'
    })
  },

  // 预览二维码
  previewQrcode: function(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      urls: [url],
      current: url
    })
  }
})
