// 云函数入口文件 cloudfunctions/coupon/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const couponsCollection = db.collection('coupons'); // 用户领取的优惠券
const couponTemplatesCollection = db.collection('coupon_templates'); // 优惠券模板

/**
 * 优惠券云函数主入口
 * @param {object} event
 * @param {string} event.action - 操作类型: 'list', 'available', 'receive'
 * @param {string} [event.status] - 优惠券状态 (用于 list: 'available', 'used', 'expired')
 * @param {number} [event.page=1] - 页码 (用于 list)
 * @param {number} [event.pageSize=10] - 每页数量 (用于 list)
 * @param {number} [event.orderAmount] - 订单金额 (用于 available，检查优惠券是否满足最小使用金额)
 * @param {string} [event.templateId] - 优惠券模板ID (用于 receive)
 * @param {object} context
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 401, message: '用户未登录' };
  }

  const { action, status, page = 1, pageSize = 10, orderAmount, templateId } = event;
  console.log(`[云函数 coupon] action: ${action}, openid: ${openid ? '******' : '无'}, status: ${status}, templateId: ${templateId}`);

  try {
    switch (action) {
      case 'list': // 获取用户已领取的优惠券列表
        return await getUserCoupons(openid, status, Number(page), Number(pageSize));
      case 'available': // 获取当前订单可用的优惠券
        if (typeof orderAmount !== 'number') return { code: 400, message: '缺少订单金额参数' };
        return await getAvailableCouponsForOrder(openid, parseFloat(orderAmount));
      case 'receive': // 用户领取优惠券
        if (!templateId) return { code: 400, message: '缺少优惠券模板ID' };
        return await receiveCoupon(openid, templateId);
      default:
        return { code: 400, message: '未知操作' };
    }
  } catch (error) {
    console.error(`[云函数 coupon] 执行 action ${action} 失败:`, error);
    return { code: 500, message: '服务器内部错误', error: error.message || error.errMsg || error };
  }
};

async function getUserCoupons(openid, statusFilter = 'available', page = 1, pageSize = 10) {
  const query = { _openid: openid };
  const now = new Date();

  if (statusFilter === 'available') {
    query.status = 'available';
    query.endTime = _.gt(now); // 确保未过期
    query.startTime = _.lte(now); // 确保已到可用时间
  } else if (statusFilter === 'used') {
    query.status = 'used';
  } else if (statusFilter === 'expired') {
    // 已过期包括：状态是 available 但 endTime <= now，或者状态本身就是 expired
    query.$or = [
      { status: 'available', endTime: _.lte(now) },
      { status: 'expired' }
    ];
  }
  // 如果 statusFilter 是 'all' 或其他，则不加 status 筛选条件 (按需添加)

  const totalRes = await couponsCollection.where(query).count();
  const total = totalRes.total;

  const couponsRes = await couponsCollection.where(query)
    .orderBy('endTime', 'asc') // 可用券按过期时间升序
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  // 进一步处理，确保 'available' 状态的券如果真的过期了，也显示为 'expired'
  const processedList = couponsRes.data.map(coupon => {
    if (coupon.status === 'available' && new Date(coupon.endTime) < now) {
      return { ...coupon, status: 'expired' };
    }
    return coupon;
  });

  return {
    code: 0,
    message: '获取优惠券列表成功',
    data: {
      list: processedList,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

async function getAvailableCouponsForOrder(openid, orderAmount) {
  const now = new Date();
  const query = {
    _openid: openid,
    status: 'available',
    minAmount: _.lte(orderAmount), // 最小使用金额需小于等于订单金额
    startTime: _.lte(now),       // 已到可用时间
    endTime: _.gt(now)           // 未过期
  };

  const couponsRes = await couponsCollection.where(query)
    .orderBy('amount', 'desc') // 通常按优惠金额降序或某种最优策略排序
    .orderBy('endTime', 'asc')
    .get();

  return {
    code: 0,
    message: '获取可用优惠券成功',
    data: couponsRes.data
  };
}

async function receiveCoupon(openid, templateId) {
  // 1. 检查优惠券模板是否存在且有效
  const templateRes = await couponTemplatesCollection.doc(templateId).get().catch(err => {
    console.error(`[receiveCoupon] 查询模板 ${templateId} 失败:`, err);
    return null;
  });

  if (!templateRes || !templateRes.data) {
    return { code: 404, message: '优惠券模板不存在' };
  }
  const template = templateRes.data;

  if (template.status !== 'active') {
    return { code: 400, message: '该优惠券活动已结束或未开始' };
  }
  if (template.totalQuantity !== -1 && template.issuedQuantity >= template.totalQuantity) { // -1 代表无限量
    return { code: 400, message: '该优惠券已被领完' };
  }
  const now = new Date();
  // 假设模板有 startTime 和 endTime 字段控制可领取时间段
  if (template.startTime && new Date(template.startTime) > now) {
    return { code: 400, message: '该优惠券领取时间未开始' };
  }
  if (template.endTime && new Date(template.endTime) < now) {
    return { code: 400, message: '该优惠券领取时间已结束' };
  }

  // 2. 检查用户是否已领取过该模板的优惠券 (如果有限制每人领取次数)
  // 假设每个用户对同一个模板只能领取一次
  const existingCoupon = await couponsCollection.where({
    _openid: openid,
    templateId: templateId
  }).count();

  if (existingCoupon.total > 0) {
    // 可以根据业务调整，是提示已领取，还是允许重复领取（如果业务允许）
    return { code: 400, message: '您已领取过该优惠券' };
  }

  // 3. 计算用户优惠券的有效期
  let couponStartTime, couponEndTime;
  const serverNow = db.serverDate(); // 使用服务端时间作为领取时间

  if (template.validDays && typeof template.validDays === 'number' && template.validDays > 0) {
    // 如果模板定义了领取后多少天有效
    couponStartTime = serverNow;
    let endDate = new Date(); // 临时用客户端时间计算，但存入的是服务端时间
    endDate.setDate(endDate.getDate() + template.validDays);
    couponEndTime = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999); // 当天结束
  } else if (template.validityType === 'fixed_date' && template.couponStartTime && template.couponEndTime) {
    // 如果模板定义了固定有效期
    couponStartTime = new Date(template.couponStartTime);
    couponEndTime = new Date(template.couponEndTime);
  } else {
    return { code: 400, message: '优惠券有效期配置错误' };
  }


  // 4. 创建用户优惠券记录
  const userCouponData = {
    _openid: openid,
    templateId: templateId,
    name: template.name,
    type: template.type,
    amount: template.amount,
    minAmount: template.minAmount,
    scope: template.scope,
    scopeDetails: template.scopeDetails || null, // 如适用商品ID列表等
    description: template.description,
    startTime: couponStartTime,
    endTime: couponEndTime,
    status: 'available', // 初始状态为可用
    createTime: serverNow, // 领取时间
    useTime: null,
    orderId: null
  };

  const addRes = await couponsCollection.add({ data: userCouponData });

  // 5. 更新优惠券模板的已发放数量 (如果不是无限量)
  if (template.totalQuantity !== -1) {
    await couponTemplatesCollection.doc(templateId).update({
      data: {
        issuedQuantity: _.inc(1)
      }
    });
  }

  return {
    code: 0,
    message: '优惠券领取成功',
    data: {
      couponId: addRes._id,
      ...userCouponData // 返回领取的优惠券信息
    }
  };
}
