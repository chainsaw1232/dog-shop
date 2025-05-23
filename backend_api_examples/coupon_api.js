// backend_api_examples/coupon_api.js
// 后端API示例代码 - 优惠券相关接口
// 文件路径: /server/controllers/couponController.js

const Coupon = require('../models/Coupon');
const User = require('../models/User');

/**
 * 获取优惠券列表
 * @route GET /api/coupon/list
 * @param {string} openid - 用户openid
 * @param {string} status - 优惠券状态：available, used, expired
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 */
exports.getCouponList = async (req, res) => {
  try {
    const { openid, status = 'available', page = 1, pageSize = 10 } = req.query;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 构建查询条件
    const query = { userId: user._id };
    
    // 根据状态过滤
    if (status === 'available') {
      query.status = 'available';
      query.endTime = { $gt: new Date() };
    } else if (status === 'used') {
      query.status = 'used';
    } else if (status === 'expired') {
      query.$or = [
        { status: 'available', endTime: { $lte: new Date() } },
        { status: 'expired' }
      ];
    }
    
    // 计算总数
    const total = await Coupon.countDocuments(query);
    
    // 查询优惠券
    const coupons = await Coupon.find(query)
      .sort({ endTime: 1 })
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize));
    
    // 格式化优惠券数据
    const formattedCoupons = coupons.map(coupon => {
      // 检查是否已过期但状态仍为可用
      let couponStatus = coupon.status;
      if (couponStatus === 'available' && coupon.endTime < new Date()) {
        couponStatus = 'expired';
      }
      
      return {
        id: coupon._id,
        name: coupon.name,
        amount: coupon.amount,
        minAmount: coupon.minAmount,
        scope: coupon.scope,
        validityPeriod: `${coupon.startTime.toLocaleDateString()} - ${coupon.endTime.toLocaleDateString()}`,
        status: couponStatus
      };
    });
    
    res.json({
      code: 0,
      message: '获取优惠券列表成功',
      data: {
        list: formattedCoupons,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取优惠券列表失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 领取优惠券
 * @route POST /api/coupon/receive
 * @param {string} openid - 用户openid
 * @param {string} couponId - 优惠券ID
 */
exports.receiveCoupon = async (req, res) => {
  try {
    const { openid, couponId } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 查询优惠券模板
    const couponTemplate = await CouponTemplate.findById(couponId);
    if (!couponTemplate) {
      return res.status(400).json({ code: 1, message: '优惠券不存在' });
    }
    
    // 检查优惠券是否可领取
    if (couponTemplate.status !== 'active') {
      return res.status(400).json({ code: 1, message: '该优惠券已下架' });
    }
    
    if (couponTemplate.startTime > new Date()) {
      return res.status(400).json({ code: 1, message: '该优惠券领取时间未开始' });
    }
    
    if (couponTemplate.endTime < new Date()) {
      return res.status(400).json({ code: 1, message: '该优惠券领取时间已结束' });
    }
    
    if (couponTemplate.quantity <= 0) {
      return res.status(400).json({ code: 1, message: '该优惠券已被领完' });
    }
    
    // 检查用户是否已领取过该优惠券
    const existingCoupon = await Coupon.findOne({
      userId: user._id,
      templateId: couponTemplate._id
    });
    
    if (existingCoupon) {
      return res.status(400).json({ code: 1, message: '您已领取过该优惠券' });
    }
    
    // 计算有效期
    const startTime = new Date();
    const endTime = new Date();
    endTime.setDate(endTime.getDate() + couponTemplate.validDays);
    
    // 创建用户优惠券
    const coupon = new Coupon({
      userId: user._id,
      templateId: couponTemplate._id,
      name: couponTemplate.name,
      amount: couponTemplate.amount,
      minAmount: couponTemplate.minAmount,
      scope: couponTemplate.scope,
      startTime,
      endTime,
      status: 'available'
    });
    
    await coupon.save();
    
    // 更新优惠券模板数量
    couponTemplate.quantity -= 1;
    await couponTemplate.save();
    
    res.json({
      code: 0,
      message: '领取优惠券成功',
      data: {
        id: coupon._id,
        name: coupon.name,
        amount: coupon.amount,
        minAmount: coupon.minAmount,
        scope: coupon.scope,
        validityPeriod: `${startTime.toLocaleDateString()} - ${endTime.toLocaleDateString()}`,
        status: 'available'
      }
    });
  } catch (error) {
    console.error('领取优惠券失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 获取可用优惠券
 * @route GET /api/coupon/available
 * @param {string} openid - 用户openid
 * @param {number} amount - 订单金额
 */
exports.getAvailableCoupons = async (req, res) => {
  try {
    const { openid, amount } = req.query;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 查询可用优惠券
    const coupons = await Coupon.find({
      userId: user._id,
      status: 'available',
      minAmount: { $lte: amount },
      endTime: { $gt: new Date() }
    }).sort({ amount: -1 });
    
    // 格式化优惠券数据
    const formattedCoupons = coupons.map(coupon => ({
      id: coupon._id,
      name: coupon.name,
      amount: coupon.amount,
      minAmount: coupon.minAmount,
      scope: coupon.scope,
      validityPeriod: `${coupon.startTime.toLocaleDateString()} - ${coupon.endTime.toLocaleDateString()}`,
      status: 'available'
    }));
    
    res.json({
      code: 0,
      message: '获取可用优惠券成功',
      data: formattedCoupons
    });
  } catch (error) {
    console.error('获取可用优惠券失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};
