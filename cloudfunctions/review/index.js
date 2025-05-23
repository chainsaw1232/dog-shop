// 云函数入口文件 for address
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 添加新地址
 * 
 * @param {object} event - 包含地址信息和用户openid
 * @param {string} event.openid - 用户的OpenID
 * @param {object} event.addressInfo - 地址信息对象
 * @param {string} event.addressInfo.name - 收件人姓名
 * @param {string} event.addressInfo.phone - 联系电话
 * @param {string} event.addressInfo.province - 省份
 * @param {string} event.addressInfo.city - 城市
 * @param {string} event.addressInfo.district - 区/县
 * @param {string} event.addressInfo.detail - 详细地址
 * @param {string} [event.addressInfo.tag] - 地址标签，如"家"、"公司"
 * @param {boolean} [event.addressInfo.isDefault=false] - 是否设为默认地址
 * 
 * @returns {object} 返回结果对象
 * @returns {number} result.code - 状态码，200表示成功
 * @returns {string} result.message - 状态描述
 * @returns {object} [result.data] - 成功时返回的数据，包含新增地址信息
 * @returns {object} [result.error] - 失败时的错误信息
 */
async function internalAddAddress(event) {
  const { addressInfo, openid } = event; // openid 由主函数传入
  if (!openid || !addressInfo || !addressInfo.name || !addressInfo.phone || !addressInfo.province || !addressInfo.city || !addressInfo.district || !addressInfo.detail) {
    return { code: 400, message: '参数不完整或无效 (openid 或地址信息缺失)' };
  }
  try {
    const now = new Date();
    const newAddress = {
      _openid: openid, name: addressInfo.name, phone: addressInfo.phone, province: addressInfo.province, city: addressInfo.city,
      district: addressInfo.district, detail: addressInfo.detail, tag: addressInfo.tag || '', isDefault: addressInfo.isDefault || false,
      createTime: now, updateTime: now,
    };
    if (newAddress.isDefault) {
      await db.collection('address').where({ _openid: openid, isDefault: true }).update({ data: { isDefault: false, updateTime: new Date() } });
    }
    const res = await db.collection('address').add({ data: newAddress });
    return { code: 200, message: '地址添加成功', data: { _id: res._id, ...newAddress } };
  } catch (e) { console.error('internalAddAddress error:', e); return { code: 500, message: '数据库操作失败', error: e }; }
}

/**
 * 获取用户地址列表
 * 
 * @param {object} event - 包含用户openid
 * @param {string} event.openid - 用户的OpenID
 * 
 * @returns {object} 返回结果对象
 * @returns {number} result.code - 状态码，200表示成功
 * @returns {string} result.message - 状态描述
 * @returns {Array} [result.data] - 成功时返回的地址列表数组
 * @returns {object} [result.error] - 失败时的错误信息
 */
async function internalListAddresses(event) {
  const { openid } = event;
  if (!openid) { return { code: 400, message: '用户信息缺失 (openid)' }; }
  try {
    const res = await db.collection('address').where({ _openid: openid }).orderBy('updateTime', 'desc').get();
    return { code: 200, message: '获取地址列表成功', data: res.data };
  } catch (e) { console.error('internalListAddresses error:', e); return { code: 500, message: '数据库查询失败', error: e }; }
}

/**
 * 更新地址信息
 * 
 * @param {object} event - 包含地址ID、更新内容和用户openid
 * @param {string} event.openid - 用户的OpenID
 * @param {string} event.addressId - 要更新的地址ID
 * @param {object} event.updates - 要更新的地址字段
 * @param {string} [event.updates.name] - 收件人姓名
 * @param {string} [event.updates.phone] - 联系电话
 * @param {string} [event.updates.province] - 省份
 * @param {string} [event.updates.city] - 城市
 * @param {string} [event.updates.district] - 区/县
 * @param {string} [event.updates.detail] - 详细地址
 * @param {string} [event.updates.tag] - 地址标签
 * @param {boolean} [event.updates.isDefault] - 是否设为默认地址
 * 
 * @returns {object} 返回结果对象
 * @returns {number} result.code - 状态码，200表示成功，404表示未找到地址
 * @returns {string} result.message - 状态描述
 * @returns {object} [result.error] - 失败时的错误信息
 */
async function internalUpdateAddress(event) {
  const { addressId, updates, openid } = event;
  if (!openid || !addressId || !updates) { return { code: 400, message: '参数不完整或无效 (openid, addressId 或 updates 缺失)' }; }
  try {
    const addressToUpdate = { ...updates }; delete addressToUpdate._id; delete addressToUpdate._openid; addressToUpdate.updateTime = new Date();
    if (updates.isDefault === true) {
      await db.collection('address').where({ _openid: openid, isDefault: true, _id: _.neq(addressId) }).update({ data: { isDefault: false, updateTime: new Date() } });
    }
    const res = await db.collection('address').doc(addressId).update({ data: addressToUpdate });
    if (res.stats.updated > 0) { return { code: 200, message: '地址更新成功' }; }
    else { return { code: 404, message: '未找到对应地址或无需更新' }; }
  } catch (e) { console.error('internalUpdateAddress error:', e); return { code: 500, message: '数据库操作失败', error: e }; }
}

/**
 * 删除地址
 * 
 * @param {object} event - 包含地址ID和用户openid
 * @param {string} event.openid - 用户的OpenID
 * @param {string} event.addressId - 要删除的地址ID
 * 
 * @returns {object} 返回结果对象
 * @returns {number} result.code - 状态码，200表示成功，403表示无权限，404表示未找到
 * @returns {string} result.message - 状态描述
 * @returns {object} [result.error] - 失败时的错误信息
 */
async function internalDeleteAddress(event) {
  const { addressId, openid } = event;
  if (!openid || !addressId) { return { code: 400, message: '参数不完整或无效 (openid 或 addressId 缺失)' }; }
  try {
    const addressRecord = await db.collection('address').doc(addressId).get();
    if (!addressRecord.data || addressRecord.data._openid !== openid) { return { code: 403, message: '无权删除该地址或地址不存在' }; }
    const res = await db.collection('address').doc(addressId).remove();
    if (res.stats.removed > 0) { return { code: 200, message: '地址删除成功' }; }
    else { return { code: 404, message: '未找到对应地址' }; }
  } catch (e) { console.error('internalDeleteAddress error:', e); return { code: 500, message: '数据库操作失败', error: e }; }
}

/**
 * 设置默认地址
 * 
 * @param {object} event - 包含地址ID和用户openid
 * @param {string} event.openid - 用户的OpenID
 * @param {string} event.addressId - 要设为默认的地址ID
 * 
 * @returns {object} 返回结果对象
 * @returns {number} result.code - 状态码，200表示成功，404表示未找到
 * @returns {string} result.message - 状态描述
 * @returns {object} [result.error] - 失败时的错误信息
 */
async function internalSetDefaultAddress(event) {
  const { addressId, openid } = event;
  if (!openid || !addressId) { return { code: 400, message: '参数不完整或无效 (openid 或 addressId 缺失)' }; }
  try {
    await db.collection('address').where({ _openid: openid }).update({ data: { isDefault: false, updateTime: new Date() } });
    const res = await db.collection('address').doc(addressId).update({ data: { isDefault: true, updateTime: new Date() } });
    if (res.stats.updated > 0) { return { code: 200, message: '默认地址设置成功' }; }
    else { return { code: 404, message: '未找到对应地址或设置失败' }; }
  } catch (e) { console.error('internalSetDefaultAddress error:', e); return { code: 500, message: '数据库操作失败', error: e }; }
}

/**
 * 地址管理主函数，根据 action 分发任务
 * 
 * @param {object} event - 前端调用时传递的参数
 * @param {string} event.action - 操作类型，支持 'add', 'list', 'update', 'delete', 'setDefault'
 * @param {string} event.openid - 用户的OpenID
 * @param {object} [event.addressInfo] - 添加地址时的地址信息
 * @param {string} [event.addressId] - 操作特定地址时的地址ID
 * @param {object} [event.updates] - 更新地址时的更新内容
 * @param {object} context - 云函数上下文
 * 
 * @returns {object} 返回结果对象，具体结构取决于各个内部函数
 * 
 * @example
 * // 前端添加地址示例
 * wx.cloud.callFunction({
 *   name: 'address',
 *   data: {
 *     action: 'add',
 *     openid: 'user_openid',
 *     addressInfo: {
 *       name: '张三',
 *       phone: '13800138000',
 *       province: '北京市',
 *       city: '北京市',
 *       district: '海淀区',
 *       detail: '中关村大街1号',
 *       isDefault: true,
 *       tag: '公司'
 *     }
 *   }
 * });
 */
exports.main = async (event, context) => {
  const { action, openid, ...restEventData } = event;

  // 对于所有地址操作，几乎都需要 openid
  if (!openid && action !== 'getPublicAddressConfig') { // 假设一个不需要openid的例外
    console.error('Address function called without openid for action:', action);
    return { code: 401, message: '操作地址簿需要有效的 OpenID (address cloud function)' };
  }

  // 将 openid 和剩余参数传递给内部函数
  const callEvent = { openid, ...restEventData };

  console.log(`Address function called with action: ${action}, openid: ${openid ? 'present' : 'missing'}`);

  switch (action) {
    case 'add':
      return internalAddAddress(callEvent);
    case 'list':
      return internalListAddresses(callEvent);
    case 'update':
      return internalUpdateAddress(callEvent);
    case 'delete':
      return internalDeleteAddress(callEvent);
    case 'setDefault':
      return internalSetDefaultAddress(callEvent);
    default:
      console.warn(`Address function called with unsupported action: ${action}`);
      return { code: 400, message: `地址操作不支持的 action: ${action} (address cloud function)` };
  }
};
