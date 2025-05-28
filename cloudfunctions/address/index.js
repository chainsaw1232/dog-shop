// cloudfunctions/address/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 内部函数 internalAddAddress, internalListAddresses, internalUpdateAddress, 
// internalDeleteAddress, internalSetDefaultAddress 基本保持不变，
// 因为它们已经依赖于从 main 函数传入的 realOpenid。
// 我将列出 main 函数和其中一个内部函数作为示例，其他的类似。

async function internalAddAddress(event) {
  const { addressInfo, realOpenid } = event; // realOpenid 由主函数传入
  if (!realOpenid || !addressInfo || !addressInfo.name || !addressInfo.phone || !addressInfo.province || !addressInfo.city || !addressInfo.district || !addressInfo.detail) {
    return { code: 400, message: '参数不完整或无效 (openid 或地址信息缺失)' };
  }
  try {
    const now = new Date();
    const newAddress = {
      _openid: realOpenid, // 使用真实的 openid
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
      await db.collection('address').where({ _openid: realOpenid, isDefault: true }).update({ data: { isDefault: false, updateTime: new Date() } });
    }
    const res = await db.collection('address').add({ data: newAddress });
    return { code: 200, message: '地址添加成功', data: { _id: res._id, ...newAddress } }; // 之前审阅建议统一返回 code:0, 但此处保持文件原样，仅修正 openid 来源
  } catch (e) {
    console.error('internalAddAddress error:', e);
    return { code: 500, message: '数据库操作失败(add)', error: e.toString() };
  }
}

async function internalListAddresses(event) {
  const { realOpenid } = event;
  if (!realOpenid) { return { code: 400, message: '用户信息缺失 (openid)' }; }
  try {
    const res = await db.collection('address').where({ _openid: realOpenid }).orderBy('updateTime', 'desc').get();
    return { code: 200, message: '获取地址列表成功', data: res.data };
  } catch (e) {
    console.error('internalListAddresses error:', e);
    return { code: 500, message: '数据库查询失败(list)', error: e.toString() };
  }
}

async function internalUpdateAddress(event) {
  const { addressId, updates, realOpenid } = event;
  if (!realOpenid || !addressId || !updates) { return { code: 400, message: '参数不完整或无效 (openid, addressId 或 updates 缺失)' }; }
  try {
    const addressToUpdate = { ...updates };
    delete addressToUpdate._id;
    delete addressToUpdate._openid; 
    addressToUpdate.updateTime = new Date();

    if (updates.isDefault === true) {
      await db.collection('address').where({ _openid: realOpenid, isDefault: true, _id: _.neq(addressId) }).update({ data: { isDefault: false, updateTime: new Date() } });
    }
    const res = await db.collection('address').where({ _id: addressId, _openid: realOpenid }).update({ data: addressToUpdate });
    if (res.stats.updated > 0) {
      return { code: 200, message: '地址更新成功' };
    } else {
      const checkExist = await db.collection('address').doc(addressId).get().catch(()=>null);
      if (!checkExist || !checkExist.data) {
        return { code: 404, message: '未找到对应地址' };
      }
      if (checkExist.data._openid !== realOpenid) {
        return { code: 403, message: '无权更新此地址' };
      }
      return { code: 404, message: '未找到对应地址或无需更新' }; // 或者 code: 200, message: '无需更新'
    }
  } catch (e) {
    console.error('internalUpdateAddress error:', e);
    return { code: 500, message: '数据库操作失败(update)', error: e.toString() };
  }
}

async function internalDeleteAddress(event) {
  const { addressId, realOpenid } = event;
  if (!realOpenid || !addressId) { return { code: 400, message: '参数不完整或无效 (openid 或 addressId 缺失)' }; }
  try {
    const addressRecord = await db.collection('address').doc(addressId).get().catch(()=>null);
    if (!addressRecord || !addressRecord.data) {
        return { code: 404, message: '地址不存在' };
    }
    if (addressRecord.data._openid !== realOpenid) {
        return { code: 403, message: '无权删除该地址' };
    }
    const res = await db.collection('address').doc(addressId).remove();
    if (res.stats.removed > 0) {
      return { code: 200, message: '地址删除成功' };
    } else {
      return { code: 404, message: '删除失败，未找到对应地址' };
    }
  } catch (e) {
    console.error('internalDeleteAddress error:', e);
    return { code: 500, message: '数据库操作失败(delete)', error: e.toString() };
  }
}

async function internalSetDefaultAddress(event) {
  const { addressId, realOpenid } = event;
  if (!realOpenid || !addressId) { return { code: 400, message: '参数不完整或无效 (openid 或 addressId 缺失)' }; }
  try {
    await db.collection('address').where({ _openid: realOpenid, isDefault: true }).update({ data: { isDefault: false, updateTime: new Date() } });
    const res = await db.collection('address').where({ _id: addressId, _openid: realOpenid }).update({ data: { isDefault: true, updateTime: new Date() } });
    if (res.stats.updated > 0) {
      return { code: 200, message: '默认地址设置成功' };
    } else {
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
  const { action, ...restEventData } = event;
  
  const wxContext = cloud.getWXContext();
  const realOpenid = wxContext.OPENID; // 关键：从微信调用上下文中获取真实 OpenID

  // 日志记录，注意不要打印敏感信息到生产环境日志，除非必要且已脱敏
  console.log(`[address CF] Action: ${action}, Caller OpenID: ${realOpenid ? '******' : 'Missing'}`);

  if (!realOpenid) {
    console.error('[address CF] Critical: OpenID is missing from wxContext.');
    return { code: 401, message: '用户身份获取失败，无法执行操作' };
  }

  // 将真实的 OpenID 和其他事件参数传递给内部处理函数
  const callEventWithRealOpenid = { realOpenid, ...restEventData, action };

  switch (action) {
    case 'add':
      return internalAddAddress(callEventWithRealOpenid);
    case 'list':
      return internalListAddresses(callEventWithRealOpenid);
    case 'update':
      return internalUpdateAddress(callEventWithRealOpenid);
    case 'delete':
      return internalDeleteAddress(callEventWithRealOpenid);
    case 'setDefault':
      return internalSetDefaultAddress(callEventWithRealOpenid);
    default:
      console.warn(`[address CF] Unsupported action: ${action}`);
      if (action === undefined) {
        return { code: 400, message: '地址操作需要提供 action 参数' };
      }
      return { code: 400, message: `不支持的操作: ${action}` };
  }
};