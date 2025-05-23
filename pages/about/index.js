// pages/about/index.js
Page({
  data: {
    storeName: "火山零食小卖部", // 确保这里是新的店铺名
    storeDescription: "火山零食小卖部是一家专注于高品质狗狗零食的精选商城, 我们致力于为您的爱宠提供健康、安全、美味的零食选择。所有产品均经过严格筛选, 确保不含有害添加剂, 让您的爱宠吃得开心, 您也能放心。", // 确保这里是新的店铺描述
    contactPhone: "15051884139", 
    contactEmail: "394564878@qq.com", 
    storeAddress: "燕子矶滨江公园", 
    qrcodeUrl: "cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/qrcode/wechat_qrcode.png", 
    logoUrl: "cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/logo/logo.png", // 店铺logo
    commitments: [ 
      {
        icon: "cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/保证.png", 
        title: "品质保证",
        text: "精选优质原料, 严格把控生产流程"
      },
      {
        icon: "cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/安全.png",
        title: "安全无添加",
        text: "不含防腐剂、色素等有害添加剂"
      },
      {
        icon: "cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/新鲜配送.png",
        title: "新鲜配送",
        text: "48小时内发货, 全程冷链配送 (部分商品)" 
      },
      {
        icon: "cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/我的个人中心界面图片/服务.png",
        title: "贴心服务",
        text: "7×24小时客服, 解决您的任何问题"
      }
    ]
  },

  onLoad: function() {
    wx.setNavigationBarTitle({
      title: `关于${this.data.storeName}` // 动态设置导航栏标题
    });
    // 如果您的店铺信息（如描述、电话等）也需要从云端settings获取，
    // 请确保settings数据库中的信息已更新为“火山零食小卖部”，
    // 并在此处调用类似 this.fetchStoreInfoFromCloud(); 的方法来加载。
  },

  callService: function() {
    wx.makePhoneCall({
      phoneNumber: this.data.contactPhone
    })
  },

  copyEmail: function() {
    wx.setClipboardData({
      data: this.data.contactEmail,
      success: function() {
        wx.showToast({
          title: '邮箱已复制',
          icon: 'success'
        })
      }
    })
  },

  viewLocation: function() {
    wx.openLocation({
      latitude: 39.9219, 
      longitude: 116.4551, 
      name: `${this.data.storeName}总部`, // 使用更新后的店铺名
      address: this.data.storeAddress
    })
  },

  previewQrcode: function(e) {
    const url = e.currentTarget.dataset.url || this.data.qrcodeUrl;
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      });
    } else {
      wx.showToast({
        title: '二维码暂未设置',
        icon: 'none'
      });
    }
  }
})
