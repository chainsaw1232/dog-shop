// backend_api_examples/favorite_api.js
// 后端API示例代码 - 收藏相关接口
// 文件路径: /server/controllers/favoriteController.js

const Favorite = require('../models/Favorite');
const Product = require('../models/Product');
const User = require('../models/User');

/**
 * 获取收藏列表
 * @route GET /api/favorite/list
 * @param {string} openid - 用户openid
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 */
exports.getFavoriteList = async (req, res) => {
  try {
    const { openid, page = 1, pageSize = 10 } = req.query;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 计算总数
    const total = await Favorite.countDocuments({ userId: user._id });
    
    // 查询收藏列表
    const favorites = await Favorite.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .populate('productId', 'name imageUrl price originalPrice sales');
    
    // 格式化收藏数据
    const formattedFavorites = favorites.map(favorite => ({
      id: favorite._id,
      productId: favorite.productId._id,
      productName: favorite.productId.name,
      productImage: favorite.productId.imageUrl,
      price: favorite.productId.price,
      originalPrice: favorite.productId.originalPrice,
      sales: favorite.productId.sales,
      createdAt: favorite.createdAt
    }));
    
    res.json({
      code: 0,
      message: '获取收藏列表成功',
      data: {
        list: formattedFavorites,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取收藏列表失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 添加收藏
 * @route POST /api/favorite/add
 * @param {string} openid - 用户openid
 * @param {string} productId - 商品ID
 */
exports.addFavorite = async (req, res) => {
  try {
    const { openid, productId } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证商品
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(400).json({ code: 1, message: '商品不存在' });
    }
    
    // 检查是否已收藏
    const existingFavorite = await Favorite.findOne({
      userId: user._id,
      productId: product._id
    });
    
    if (existingFavorite) {
      return res.status(400).json({ code: 1, message: '已收藏该商品' });
    }
    
    // 创建收藏
    const favorite = new Favorite({
      userId: user._id,
      productId: product._id
    });
    
    await favorite.save();
    
    res.json({
      code: 0,
      message: '收藏成功',
      data: {
        id: favorite._id
      }
    });
  } catch (error) {
    console.error('添加收藏失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 取消收藏
 * @route POST /api/favorite/delete
 * @param {string} openid - 用户openid
 * @param {string} id - 收藏ID
 */
exports.deleteFavorite = async (req, res) => {
  try {
    const { openid, id } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证收藏
    const favorite = await Favorite.findOne({ _id: id, userId: user._id });
    if (!favorite) {
      return res.status(400).json({ code: 1, message: '收藏不存在' });
    }
    
    // 删除收藏
    await favorite.remove();
    
    res.json({
      code: 0,
      message: '取消收藏成功'
    });
  } catch (error) {
    console.error('取消收藏失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 检查商品是否已收藏
 * @route GET /api/favorite/check
 * @param {string} openid - 用户openid
 * @param {string} productId - 商品ID
 */
exports.checkFavorite = async (req, res) => {
  try {
    const { openid, productId } = req.query;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证商品
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(400).json({ code: 1, message: '商品不存在' });
    }
    
    // 检查是否已收藏
    const favorite = await Favorite.findOne({
      userId: user._id,
      productId: product._id
    });
    
    res.json({
      code: 0,
      message: '检查成功',
      data: {
        isFavorite: !!favorite,
        favoriteId: favorite ? favorite._id : null
      }
    });
  } catch (error) {
    console.error('检查收藏失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};
