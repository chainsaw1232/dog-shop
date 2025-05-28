// cloudfunctions/orders/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 跟随小程序环境进行初始化
});

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate; // 用于聚合操作

// 模拟生成订单号 (实际项目中建议使用更健壮的订单号生成规则)
function generateOrderNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 900 + 100); // 3位随机数
  return `DGS${year}${month}${day}${hours}${minutes}${seconds}${random}`;
}

/**
 * 创建新订单
 * @param {object} event - 包含订单信息和用户openid
 * @param {string} event.addressId - 收货地址ID
 * @param {Array} event.orderItems - 订单商品列表
 * @param {string} [event.couponId] - 优惠券ID
 * @param {string} [event.remark] - 订单备注
 * @param {number} event.totalAmount - 订单总金额 (前端计算的总金额，后端会再校验)
 * @param {number} event.productAmount - 商品总金额
 * @param {number} [event.shippingFee=0] - 运费
 * @param {string} openid - 用户 OpenID (由主函数传入)
 */
async function internalCreateOrder(event, openid) {
  const { addressId, orderItems, couponId, remark, totalAmount, productAmount, shippingFee = 0 } = event;
  
  if (!openid || !addressId || !orderItems || orderItems.length === 0 || totalAmount === undefined || productAmount === undefined) {
    return { code: 400, message: '创建订单参数不完整或无效' };
  }

  const transaction = await db.startTransaction();
  try {
    const addressRes = await transaction.collection('address').doc(addressId).get();
    if (!addressRes.data || addressRes.data._openid !== openid) {
      await transaction.rollback();
      return { code: 404, message: '收货地址无效或不存在' };
    }
    const shippingAddress = addressRes.data;

    let calculatedServerProductAmount = 0;
    const productIds = orderItems.map(item => item.productId);
    const productsSnapshot = await transaction.collection('products').where({ _id: _.in(productIds) }).get();
    const dbProducts = productsSnapshot.data;
    const processedOrderItems = [];

    for (const item of orderItems) {
      const dbProduct = dbProducts.find(p => p._id === item.productId);
      if (!dbProduct || dbProduct.status !== 'active') { // 检查商品是否存在或上架
        await transaction.rollback();
        return { code: 404, message: `商品 ${item.productName || item.productId} 不存在或已下架` };
      }
      
      let currentPrice = dbProduct.price;
      let currentStock = dbProduct.stock;
      let currentSpecName = item.specName || '';
      let currentSpecId = item.specId || null;

      if (item.specId && dbProduct.specs && dbProduct.specs.length > 0) {
        const selectedSpec = dbProduct.specs.find(s => (s._id && s._id.toString() === item.specId) || (s.id && s.id.toString() === item.specId));
        if (!selectedSpec) {
          await transaction.rollback();
          return { code: 404, message: `商品 ${dbProduct.name} 的所选规格 ${item.specName || item.specId} 不存在` };
        }
        currentPrice = selectedSpec.price;
        currentStock = selectedSpec.stock;
      }

      if (currentStock < item.quantity) {
        await transaction.rollback();
        return { code: 400, message: `商品 ${dbProduct.name} ${currentSpecName} 库存不足 (仅剩${currentStock}件)` };
      }
      calculatedServerProductAmount += currentPrice * item.quantity;
      processedOrderItems.push({
        productId: dbProduct._id,
        productName: dbProduct.name,
        productImage: item.productImage || (dbProduct.images && dbProduct.images.length > 0) ? dbProduct.images[0] : (dbProduct.mainImage || ''),
        price: currentPrice,
        quantity: item.quantity,
        specId: currentSpecId,
        specName: currentSpecName,
        amount: currentPrice * item.quantity
      });
    }
    calculatedServerProductAmount = parseFloat(calculatedServerProductAmount.toFixed(2));

    const serverShippingFee = parseFloat(shippingFee.toFixed(2));
    let serverCouponAmount = 0;
    let finalCouponInfo = null;

    if (couponId) {
      const couponRes = await transaction.collection('coupons').doc(couponId).get();
      if (!couponRes.data) {
        await transaction.rollback();
        return { code: 400, message: '所选优惠券不存在' };
      }
      const coupon = couponRes.data;
      const nowForCouponCheck = new Date(); // 用于优惠券有效期检查
      if (coupon.status !== 'available' || coupon._openid !== openid || (coupon.minAmount && calculatedServerProductAmount < coupon.minAmount) || (coupon.startTime && new Date(coupon.startTime) > nowForCouponCheck) || (coupon.endTime && new Date(coupon.endTime) < nowForCouponCheck) ) {
        await transaction.rollback();
        return { code: 400, message: '优惠券无效或不满足使用条件' };
      }
      // 根据优惠券类型计算优惠金额
      if (coupon.type === 'fixed_amount') {
        serverCouponAmount = parseFloat(coupon.amount.toFixed(2));
      } else if (coupon.type === 'discount') {
        serverCouponAmount = parseFloat((calculatedServerProductAmount * (1 - coupon.amount)).toFixed(2));
        if (serverCouponAmount < 0) serverCouponAmount = 0; // 防止折扣算出来是负数（虽然不太可能）
      } else {
        // 其他类型优惠券暂不处理或报错
        await transaction.rollback();
        return { code: 400, message: '不支持的优惠券类型' };
      }

      finalCouponInfo = {
        couponId: coupon._id,
        name: coupon.name,
        amountDeducted: serverCouponAmount, // 实际抵扣的金额
        type: coupon.type,
        value: coupon.amount // 券面值或折扣率
      };
      await transaction.collection('coupons').doc(couponId).update({
        data: {
          status: 'used',
          useTime: db.serverDate(),
          orderId: null // 占位，后面订单创建成功再回填
        }
      });
    }
    
    const serverTotalAmount = parseFloat((calculatedServerProductAmount + serverShippingFee - serverCouponAmount).toFixed(2));

    if (Math.abs(serverTotalAmount - parseFloat(totalAmount.toFixed(2))) > 0.01) {
      console.warn(`订单金额校验警告：前端总额 ${totalAmount}, 后端计算总额 ${serverTotalAmount}. 使用后端计算值.`);
      // 使用后端计算结果为准
    }

    const orderNo = generateOrderNumber();
    const now = db.serverDate();

    const orderData = {
      _openid: openid,
      orderNo,
      orderItems: processedOrderItems,
      productAmount: calculatedServerProductAmount,
      shippingFee: serverShippingFee,
      couponAmount: serverCouponAmount, // 记录实际抵扣的金额
      totalAmount: serverTotalAmount, 
      shippingAddress: {
        name: shippingAddress.name,
        phone: shippingAddress.phone,
        province: shippingAddress.province,
        city: shippingAddress.city,
        district: shippingAddress.district,
        detail: shippingAddress.detail,
        fullAddress: `${shippingAddress.province || ''}${shippingAddress.city || ''}${shippingAddress.district || ''}${shippingAddress.detail || ''}`,
        tag: shippingAddress.tag || ''
      },
      couponInfo: finalCouponInfo,
      remark: remark || '',
      status: 'unpaid',
      createTime: now,
      updateTime: now,
      payTime: null,
      shipTime: null,
      completeTime: null,
      cancelTime: null,
      hasReviewed: false,
      paymentInfo: null
    };

    const newOrderRes = await transaction.collection('orders').add({ data: orderData });
    const newOrderId = newOrderRes._id;

    const productUpdatePromises = [];
    for (const item of processedOrderItems) {
      productUpdatePromises.push(
        transaction.collection('products').doc(item.productId).update({
          data: {
            stock: _.inc(-item.quantity),
            sales: _.inc(item.quantity)
          }
        })
      );
    }
    await Promise.all(productUpdatePromises);

    if (couponId && newOrderId) {
      await transaction.collection('coupons').doc(couponId).update({
        data: { orderId: newOrderId }
      });
    }

    await transaction.commit();
    return {
      code: 0,
      message: '订单创建成功',
      data: {
        orderId: newOrderId,
        orderNo,
        totalAmount: serverTotalAmount
      }
    };

  } catch (e) {
    await transaction.rollback();
    console.error('internalCreateOrder error:', e);
    return { code: 500, message: '订单创建失败，请稍后再试', error: e.errMsg || e.message || e };
  }
}


async function internalListOrders(event, openid) {
  const { status, page = 1, pageSize = 10 } = event;
  try {
    const query = { _openid: openid };
    if (status && status !== 'all') {
      query.status = status;
    }

    const countResult = await db.collection('orders').where(query).count();
    const total = countResult.total;

    const ordersResult = await db.collection('orders')
      .where(query)
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    return {
      code: 0,
      message: '获取订单列表成功',
      data: {
        list: ordersResult.data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (e) {
    console.error('internalListOrders error:', e);
    return { code: 500, message: '获取订单列表失败', error: e.errMsg || e.message };
  }
}

async function internalGetOrderDetail(event, openid) {
  const { orderId } = event;
  if (!orderId) {
    return { code: 400, message: '缺少订单ID参数' };
  }
  try {
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      return { code: 404, message: '订单不存在' };
    }
    if (orderRes.data._openid !== openid) {
      return { code: 403, message: '无权查看此订单' };
    }
    return { code: 0, message: '获取订单详情成功', data: orderRes.data };
  } catch (e) {
    console.error('internalGetOrderDetail error:', e);
    if (e.errMsg && e.errMsg.includes('document_non_exist')) {
        return { code: 404, message: '订单不存在 (DB)' };
    }
    return { code: 500, message: '获取订单详情失败', error: e.errMsg || e.message };
  }
}

async function internalCountOrdersByStatus(openid) {
  try {
    const counts = {
      unpaid: 0,
      unshipped: 0,
      shipped: 0,
    };
    const statusesToCount = ['unpaid', 'unshipped', 'shipped'];

    const aggregateResult = await db.collection('orders')
      .aggregate()
      .match({ _openid: openid, status: _.in(statusesToCount) })
      .group({ _id: '$status', count: $.sum(1) })
      .end();
    
    if (aggregateResult.list) {
      aggregateResult.list.forEach(item => {
        if (counts.hasOwnProperty(item._id)) {
          counts[item._id] = item.count;
        }
      });
    }

    return { code: 0, message: '获取订单数量统计成功', data: counts };
  } catch (e) {
    console.error('internalCountOrdersByStatus error:', e);
    return { code: 500, message: '获取订单数量统计失败', error: e.errMsg || e.message };
  }
}

async function internalGetPaymentParams(event, openid) {
  const { orderId } = event;
  if (!orderId) {
    return { code: 400, message: '缺少订单ID参数' };
  }
  try {
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      return { code: 404, message: '订单不存在' };
    }
    if (orderRes.data._openid !== openid) {
      return { code: 403, message: '无权操作此订单' };
    }
    if (orderRes.data.status !== 'unpaid') {
      return { code: 400, message: '订单状态非待付款，无法支付' };
    }

    // 模拟微信支付参数 (实际生产中需要调用微信支付统一下单API)
    const paymentParams = {
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: Math.random().toString(36).substr(2, 15),
      package: `prepay_id=wx_sim_${Date.now()}${Math.floor(Math.random()*100000)}`,
      signType: 'MD5', 
      paySign: 'SIMULATED_PAYSIGN_FOR_DEMO_ONLY', 
    };
    // 注意：此处的 paymentParams 仅为模拟，无法发起真实支付
    // 真实支付需要使用 cloud.cloudPay.unifiedOrder 或后端调用微信支付API

    return { code: 0, message: '获取支付参数成功 (模拟)', data: { paymentParams, orderNo: orderRes.data.orderNo, totalAmount: orderRes.data.totalAmount } };
  } catch (e) {
    console.error('internalGetPaymentParams error:', e);
    return { code: 500, message: '获取支付参数失败', error: e.errMsg || e.message };
  }
}


async function internalCancelOrder(event, openid) {
  const { orderId } = event;
  if (!orderId) { return { code: 400, message: '缺少订单ID参数' }; }

  const transaction = await db.startTransaction();
  try {
    const orderRes = await transaction.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      await transaction.rollback();
      return { code: 404, message: '订单不存在' };
    }
    if (orderRes.data._openid !== openid) {
      await transaction.rollback();
      return { code: 403, message: '无权操作此订单' };
    }
    if (orderRes.data.status !== 'unpaid') {
      await transaction.rollback();
      return { code: 400, message: '订单状态无法取消' };
    }

    await transaction.collection('orders').doc(orderId).update({
      data: {
        status: 'cancelled',
        cancelTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });

    const productUpdatePromises = orderRes.data.orderItems.map(item => {
      return transaction.collection('products').doc(item.productId).update({
        data: {
          stock: _.inc(item.quantity),
          sales: _.inc(-item.quantity)
        }
      });
    });
    await Promise.all(productUpdatePromises);

    if (orderRes.data.couponInfo && orderRes.data.couponInfo.couponId) {
      await transaction.collection('coupons').doc(orderRes.data.couponInfo.couponId).update({
        data: {
          status: 'available',
          useTime: null,
          orderId: null
        }
      });
    }

    await transaction.commit();
    return { code: 0, message: '订单取消成功' };
  } catch (e) {
    await transaction.rollback();
    console.error('internalCancelOrder error:', e);
    return { code: 500, message: '取消订单失败', error: e.errMsg || e.message };
  }
}

async function internalConfirmReceive(event, openid) {
  const { orderId } = event;
  if (!orderId) { return { code: 400, message: '缺少订单ID参数' }; }
  try {
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) { return { code: 404, message: '订单不存在' }; }
    if (orderRes.data._openid !== openid) { return { code: 403, message: '无权操作此订单' }; }
    if (orderRes.data.status !== 'shipped') { 
      return { code: 400, message: '订单状态无法确认收货' };
    }

    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'completed', 
        completeTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });
    return { code: 0, message: '确认收货成功' };
  } catch (e) {
    console.error('internalConfirmReceive error:', e);
    return { code: 500, message: '确认收货失败', error: e.errMsg || e.message };
  }
}

async function internalGetDetailForReview(event, openid) {
    const { orderId } = event;
    if (!orderId) { return { code: 400, message: '缺少订单ID参数' }; }
    try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        if (!orderRes.data) { return { code: 404, message: '订单不存在' }; }
        if (orderRes.data._openid !== openid) { return { code: 403, message: '无权操作此订单' }; }
        
        if (orderRes.data.status !== 'completed' && orderRes.data.status !== 'toEvaluate') { 
             return { code: 400, message: '当前订单状态无法评价' };
        }
        if (orderRes.data.hasReviewed === true) {
            return { code: 400, message: '该订单已评价过' };
        }

        return {
            code: 0,
            message: '获取待评价订单信息成功',
            data: {
                orderId: orderRes.data._id,
                orderNo: orderRes.data.orderNo,
                orderItems: orderRes.data.orderItems 
            }
        };
    } catch (e) {
        console.error('internalGetDetailForReview error:', e);
        return { code: 500, message: '获取待评价订单信息失败', error: e.errMsg || e.message };
    }
}

async function internalGetOrderSummary(event, openid) {
    const { orderId } = event;
    if (!orderId) { return { code: 400, message: '缺少订单ID参数' }; }
    try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        if (!orderRes.data) { return { code: 404, message: '订单不存在' }; }
        if (orderRes.data._openid !== openid) { return { code: 403, message: '无权查看此订单' }; }

        return {
            code: 0,
            message: '获取订单摘要成功',
            data: {
                orderId: orderRes.data._id,
                orderNo: orderRes.data.orderNo,
                totalAmount: orderRes.data.totalAmount,
                status: orderRes.data.status
            }
        };
    } catch (e) {
        console.error('internalGetOrderSummary error:', e);
        return { code: 500, message: '获取订单摘要失败', error: e.errMsg || e.message };
    }
}

/**
 * 新增：标记订单为已支付并更新状态为待发货
 * @param {object} event - 包含订单ID
 * @param {string} event.orderId - 订单ID
 * @param {string} [event.transaction_id] - (可选) 微信支付订单号
 * @param {string} openid - 用户 OpenID
 */
async function internalMarkOrderAsPaid(event, openid) {
  const { orderId, transaction_id } = event; // transaction_id 可选
  if (!orderId) {
    return { code: 400, message: '缺少订单ID参数 (markOrderAsPaid)' };
  }

  const transaction = await db.startTransaction();
  try {
    const orderRes = await transaction.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      await transaction.rollback();
      return { code: 404, message: '订单不存在 (markOrderAsPaid)' };
    }
    if (orderRes.data._openid !== openid) {
      await transaction.rollback();
      return { code: 403, message: '无权操作此订单 (markOrderAsPaid)' };
    }
    
    if (orderRes.data.status !== 'unpaid') {
      console.warn(`[CloudFunc orders/markOrderAsPaid] Order ${orderId} status was ${orderRes.data.status}, not 'unpaid'. Will not update again or treat as already paid.`);
      // 根据业务逻辑，如果已经是unshipped或更高状态，可以认为已处理
      if (['unshipped', 'shipped', 'completed'].includes(orderRes.data.status)) {
          await transaction.rollback(); // 事务回滚，因为没有做任何更改
          return { code: 0, message: '订单已是支付后状态，无需重复更新' }; // 返回成功，前端继续刷新即可
      }
      // 如果是其他非预期状态，可能需要特定处理，或允许覆盖
    }

    const paymentInfoToUpdate = {
        payMethod: '微信支付', // 默认为微信支付
        status: 'SUCCESS', // 标记支付成功
        payTime: db.serverDate() // 记录支付时间
    };
    if (transaction_id) {
        paymentInfoToUpdate.transaction_id = transaction_id;
    }

    const updateResult = await transaction.collection('orders').doc(orderId).update({
      data: {
        status: 'unshipped', // 关键：将状态更新为“待发货”
        payTime: db.serverDate(), // 记录支付时间 (与 paymentInfo 中的 payTime 一致)
        updateTime: db.serverDate(),
        paymentInfo: paymentInfoToUpdate
      }
    });

    if (updateResult.stats.updated > 0) {
      await transaction.commit();
      console.log(`[CloudFunc orders/markOrderAsPaid] Order ${orderId} by user ${openid} marked as paid, status updated to unshipped.`);
      return { code: 0, message: '订单支付状态更新成功' };
    } else {
      await transaction.rollback();
      console.warn(`[CloudFunc orders/markOrderAsPaid] Order ${orderId} update returned 0 affected documents. Possible concurrency or data mismatch.`);
      return { code: 501, message: '订单状态更新失败，记录未被修改' }; // 特定错误码
    }

  } catch (e) {
    await transaction.rollback();
    console.error('[CloudFunc orders/markOrderAsPaid] Error:', e);
    return { code: 500, message: '更新订单支付状态时发生服务器错误', error: e.message || e.errMsg || e };
  }
}


exports.main = async (event, context) => {
  const { action, ...restEventData } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid && action !== 'somePublicActionWithoutLoginRequirement') { // 确保有一个明确的例外action列表
    console.error('Orders function called without openid for action:', action);
    return { code: 401, message: '用户身份校验失败，请重新登录 (orders cloud function)' };
  }

  console.log(`[CloudFunc orders] Action: ${action}, Caller OpenID: ${openid ? '******' : 'N/A (or public action)'}`);

  switch (action) {
    case 'create':
      return internalCreateOrder(restEventData, openid);
    case 'list':
      return internalListOrders(restEventData, openid);
    case 'detail':
      return internalGetOrderDetail(restEventData, openid);
    case 'countByStatus':
      return internalCountOrdersByStatus(openid);
    case 'getPaymentParams':
      return internalGetPaymentParams(restEventData, openid);
    case 'cancel':
      return internalCancelOrder(restEventData, openid);
    case 'confirmReceive':
      return internalConfirmReceive(restEventData, openid);
    case 'getDetailForReview':
      return internalGetDetailForReview(restEventData, openid);
    case 'getSummary':
      return internalGetOrderSummary(restEventData, openid);
    case 'markOrderAsPaid': // 新增的action
      return internalMarkOrderAsPaid(restEventData, openid);
    default:
      console.warn(`Orders function called with unsupported action: ${action}`);
      return { code: 400, message: `订单操作不支持的 action: ${action} (orders cloud function)` };
  }
};