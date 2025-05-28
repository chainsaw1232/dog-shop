// pages/review/index.js
const app = getApp();
const util = require('../../utils/util.js'); //

Page({
  data: {
    orderId: '',
    orderDetail: null, 
    reviewsData: [], 
    isAnonymous: false,
    isLoading: true,
    isSubmitting: false,
  },

  onLoad: function(options) {
    if (options.orderId) {
      this.setData({ orderId: options.orderId });
      this.fetchOrderDetailsForReview();
    } else {
      util.showError('参数错误');
      setTimeout(() => { wx.navigateBack(); }, 1500);
    }
  },

  fetchOrderDetailsForReview: function() {
    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }
    this.setData({ isLoading: true });
    wx.showLoading({ title: '加载订单...' });

    wx.cloud.callFunction({
      name: 'orders', 
      data: {
        action: 'getDetailForReview', 
        orderId: this.data.orderId
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.orderItems) {
          const orderItems = res.result.data.orderItems;
          const reviewsData = orderItems.map(item => ({
            productId: item.productId,
            productName: item.productName,
            productImage: item.productImage,
            rating: 5, 
            ratingText: '非常满意', 
            content: '',
            images: [], 
            tempImages: [], 
            canSubmit: false 
          }));
          this.setData({
            orderDetail: res.result.data, 
            reviewsData: reviewsData,
            isLoading: false
          });
        } else {
          util.showError((res.result && res.result.message) || '获取订单信息失败');
          this.setData({ isLoading: false });
          // setTimeout(() => { wx.navigateBack(); }, 1500);
        }
      },
      fail: (err) => {
        console.error("[fetchOrderDetailsForReview] 调用云函数 orders (getDetailForReview) 失败:", err);
        util.showError('网络请求失败');
        this.setData({ isLoading: false });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  setRating: function(e) {
    const index = e.currentTarget.dataset.index; 
    const rating = parseInt(e.currentTarget.dataset.rating);
    let ratingText = '';
    switch (rating) {
      case 1: ratingText = '非常差'; break;
      case 2: ratingText = '较差'; break;
      case 3: ratingText = '一般'; break;
      case 4: ratingText = '满意'; break;
      case 5: ratingText = '非常满意'; break;
      default: ratingText = '非常满意'; 
    }
    const currentReviewData = this.data.reviewsData[index];
    currentReviewData.rating = rating;
    currentReviewData.ratingText = ratingText;
    this.setData({
      [`reviewsData[${index}]`]: currentReviewData 
    });
    this.checkCanSubmit(index); 
  },

  inputContent: function(e) {
    const index = e.currentTarget.dataset.index;
    const content = e.detail.value;
    const currentReviewData = this.data.reviewsData[index];
    currentReviewData.content = content;
    this.setData({
      [`reviewsData[${index}]`]: currentReviewData
    });
    this.checkCanSubmit(index);
  },

  chooseImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const currentReviewData = this.data.reviewsData[index];
    const count = 6 - currentReviewData.tempImages.length; 
    if (count <= 0) {
      util.showError("最多上传6张图片");
      return;
    }
    wx.chooseMedia({
      count: count,
      mediaType: ['image'],
      sizeType: ['compressed'], 
      sourceType: ['album', 'camera'],
      success: res => {
        const tempFilePaths = res.tempFiles.map(file => file.tempFilePath);
        currentReviewData.tempImages = currentReviewData.tempImages.concat(tempFilePaths);
        this.setData({
          [`reviewsData[${index}]`]: currentReviewData
        });
      },
      fail: err => {
        if (err.errMsg !== "chooseMedia:fail cancel") {
            util.showError("选择图片失败");
        }
      }
    });
  },

  deleteImage: function(e) {
    const reviewIndex = e.currentTarget.dataset.reviewindex; 
    const imageIndex = e.currentTarget.dataset.imageindex; 
    const currentReviewData = this.data.reviewsData[reviewIndex];
    currentReviewData.tempImages.splice(imageIndex, 1);
    this.setData({
      [`reviewsData[${reviewIndex}]`]: currentReviewData
    });
  },

  switchAnonymous: function(e) {
    this.setData({ isAnonymous: e.detail.value });
  },

  checkCanSubmit: function(index) {
    const reviewItem = this.data.reviewsData[index];
    reviewItem.canSubmit = reviewItem.rating > 0 && reviewItem.content.trim().length > 0;
    this.setData({
      [`reviewsData[${index}]`]: reviewItem
    });
  },

  uploadItemImages: function(reviewItemIndex) {
    return new Promise(async (resolve, reject) => {
      const reviewItem = this.data.reviewsData[reviewItemIndex];
      if (!reviewItem.tempImages || reviewItem.tempImages.length === 0) {
        resolve([]); 
        return;
      }
      const uploadedFileIDs = [];
      try {
        for (const tempFilePath of reviewItem.tempImages) {
          const timestamp = Date.now();
          const randomSuffix = Math.floor(Math.random() * 1000);
          const cloudPath = `reviews/${app.globalData.openid}/${this.data.orderId}/${reviewItem.productId}_${timestamp}_${randomSuffix}${tempFilePath.match(/\.\w+$/)[0]}`;
          const uploadResult = await wx.cloud.uploadFile({
            cloudPath: cloudPath, 
            filePath: tempFilePath, 
          });
          uploadedFileIDs.push(uploadResult.fileID); 
        }
        resolve(uploadedFileIDs);
      } catch (err) {
        console.error(`商品 [${reviewItem.productName}] 图片上传失败:`, err);
        util.showError(`商品 "${reviewItem.productName}" 的部分图片上传失败`);
        resolve(uploadedFileIDs); 
      }
    });
  },

  submitReview: async function() {
    if (this.data.isSubmitting) return;
    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }

    const reviewsToSubmitDirectly = this.data.reviewsData.filter(r => r.canSubmit);
    if (reviewsToSubmitDirectly.length === 0) {
      util.showError('请至少完成一项商品的评价');
      return;
    }

    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '提交评价中...', mask: true });

    try {
      const submittedReviewsPayload = [];
      let allUploadsSuccessful = true;

      for (let i = 0; i < this.data.reviewsData.length; i++) {
        const reviewItem = this.data.reviewsData[i];
        if (reviewItem.canSubmit) { 
          let uploadedImageIDs = [];
          if (reviewItem.tempImages && reviewItem.tempImages.length > 0) {
             wx.showLoading({ title: `上传"${reviewItem.productName}"图片...`, mask: true });
            uploadedImageIDs = await this.uploadItemImages(i); 
            wx.hideLoading(); 
            if (uploadedImageIDs.length !== reviewItem.tempImages.length) {
                allUploadsSuccessful = false; 
            }
          }
          submittedReviewsPayload.push({
            productId: reviewItem.productId,
            productName: reviewItem.productName, // 添加商品名快照
            productImage: reviewItem.productImage, // 添加商品图片快照
            rating: reviewItem.rating,
            content: reviewItem.content,
            images: uploadedImageIDs, 
          });
        }
      }
      
      if (submittedReviewsPayload.length === 0 && reviewsToSubmitDirectly.length > 0 ) {
           util.showError('图片上传失败，无法提交评价');
           this.setData({ isSubmitting: false });
           wx.hideLoading(); 
           return;
      }
      if (!allUploadsSuccessful) {
          util.showError('部分图片上传失败，评价仍会提交。');
      }

      wx.cloud.callFunction({
        name: 'review', 
        data: {
          action: 'addBatch', 
          orderId: this.data.orderId,
          reviews: submittedReviewsPayload, 
          isAnonymous: this.data.isAnonymous
        },
        success: res => {
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: '评价成功！', icon: 'success', duration: 2000 });
            setTimeout(() => {
              const pages = getCurrentPages();
              const prevPage = pages[pages.length - 2];
              if (prevPage && typeof prevPage.onReviewSubmitted === 'function') {
                  prevPage.onReviewSubmitted(this.data.orderId); 
              }
              wx.navigateBack();
            }, 2000);
          } else {
            util.showError((res.result && res.result.message) || '评价提交失败');
          }
        },
        fail: (err) => {
          util.showError('评价请求失败，请重试');
          console.error("评价提交云函数调用失败:", err);
        },
        complete: () => {
          wx.hideLoading(); 
          this.setData({ isSubmitting: false });
        }
      });

    } catch (error) { 
      wx.hideLoading(); 
      this.setData({ isSubmitting: false });
      console.error("评价流程中发生错误:", error);
    }
  },

  showLoginModal: function() {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      showCancel: false, 
      success: res => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/user/index' });
        }
      }
    });
  }
});