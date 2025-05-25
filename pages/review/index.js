// pages/review/index.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    orderId: '',
    orderDetail: null, // 用于显示待评价的商品
    reviewsData: [], // 结构: [{ productId: '', productName: '', productImage: '', rating: 5, content: '', images: [], tempImages: [], canSubmit: false }]
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
      name: 'orders', // 假设 'orders' 云函数可以提供评价所需的订单详情
      data: {
        action: 'getDetailForReview', // 此 action 需要在 'orders' 云函数中实现
        orderId: this.data.orderId
        // openid 会通过云函数上下文自动传递
      },
      success: res => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.orderItems) {
          const orderItems = res.result.data.orderItems;
          const reviewsData = orderItems.map(item => ({
            productId: item.productId,
            productName: item.productName,
            productImage: item.productImage, // 确保这个字段在 orderItems 中存在且路径正确
            rating: 5, // 默认5星好评
            ratingText: '非常满意', // 默认评分文字
            content: '',
            images: [], // 用于存储上传后的云文件 ID (fileID)
            tempImages: [], // 用于存储本地临时图片路径，方便预览
            canSubmit: false // 是否可以提交此项评价
          }));
          this.setData({
            orderDetail: res.result.data, // 包含 orderId, orderNo, orderItems 等
            reviewsData: reviewsData,
            isLoading: false
          });
        } else {
          util.showError((res.result && res.result.message) || '获取订单信息失败');
          this.setData({ isLoading: false });
          // 可以考虑是否需要自动返回上一页
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
    const index = e.currentTarget.dataset.index; // 获取是哪个商品的评价
    const rating = parseInt(e.currentTarget.dataset.rating);
    let ratingText = '';
    switch (rating) {
      case 1: ratingText = '非常差'; break;
      case 2: ratingText = '较差'; break;
      case 3: ratingText = '一般'; break;
      case 4: ratingText = '满意'; break;
      case 5: ratingText = '非常满意'; break;
      default: ratingText = '非常满意'; // 默认情况
    }
    const currentReviewData = this.data.reviewsData[index];
    currentReviewData.rating = rating;
    currentReviewData.ratingText = ratingText;
    this.setData({
      [`reviewsData[${index}]`]: currentReviewData // 更新特定商品的评价数据
    });
    this.checkCanSubmit(index); // 检查此项评价是否可以提交
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
    const count = 6 - currentReviewData.tempImages.length; // 最多上传6张图片
    if (count <= 0) {
      util.showError("最多上传6张图片");
      return;
    }
    wx.chooseMedia({
      count: count,
      mediaType: ['image'],
      sizeType: ['compressed'], // 建议压缩
      sourceType: ['album', 'camera'],
      success: res => {
        const tempFilePaths = res.tempFiles.map(file => file.tempFilePath);
        currentReviewData.tempImages = currentReviewData.tempImages.concat(tempFilePaths);
        this.setData({
          [`reviewsData[${index}]`]: currentReviewData
        });
        this.checkCanSubmit(index); // 图片变化也可能影响提交状态（如果未来有图片必填逻辑）
      },
      fail: err => {
        console.log("选择图片失败", err);
        if (err.errMsg !== "chooseMedia:fail cancel") {
            util.showError("选择图片失败");
        }
      }
    });
  },

  deleteImage: function(e) {
    const reviewIndex = e.currentTarget.dataset.reviewindex; // 评价项的索引
    const imageIndex = e.currentTarget.dataset.imageindex; // 图片在 tempImages 中的索引
    const currentReviewData = this.data.reviewsData[reviewIndex];
    currentReviewData.tempImages.splice(imageIndex, 1);
    // 如果 images 数组 (fileIDs) 也需要同步删除，可以在这里处理，
    // 但通常 tempImages 是上传前的主要操作对象。
    this.setData({
      [`reviewsData[${reviewIndex}]`]: currentReviewData
    });
  },

  switchAnonymous: function(e) {
    this.setData({ isAnonymous: e.detail.value });
  },

  checkCanSubmit: function(index) {
    const reviewItem = this.data.reviewsData[index];
    // 评价内容非空且评分大于0才能提交
    reviewItem.canSubmit = reviewItem.rating > 0 && reviewItem.content.trim().length > 0;
    this.setData({
      [`reviewsData[${index}]`]: reviewItem
    });
  },

  // 为单个评价项上传图片到云存储
  uploadItemImages: function(reviewItemIndex) {
    return new Promise(async (resolve, reject) => {
      const reviewItem = this.data.reviewsData[reviewItemIndex];
      if (!reviewItem.tempImages || reviewItem.tempImages.length === 0) {
        resolve([]); // 没有图片需要上传
        return;
      }

      // 为了用户体验，上传过程可以更细致地提示，这里简化处理
      // wx.showLoading({ title: `上传图片中(${reviewItem.productName})...`, mask: true });
      const uploadedFileIDs = [];
      try {
        for (const tempFilePath of reviewItem.tempImages) {
          const timestamp = Date.now();
          const randomSuffix = Math.floor(Math.random() * 1000);
          // 构建一个唯一的云存储路径
          const cloudPath = `reviews/${app.globalData.openid}/${this.data.orderId}/${reviewItem.productId}_${timestamp}_${randomSuffix}${tempFilePath.match(/\.\w+$/)[0]}`;

          const uploadResult = await wx.cloud.uploadFile({
            cloudPath: cloudPath, // 上传至云端的路径
            filePath: tempFilePath, // 小程序临时文件路径
          });
          uploadedFileIDs.push(uploadResult.fileID); // 保存云文件 ID
        }
        // wx.hideLoading(); // 如果在循环外统一显示 loading，则在这里隐藏
        resolve(uploadedFileIDs);
      } catch (err) {
        // wx.hideLoading();
        console.error(`商品 [${reviewItem.productName}] 图片上传失败:`, err);
        // 不直接 reject，而是允许部分成功，或者在 submitReview 中统一处理错误
        // 这里选择 resolve 空数组或部分成功的数组，让 submitReview 决定如何处理
        // 如果希望任何一张图片上传失败都中止，则 reject(err)
        util.showError(`商品 "${reviewItem.productName}" 的部分图片上传失败`);
        resolve(uploadedFileIDs); // 返回已成功上传的，或者空数组
      }
    });
  },

  submitReview: async function() {
    if (this.data.isSubmitting) return;
    if (!app.globalData.openid) {
      this.showLoginModal();
      return;
    }

    // 筛选出用户实际填写并可以提交的评价
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
        if (reviewItem.canSubmit) { // 只处理用户实际操作过的、可提交的评价
          let uploadedImageIDs = [];
          if (reviewItem.tempImages && reviewItem.tempImages.length > 0) {
            // 显示单项上传提示
             wx.showLoading({ title: `上传"${reviewItem.productName}"图片...`, mask: true });
            uploadedImageIDs = await this.uploadItemImages(i); // 为当前评价项上传图片
            wx.hideLoading(); // 隐藏单项上传提示
            if (uploadedImageIDs.length !== reviewItem.tempImages.length) {
                allUploadsSuccessful = false; // 标记有图片上传失败
                // 可以选择是否中止，或继续提交其他评价
                // util.showError(`商品 "${reviewItem.productName}" 的部分图片上传失败，该评价可能不含图片。`);
            }
          }
          submittedReviewsPayload.push({
            productId: reviewItem.productId,
            rating: reviewItem.rating,
            content: reviewItem.content,
            images: uploadedImageIDs, // 使用从云存储获取的 fileID 数组
          });
        }
      }
      
      // 如果没有任何评价内容（比如所有图片都上传失败了，虽然前面有检查canSubmit）
      if (submittedReviewsPayload.length === 0 && reviewsToSubmitDirectly.length > 0 ) {
           util.showError('图片上传失败，无法提交评价');
           this.setData({ isSubmitting: false });
           wx.hideLoading(); // 隐藏总的提交loading
           return;
      }
      if (!allUploadsSuccessful) {
          // 如果有图片上传失败，给用户一个提示，但仍然尝试提交文本内容和其他成功上传的图片
          util.showError('部分图片上传失败，评价仍会提交。');
      }


      // 调用云函数提交所有处理过的评价
      wx.cloud.callFunction({
        name: 'review', // 你的评价云函数名称
        data: {
          action: 'addBatch', // 假设云函数有此 action 处理批量评价
          orderId: this.data.orderId,
          reviews: submittedReviewsPayload, // 包含所有有效评价的数组
          isAnonymous: this.data.isAnonymous
          // openid 会通过云函数上下文自动传递
        },
        success: res => {
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: '评价成功！', icon: 'success', duration: 2000 });
            // 评价成功后，可以通知上一个页面（订单详情或订单列表）刷新状态
            setTimeout(() => {
              const pages = getCurrentPages();
              const prevPage = pages[pages.length - 2];
              if (prevPage && typeof prevPage.onReviewSubmitted === 'function') {
                  prevPage.onReviewSubmitted(this.data.orderId); // 通知上一页评价已提交
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
          wx.hideLoading(); // 隐藏总的提交loading
          this.setData({ isSubmitting: false });
        }
      });

    } catch (error) { // 主要捕获 uploadItemImages 内部如果 reject 的情况
      wx.hideLoading(); // 确保隐藏总的提交loading
      this.setData({ isSubmitting: false });
      // util.showError('图片上传遇到问题，请重试'); // uploadItemImages 内部可能已经提示
      console.error("评价流程中发生错误:", error);
    }
  },

  showLoginModal: function() {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      confirmText: '去登录',
      showCancel: false, // 可以不显示取消，强制去登录
      success: res => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/user/index' });
        }
        // 如果用户选择不登录，可能需要禁用提交按钮或返回上一页
        // else { wx.navigateBack(); }
      }
    });
  }
});
