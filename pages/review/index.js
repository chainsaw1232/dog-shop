// review/index.js
const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    orderId: '', // 订单ID
    orderDetail: null, // 订单详情
    rating: 5, // 评分，默认5星
    ratingText: '非常满意', // 评分文字
    content: '', // 评价内容
    images: [], // 上传的图片
    tempImages: [], // 临时图片路径
    isAnonymous: false, // 是否匿名评价
    canSubmit: false // 是否可以提交
  },

  onLoad: function(options) {
    if (options.orderId) {
      this.setData({ orderId: options.orderId })
      this.fetchOrderDetail()
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 获取订单详情
  fetchOrderDetail: function() {
    if (!app.globalData.openid) {
      this.showLoginModal()
      return
    }
    
    wx.showLoading({ title: '加载中...' })
    
    wx.request({
      url: app.globalData.baseUrl + '/api/order/detail',
      method: 'GET',
      data: {
        openid: app.globalData.openid,
        id: this.data.orderId
      },
      success: res => {
        if (res.data && res.data.code === 0) {
          this.setData({
            orderDetail: res.data.data
          })
        } else {
          wx.showToast({
            title: res.data.message || '获取订单失败',
            icon: 'none'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        }
      },
      fail: () => {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  // 设置评分
  setRating: function(e) {
    const rating = parseInt(e.currentTarget.dataset.rating)
    let ratingText = ''
    
    switch (rating) {
      case 1:
        ratingText = '非常差'
        break
      case 2:
        ratingText = '较差'
        break
      case 3:
        ratingText = '一般'
        break
      case 4:
        ratingText = '满意'
        break
      case 5:
        ratingText = '非常满意'
        break
      default:
        ratingText = '非常满意'
    }
    
    this.setData({
      rating,
      ratingText
    })
    
    this.checkCanSubmit()
  },

  // 输入评价内容
  inputContent: function(e) {
    this.setData({
      content: e.detail.value
    })
    
    this.checkCanSubmit()
  },

  // 选择图片
  chooseImage: function() {
    wx.chooseImage({
      count: 6 - this.data.images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        // 临时图片路径
        const tempFilePaths = res.tempFilePaths
        
        // 更新临时图片数组
        this.setData({
          tempImages: [...this.data.tempImages, ...tempFilePaths],
          images: [...this.data.images, ...tempFilePaths]
        })
        
        this.checkCanSubmit()
      }
    })
  },

  // 删除图片
  deleteImage: function(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.images
    const tempImages = this.data.tempImages
    
    // 从临时图片数组中找到对应的图片
    const imageUrl = images[index]
    const tempIndex = tempImages.indexOf(imageUrl)
    
    // 更新图片数组
    images.splice(index, 1)
    if (tempIndex !== -1) {
      tempImages.splice(tempIndex, 1)
    }
    
    this.setData({
      images,
      tempImages
    })
  },

  // 切换匿名评价
  switchAnonymous: function(e) {
    this.setData({
      isAnonymous: e.detail.value
    })
  },

  // 检查是否可以提交
  checkCanSubmit: function() {
    const canSubmit = this.data.rating > 0 && this.data.content.trim().length > 0
    this.setData({ canSubmit })
  },

  // 上传图片
  uploadImages: function() {
    return new Promise((resolve, reject) => {
      if (this.data.tempImages.length === 0) {
        resolve([])
        return
      }
      
      const uploadTasks = this.data.tempImages.map(tempFilePath => {
        return new Promise((resolveUpload, rejectUpload) => {
          wx.uploadFile({
            url: app.globalData.baseUrl + '/api/upload/image',
            filePath: tempFilePath,
            name: 'file',
            formData: {
              openid: app.globalData.openid
            },
            success: res => {
              const data = JSON.parse(res.data)
              if (data.code === 0) {
                resolveUpload(data.data.url)
              } else {
                rejectUpload(new Error(data.message || '上传失败'))
              }
            },
            fail: err => {
              rejectUpload(err)
            }
          })
        })
      })
      
      Promise.all(uploadTasks)
        .then(imageUrls => {
          resolve(imageUrls)
        })
        .catch(err => {
          reject(err)
        })
    })
  },

  // 提交评价
  submitReview: function() {
    if (!this.data.canSubmit) return
    
    if (!app.globalData.openid) {
      this.showLoginModal()
      return
    }
    
    wx.showLoading({ title: '提交中...' })
    
    // 先上传图片
    this.uploadImages()
      .then(imageUrls => {
        // 构建评价数据
        const reviewData = {
          openid: app.globalData.openid,
          orderId: this.data.orderId,
          rating: this.data.rating,
          content: this.data.content,
          images: imageUrls,
          isAnonymous: this.data.isAnonymous
        }
        
        // 提交评价
        wx.request({
          url: app.globalData.baseUrl + '/api/review/add',
          method: 'POST',
          data: reviewData,
          success: res => {
            if (res.data && res.data.code === 0) {
              wx.showToast({
                title: '评价成功',
                icon: 'success'
              })
              
              // 返回订单详情页
              setTimeout(() => {
                wx.navigateBack()
              }, 1500)
            } else {
              wx.showToast({
                title: res.data.message || '评价失败',
                icon: 'none'
              })
            }
          },
          fail: () => {
            wx.showToast({
              title: '网络请求失败',
              icon: 'none'
            })
          },
          complete: () => {
            wx.hideLoading()
          }
        })
      })
      .catch(err => {
        wx.hideLoading()
        wx.showToast({
          title: '图片上传失败',
          icon: 'none'
        })
      })
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
          })
        } else {
          wx.navigateBack()
        }
      }
    })
  }
})
