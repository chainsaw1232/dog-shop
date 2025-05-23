// 云函数入口文件 for address
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 添加新地址
 * 内部函数，由主函数调用
 * @param {object} event - 包含地址信息和用户openid
 * @param {string} event.realOpenid - 【已修改】用户的真实OpenID，由主函数从wxContext获取并传入
 * @param {object} event.addressInfo - 地址信息对象
 */
async function internalAddAddress(event) {
  // 【已修改】从 event 中解构 realOpenid
  const { addressInfo, realOpenid } = event;
  if (!realOpenid || !addressInfo || !addressInfo.name || !addressInfo.phone || !addressInfo.province || !addressInfo.city || !addressInfo.district || !addressInfo.detail) {
    return { code: 400, message: '参数不完整或无效 (openid 或地址信息缺失)' };
  }
  try {
    const now = new Date();
    const newAddress = {
      _openid: realOpenid, // 【已修改】使用真实的 openid
      name: addressInfo.name,
      phone: addressInfo.phone,
      province: addressInfo.province,
      city: addressInfo.city,
      district: addressInfo.district,
      detail: addressInfo.detail,
      tag: addressInfo.tag || '',
      isDefault: addressInfo.isDefault || false,
      createTime: now,
      updateTime: now,
    };
    if (newAddress.isDefault) {
      // 【已修改】更新操作也使用真实的 openid
      await db.collection('address').where({ _openid: realOpenid, isDefault: true }).update({ data: { isDefault: false, updateTime: new Date() } });
    }
    const res = await db.collection('address').add({ data: newAddress });
    return { code: 200, message: '地址添加成功', data: { _id: res._id, ...newAddress } };
  } catch (e) {
    console.error('internalAddAddress error:', e);
    return { code: 500, message: '数据库操作失败(add)', error: e.toString() };
  }
}

/**
 * 获取用户地址列表
 * 内部函数，由主函数调用
 * @param {object} event - 包含用户openid
 * @param {string} event.realOpenid - 【已修改】用户的真实OpenID
 */
async function internalListAddresses(event) {
  const { realOpenid } = event; // 【已修改】
  if (!realOpenid) { return { code: 400, message: '用户信息缺失 (openid)' }; }
  try {
    // 【已修改】使用真实的 openid 查询
    const res = await db.collection('address').where({ _openid: realOpenid }).orderBy('updateTime', 'desc').get();
    return { code: 200, message: '获取地址列表成功', data: res.data };
  } catch (e) {
    console.error('internalListAddresses error:', e);
    return { code: 500, message: '数据库查询失败(list)', error: e.toString() };
  }
}

/**
 * 更新地址信息
 * 内部函数，由主函数调用
 * @param {object} event - 包含地址ID、更新内容和用户openid
 * @param {string} event.realOpenid - 【已修改】用户的真实OpenID
 * @param {string} event.addressId - 要更新的地址ID
 * @param {object} event.updates - 要更新的地址字段
 */
async function internalUpdateAddress(event) {
  const { addressId, updates, realOpenid } = event; // 【已修改】
  if (!realOpenid || !addressId || !updates) { return { code: 400, message: '参数不完整或无效 (openid, addressId 或 updates 缺失)' }; }
  try {
    const addressToUpdate = { ...updates };
    delete addressToUpdate._id;
    delete addressToUpdate._openid; // 确保不会尝试更新 _openid
    addressToUpdate.updateTime = new Date();

    if (updates.isDefault === true) {
      // 【已修改】使用真实的 openid
      await db.collection('address').where({ _openid: realOpenid, isDefault: true, _id: _.neq(addressId) }).update({ data: { isDefault: false, updateTime: new Date() } });
    }
    // 【已修改】确保只更新属于该 openid 的地址
    const res = await db.collection('address').where({ _id: addressId, _openid: realOpenid }).update({ data: addressToUpdate });
    if (res.stats.updated > 0) {
      return { code: 200, message: '地址更新成功' };
    } else {
      // 可能是 addressId 不存在，或者 addressId 存在但不属于此 openid
      const checkExist = await db.collection('address').doc(addressId).get().catch(()=>null);
      if (!checkExist || !checkExist.data) {
        return { code: 404, message: '未找到对应地址' };
      }
      if (checkExist.data._openid !== realOpenid) {
        return { code: 403, message: '无权更新此地址' };
      }
      return { code: 404, message: '未找到对应地址或无需更新' };
    }
  } catch (e) {
    console.error('internalUpdateAddress error:', e);
    return { code: 500, message: '数据库操作失败(update)', error: e.toString() };
  }
}

/**
 * 删除地址
 * 内部函数，由主函数调用
 * @param {object} event - 包含地址ID和用户openid
 * @param {string} event.realOpenid - 【已修改】用户的真实OpenID
 * @param {string} event.addressId - 要删除的地址ID
 */
async function internalDeleteAddress(event) {
  const { addressId, realOpenid } = event; // 【已修改】
  if (!realOpenid || !addressId) { return { code: 400, message: '参数不完整或无效 (openid 或 addressId 缺失)' }; }
  try {
    const addressRecord = await db.collection('address').doc(addressId).get().catch(()=>null);
    if (!addressRecord || !addressRecord.data) {
        return { code: 404, message: '地址不存在' };
    }
    if (addressRecord.data._openid !== realOpenid) { // 【已修改】使用真实的 openid 比较
        return { code: 403, message: '无权删除该地址' };
    }
    const res = await db.collection('address').doc(addressId).remove();
    if (res.stats.removed > 0) {
      return { code: 200, message: '地址删除成功' };
    } else {
      // 理论上如果上面校验通过，这里应该能删除
      return { code: 404, message: '删除失败，未找到对应地址' };
    }
  } catch (e) {
    console.error('internalDeleteAddress error:', e);
    return { code: 500, message: '数据库操作失败(delete)', error: e.toString() };
  }
}

/**
 * 设置默认地址
 * 内部函数，由主函数调用
 * @param {object} event - 包含地址ID和用户openid
 * @param {string} event.realOpenid - 【已修改】用户的真实OpenID
 * @param {string} event.addressId - 要设为默认的地址ID
 */
async function internalSetDefaultAddress(event) {
  const { addressId, realOpenid } = event; // 【已修改】
  if (!realOpenid || !addressId) { return { code: 400, message: '参数不完整或无效 (openid 或 addressId 缺失)' }; }
  try {
    // 【已修改】使用真实的 openid
    await db.collection('address').where({ _openid: realOpenid, isDefault: true }).update({ data: { isDefault: false, updateTime: new Date() } });
    // 【已修改】确保只更新属于该 openid 的地址
    const res = await db.collection('address').where({ _id: addressId, _openid: realOpenid }).update({ data: { isDefault: true, updateTime: new Date() } });
    if (res.stats.updated > 0) {
      return { code: 200, message: '默认地址设置成功' };
    } else {
      // 可能是 addressId 不存在，或者 addressId 存在但不属于此 openid
       const checkExist = await db.collection('address').doc(addressId).get().catch(()=>null);
      if (!checkExist || !checkExist.data) {
        return { code: 404, message: '未找到对应地址' };
      }
      if (checkExist.data._openid !== realOpenid) {
        return { code: 403, message: '无权设置此地址为默认' };
      }
      return { code: 404, message: '未找到对应地址或设置失败' };
    }
  } catch (e) {
    console.error('internalSetDefaultAddress error:', e);
    return { code: 500, message: '数据库操作失败(setDefault)', error: e.toString() };
  }
}

exports.main = async (event, context) => {
  const { action, ...restEventData } = event; // 从 event 中解构出 action
  
  // 【已修改】正确获取 openid
  const wxContext = cloud.getWXContext();
  const realOpenid = wxContext.OPENID;

  console.log(`Address function called with action: ${action}, event openid: ${event.openid}, context OPENID: ${realOpenid ? 'present' : 'missing'}`);

  // 对于所有地址操作，几乎都需要 openid
  // 【已修改】使用从 wxContext 获取的 realOpenid 进行判断
  if (!realOpenid && action !== 'getPublicAddressConfig') { // 假设一个不需要openid的例外
    console.error('Address function called without valid OPENID from context for action:', action);
    return { code: 401, message: '操作地址簿需要有效的用户身份 (address cloud function)' };
  }

  // 【已修改】将真实的 openid 和剩余参数传递给内部函数
  const callEvent = { realOpenid, ...restEventData, action }; // 把action也传进去，方便内部函数按需使用

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
      console.warn(`Address function called with unsupported or missing action: ${action}`);
      // 如果 action 是 undefined (前端没传), 提示 action 缺失
      if (action === undefined) {
        return { code: 400, message: `地址操作需要提供 action 参数 (address cloud function)` };
      }
      return { code: 400, message: `地址操作不支持的 action: ${action} (address cloud function)` };
  }
};
