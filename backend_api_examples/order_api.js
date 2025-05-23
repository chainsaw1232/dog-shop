// backend_api_examples/order_api.js
// 后端API示例代码 - 订单相关接口
// 文件路径: /server/controllers/orderController.js

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Address = require('../models/Address');
const Coupon = require('../models/Coupon');
const { generateOrderNumber } = require('../utils/orderUtils');

/**
 * 创建订单
 * @route POST /api/order/create
 * @param {string} openid - 用户openid
 * @param {array} products - 商品列表，包含productId, specId, quantity
 * @param {string} addressId - 收货地址ID
 * @param {string} couponId - 优惠券ID（可选）
 * @param {string} remark - 订单备注（可选）
 */
exports.createOrder = async (req, res) => {
  try {
    const { openid, products, addressId, couponId, remark } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证地址
    const address = await Address.findById(addressId);
    if (!address || address.userId.toString() !== user._id.toString()) {
      return res.status(400).json({ code: 1, message: '收货地址无效' });
    }
    
    // 验证商品
    let productAmount = 0;
    const orderProducts = [];
    
    for (const item of products) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ code: 1, message: '商品不存在' });
      }
      
      // 验证规格
      let price = product.price;
      let specName = '';
      
      if (item.specId) {
        const spec = product.specs.find(s => s._id.toString() === item.specId);
        if (!spec) {
          return res.status(400).json({ code: 1, message: '商品规格不存在' });
        }
        price = spec.price;
        specName = spec.name;
      }
      
      // 验证库存
      if (product.stock < item.quantity) {
        return res.status(400).json({ code: 1, message: `商品 ${product.name} 库存不足` });
      }
      
      // 计算金额
      const itemAmount = price * item.quantity;
      productAmount += itemAmount;
      
      // 添加到订单商品列表
      orderProducts.push({
        productId: product._id,
        name: product.name,
        image: product.imageUrl,
        price: price,
        specId: item.specId || null,
        specName: specName,
        quantity: item.quantity,
        amount: itemAmount
      });
    }
    
    // 计算运费
    const shippingFee = productAmount >= 99 ? 0 : 10;
    
    // 验证优惠券
    let couponAmount = 0;
    if (couponId) {
      const coupon = await Coupon.findOne({
        _id: couponId,
        userId: user._id,
        status: 'available',
        minAmount: { $lte: productAmount }
      });
      
      if (!coupon) {
        return res.status(400).json({ code: 1, message: '优惠券无效或不满足使用条件' });
      }
      
      couponAmount = coupon.amount;
    }
    
    // 计算总金额
    const totalAmount = productAmount + shippingFee - couponAmount;
    
    // 创建订单
    const order = new Order({
      orderNumber: generateOrderNumber(),
      userId: user._id,
      products: orderProducts,
      address: {
        name: address.name,
        phone: address.phone,
        province: address.province,
        city: address.city,
        district: address.district,
        detail: address.detail
      },
      productAmount,
      shippingFee,
      couponAmount,
      totalAmount,
      couponId: couponId || null,
      remark: remark || '',
      status: 'unpaid',
      createTime: new Date()
    });
    
    await order.save();
    
    // 如果使用了优惠券，更新优惠券状态
    if (couponId) {
      await Coupon.findByIdAndUpdate(couponId, { status: 'used', useTime: new Date() });
    }
    
    // 减少商品库存
    for (const item of products) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity, sales: item.quantity } });
    }
    
    res.json({
      code: 0,
      message: '订单创建成功',
      data: {
        id: order._id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount
      }
    });
  } catch (error) {
    console.error('创建订单失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 获取订单列表
 * @route GET /api/order/list
 * @param {string} openid - 用户openid
 * @param {string} status - 订单状态（可选）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 */
exports.getOrderList = async (req, res) => {
  try {
    const { openid, status, page = 1, pageSize = 10 } = req.query;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 构建查询条件
    const query = { userId: user._id };
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // 计算总数
    const total = await Order.countDocuments(query);
    
    // 查询订单
    const orders = await Order.find(query)
      .sort({ createTime: -1 })
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize));
    
    // 格式化订单数据
    const formattedOrders = orders.map(order => ({
      id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      products: order.products,
      totalAmount: order.totalAmount,
      shippingFee: order.shippingFee,
      createTime: order.createTime
    }));
    
    res.json({
      code: 0,
      message: '获取订单列表成功',
      data: {
        list: formattedOrders,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取订单列表失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 获取订单详情
 * @route GET /api/order/detail
 * @param {string} openid - 用户openid
 * @param {string} id - 订单ID
 */
exports.getOrderDetail = async (req, res) => {
  try {
    const { openid, id } = req.query;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 查询订单
    const order = await Order.findOne({ _id: id, userId: user._id });
    if (!order) {
      return res.status(400).json({ code: 1, message: '订单不存在' });
    }
    
    // 查询物流信息
    let logistics = null;
    if (order.status === 'shipped' || order.status === 'completed') {
      logistics = {
        company: order.logistics?.company || '顺丰速运',
        number: order.logistics?.number || '123456789',
        status: order.logistics?.status || '运输中'
      };
    }
    
    // 格式化订单数据
    const orderDetail = {
      id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      products: order.products,
      address: order.address,
      productAmount: order.productAmount,
      shippingFee: order.shippingFee,
      couponAmount: order.couponAmount,
      totalAmount: order.totalAmount,
      remark: order.remark,
      logistics,
      payMethod: order.payMethod || '微信支付',
      createTime: order.createTime,
      payTime: order.payTime,
      shipTime: order.shipTime,
      completeTime: order.completeTime,
      hasReviewed: order.hasReviewed || false
    };
    
    res.json({
      code: 0,
      message: '获取订单详情成功',
      data: orderDetail
    });
  } catch (error) {
    console.error('获取订单详情失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 取消订单
 * @route POST /api/order/cancel
 * @param {string} openid - 用户openid
 * @param {string} id - 订单ID
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { openid, id } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 查询订单
    const order = await Order.findOne({ _id: id, userId: user._id });
    if (!order) {
      return res.status(400).json({ code: 1, message: '订单不存在' });
    }
    
    // 验证订单状态
    if (order.status !== 'unpaid') {
      return res.status(400).json({ code: 1, message: '只能取消未支付的订单' });
    }
    
    // 更新订单状态
    order.status = 'cancelled';
    order.cancelTime = new Date();
    await order.save();
    
    // 恢复商品库存
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, { 
        $inc: { stock: item.quantity, sales: -item.quantity } 
      });
    }
    
    // 恢复优惠券
    if (order.couponId) {
      await Coupon.findByIdAndUpdate(order.couponId, { 
        status: 'available', 
        useTime: null 
      });
    }
    
    res.json({
      code: 0,
      message: '订单取消成功'
    });
  } catch (error) {
    console.error('取消订单失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 支付订单
 * @route POST /api/order/pay
 * @param {string} openid - 用户openid
 * @param {string} id - 订单ID
 */
exports.payOrder = async (req, res) => {
  try {
    const { openid, id } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 查询订单
    const order = await Order.findOne({ _id: id, userId: user._id });
    if (!order) {
      return res.status(400).json({ code: 1, message: '订单不存在' });
    }
    
    // 验证订单状态
    if (order.status !== 'unpaid') {
      return res.status(400).json({ code: 1, message: '订单状态错误' });
    }
    
    // 模拟调用微信支付接口，获取支付参数
    // 实际项目中需要调用微信支付API
    const payParams = {
      timeStamp: '' + Math.floor(Date.now() / 1000),
      nonceStr: Math.random().toString(36).substr(2, 15),
      package: 'prepay_id=wx' + Date.now(),
      signType: 'MD5',
      paySign: 'simulated_pay_sign'
    };
    
    res.json({
      code: 0,
      message: '获取支付参数成功',
      data: payParams
    });
    
    // 注意：实际支付成功后，需要在支付回调中更新订单状态
    // 这里为了演示，直接更新订单状态
    setTimeout(async () => {
      order.status = 'unshipped';
      order.payTime = new Date();
      order.payMethod = '微信支付';
      await order.save();
    }, 5000);
    
  } catch (error) {
    console.error('支付订单失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 确认收货
 * @route POST /api/order/confirm
 * @param {string} openid - 用户openid
 * @param {string} id - 订单ID
 */
exports.confirmOrder = async (req, res) => {
  try {
    const { openid, id } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 查询订单
    const order = await Order.findOne({ _id: id, userId: user._id });
    if (!order) {
      return res.status(400).json({ code: 1, message: '订单不存在' });
    }
    
    // 验证订单状态
    if (order.status !== 'shipped') {
      return res.status(400).json({ code: 1, message: '订单状态错误' });
    }
    
    // 更新订单状态
    order.status = 'completed';
    order.completeTime = new Date();
    await order.save();
    
    res.json({
      code: 0,
      message: '确认收货成功'
    });
  } catch (error) {
    console.error('确认收货失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};
