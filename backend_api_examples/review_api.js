// backend_api_examples/review_api.js
// 后端API示例代码 - 评价相关接口
// 文件路径: /server/controllers/reviewController.js

const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

/**
 * 添加评价
 * @route POST /api/review/add
 * @param {string} openid - 用户openid
 * @param {string} orderId - 订单ID
 * @param {number} rating - 评分(1-5)
 * @param {string} content - 评价内容
 * @param {array} images - 评价图片
 * @param {boolean} isAnonymous - 是否匿名评价
 */
exports.addReview = async (req, res) => {
  try {
    const { openid, orderId, rating, content, images, isAnonymous } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证订单
    const order = await Order.findOne({ _id: orderId, userId: user._id });
    if (!order) {
      return res.status(400).json({ code: 1, message: '订单不存在' });
    }
    
    // 验证订单状态
    if (order.status !== 'completed') {
      return res.status(400).json({ code: 1, message: '只能评价已完成的订单' });
    }
    
    // 验证是否已评价
    if (order.hasReviewed) {
      return res.status(400).json({ code: 1, message: '该订单已评价' });
    }
    
    // 验证评分
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ code: 1, message: '评分必须在1-5之间' });
    }
    
    // 验证评价内容
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ code: 1, message: '评价内容不能为空' });
    }
    
    // 创建评价
    const reviews = [];
    
    // 为订单中的每个商品创建评价
    for (const item of order.products) {
      const review = new Review({
        userId: user._id,
        orderId: order._id,
        productId: item.productId,
        rating,
        content,
        images: images || [],
        isAnonymous: isAnonymous || false
      });
      
      await review.save();
      reviews.push(review);
      
      // 更新商品评分
      await updateProductRating(item.productId);
    }
    
    // 更新订单评价状态
    order.hasReviewed = true;
    await order.save();
    
    res.json({
      code: 0,
      message: '评价成功',
      data: {
        reviews: reviews.map(review => ({
          id: review._id,
          productId: review.productId,
          rating: review.rating,
          content: review.content,
          images: review.images,
          createdAt: review.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('添加评价失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 获取商品评价列表
 * @route GET /api/review/list
 * @param {string} productId - 商品ID
 * @param {string} type - 评价类型：all, good, medium, bad, hasImage
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 */
exports.getReviewList = async (req, res) => {
  try {
    const { productId, type = 'all', page = 1, pageSize = 10 } = req.query;
    
    // 验证商品
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(400).json({ code: 1, message: '商品不存在' });
    }
    
    // 构建查询条件
    const query = { productId: product._id };
    
    // 根据类型过滤
    if (type === 'good') {
      query.rating = { $gte: 4 };
    } else if (type === 'medium') {
      query.rating = 3;
    } else if (type === 'bad') {
      query.rating = { $lte: 2 };
    } else if (type === 'hasImage') {
      query.images = { $exists: true, $ne: [] };
    }
    
    // 计算总数
    const total = await Review.countDocuments(query);
    
    // 查询评价
    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .populate('userId', 'nickname avatarUrl');
    
    // 格式化评价数据
    const formattedReviews = reviews.map(review => ({
      id: review._id,
      user: review.isAnonymous ? {
        nickname: '匿名用户',
        avatarUrl: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/anonymous_avatar.png'
      } : {
        nickname: review.userId.nickname,
        avatarUrl: review.userId.avatarUrl
      },
      rating: review.rating,
      content: review.content,
      images: review.images,
      createdAt: review.createdAt.toISOString().split('T')[0]
    }));
    
    res.json({
      code: 0,
      message: '获取评价列表成功',
      data: {
        list: formattedReviews,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取评价列表失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 获取商品评价统计
 * @route GET /api/review/stats
 * @param {string} productId - 商品ID
 */
exports.getReviewStats = async (req, res) => {
  try {
    const { productId } = req.query;
    
    // 验证商品
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(400).json({ code: 1, message: '商品不存在' });
    }
    
    // 计算总评价数
    const total = await Review.countDocuments({ productId: product._id });
    
    // 计算好评数（4-5星）
    const goodCount = await Review.countDocuments({ 
      productId: product._id,
      rating: { $gte: 4 }
    });
    
    // 计算中评数（3星）
    const mediumCount = await Review.countDocuments({ 
      productId: product._id,
      rating: 3
    });
    
    // 计算差评数（1-2星）
    const badCount = await Review.countDocuments({ 
      productId: product._id,
      rating: { $lte: 2 }
    });
    
    // 计算有图评价数
    const hasImageCount = await Review.countDocuments({ 
      productId: product._id,
      images: { $exists: true, $ne: [] }
    });
    
    // 计算好评率
    const goodRate = total > 0 ? Math.round((goodCount / total) * 100) : 100;
    
    res.json({
      code: 0,
      message: '获取评价统计成功',
      data: {
        total,
        goodCount,
        mediumCount,
        badCount,
        hasImageCount,
        goodRate,
        avgRating: product.avgRating || 5
      }
    });
  } catch (error) {
    console.error('获取评价统计失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 更新商品评分
 * @param {string} productId - 商品ID
 */
async function updateProductRating(productId) {
  try {
    // 计算平均评分
    const result = await Review.aggregate([
      { $match: { productId } },
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ]);
    
    const avgRating = result.length > 0 ? result[0].avgRating : 5;
    
    // 更新商品评分
    await Product.findByIdAndUpdate(productId, { avgRating });
  } catch (error) {
    console.error('更新商品评分失败:', error);
  }
}
