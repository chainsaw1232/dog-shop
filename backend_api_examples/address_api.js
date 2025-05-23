// backend_api_examples/address_api.js
// 后端API示例代码 - 地址相关接口
// 文件路径: /server/controllers/addressController.js

const Address = require('../models/Address');
const User = require('../models/User');

/**
 * 获取地址列表
 * @route GET /api/address/list
 * @param {string} openid - 用户openid
 */
exports.getAddressList = async (req, res) => {
  try {
    const { openid } = req.query;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 查询地址列表
    const addresses = await Address.find({ userId: user._id }).sort({ isDefault: -1, updatedAt: -1 });
    
    res.json({
      code: 0,
      message: '获取地址列表成功',
      data: addresses
    });
  } catch (error) {
    console.error('获取地址列表失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 添加地址
 * @route POST /api/address/add
 * @param {string} openid - 用户openid
 * @param {string} name - 收货人姓名
 * @param {string} phone - 联系电话
 * @param {string} province - 省份
 * @param {string} city - 城市
 * @param {string} district - 区/县
 * @param {string} detail - 详细地址
 * @param {boolean} isDefault - 是否默认地址
 */
exports.addAddress = async (req, res) => {
  try {
    const { openid, name, phone, province, city, district, detail, isDefault } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证必填字段
    if (!name || !phone || !province || !city || !district || !detail) {
      return res.status(400).json({ code: 1, message: '请填写完整的地址信息' });
    }
    
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ code: 1, message: '手机号格式不正确' });
    }
    
    // 如果设为默认地址，先将其他地址设为非默认
    if (isDefault) {
      await Address.updateMany({ userId: user._id }, { isDefault: false });
    }
    
    // 创建新地址
    const address = new Address({
      userId: user._id,
      name,
      phone,
      province,
      city,
      district,
      detail,
      isDefault: isDefault || false
    });
    
    await address.save();
    
    res.json({
      code: 0,
      message: '添加地址成功',
      data: address
    });
  } catch (error) {
    console.error('添加地址失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 更新地址
 * @route POST /api/address/update
 * @param {string} openid - 用户openid
 * @param {string} id - 地址ID
 * @param {string} name - 收货人姓名
 * @param {string} phone - 联系电话
 * @param {string} province - 省份
 * @param {string} city - 城市
 * @param {string} district - 区/县
 * @param {string} detail - 详细地址
 * @param {boolean} isDefault - 是否默认地址
 */
exports.updateAddress = async (req, res) => {
  try {
    const { openid, id, name, phone, province, city, district, detail, isDefault } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证地址
    const address = await Address.findOne({ _id: id, userId: user._id });
    if (!address) {
      return res.status(400).json({ code: 1, message: '地址不存在' });
    }
    
    // 验证必填字段
    if (!name || !phone || !province || !city || !district || !detail) {
      return res.status(400).json({ code: 1, message: '请填写完整的地址信息' });
    }
    
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ code: 1, message: '手机号格式不正确' });
    }
    
    // 如果设为默认地址，先将其他地址设为非默认
    if (isDefault) {
      await Address.updateMany({ userId: user._id, _id: { $ne: id } }, { isDefault: false });
    }
    
    // 更新地址
    address.name = name;
    address.phone = phone;
    address.province = province;
    address.city = city;
    address.district = district;
    address.detail = detail;
    address.isDefault = isDefault || false;
    
    await address.save();
    
    res.json({
      code: 0,
      message: '更新地址成功',
      data: address
    });
  } catch (error) {
    console.error('更新地址失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 删除地址
 * @route POST /api/address/delete
 * @param {string} openid - 用户openid
 * @param {string} id - 地址ID
 */
exports.deleteAddress = async (req, res) => {
  try {
    const { openid, id } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证地址
    const address = await Address.findOne({ _id: id, userId: user._id });
    if (!address) {
      return res.status(400).json({ code: 1, message: '地址不存在' });
    }
    
    // 删除地址
    await address.remove();
    
    // 如果删除的是默认地址，将最新的地址设为默认
    if (address.isDefault) {
      const latestAddress = await Address.findOne({ userId: user._id }).sort({ updatedAt: -1 });
      if (latestAddress) {
        latestAddress.isDefault = true;
        await latestAddress.save();
      }
    }
    
    res.json({
      code: 0,
      message: '删除地址成功'
    });
  } catch (error) {
    console.error('删除地址失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};

/**
 * 设置默认地址
 * @route POST /api/address/setDefault
 * @param {string} openid - 用户openid
 * @param {string} id - 地址ID
 */
exports.setDefaultAddress = async (req, res) => {
  try {
    const { openid, id } = req.body;
    
    // 验证用户
    const user = await User.findOne({ openid });
    if (!user) {
      return res.status(400).json({ code: 1, message: '用户不存在' });
    }
    
    // 验证地址
    const address = await Address.findOne({ _id: id, userId: user._id });
    if (!address) {
      return res.status(400).json({ code: 1, message: '地址不存在' });
    }
    
    // 将其他地址设为非默认
    await Address.updateMany({ userId: user._id, _id: { $ne: id } }, { isDefault: false });
    
    // 设置当前地址为默认
    address.isDefault = true;
    await address.save();
    
    res.json({
      code: 0,
      message: '设置默认地址成功'
    });
  } catch (error) {
    console.error('设置默认地址失败:', error);
    res.status(500).json({ code: 1, message: '服务器错误' });
  }
};
