// 云函数入口文件 for orders
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
 * @param {Array} event.orderItems - 订单商品列表 (注意：前端传递的应该是 orderItems，不是 items)
 * @param {string} [event.couponId] - 优惠券ID
 * @param {string} [event.remark] - 订单备注
 * @param {number} event.totalAmount - 订单总金额 (前端计算的总金额，后端会再校验)
 * @param {number} event.productAmount - 商品总金额
 * @param {number} [event.shippingFee=0] - 运费
 * @param {string} openid - 用户 OpenID (由主函数传入)
 */
async function internalCreateOrder(event, openid) {
  const { addressId, orderItems, couponId, remark, totalAmount, productAmount, shippingFee = 0 } = event;
  
  // 1. 参数校验
  if (!openid || !addressId || !orderItems || orderItems.length === 0 || totalAmount === undefined || productAmount === undefined) {
    return { code: 400, message: '创建订单参数不完整或无效' };
  }

  const transaction = await db.startTransaction(); // 开启事务
  try {
    // 2. 获取收货地址信息
    const addressRes = await transaction.collection('address').doc(addressId).get();
    if (!addressRes.data || addressRes.data._openid !== openid) {
      await transaction.rollback();
      return { code: 404, message: '收货地址无效或不存在' };
    }
    const shippingAddress = addressRes.data;

    // 3. 校验商品库存、价格，并计算后端商品总额
    let calculatedServerProductAmount = 0;
    const productIds = orderItems.map(item => item.productId);
    const productsSnapshot = await transaction.collection('products').where({ _id: _.in(productIds) }).get();
    const dbProducts = productsSnapshot.data;
    const processedOrderItems = [];

    for (const item of orderItems) {
      const dbProduct = dbProducts.find(p => p._id === item.productId);
      if (!dbProduct) {
        await transaction.rollback();
        return { code: 404, message: `商品 ${item.productName || item.productId} 不存在或已下架` };
      }
      // TODO: 如果有规格，还需要根据 specId 查找规格价格和库存
      const currentPrice = dbProduct.price; // 假设直接用商品主价格
      const currentStock = dbProduct.stock; // 假设直接用商品主库存

      if (currentStock < item.quantity) {
        await transaction.rollback();
        return { code: 400, message: `商品 ${dbProduct.name} 库存不足 (仅剩${currentStock}件)` };
      }
      calculatedServerProductAmount += currentPrice * item.quantity;
      processedOrderItems.push({
        productId: dbProduct._id,
        productName: dbProduct.name,
        productImage: (dbProduct.images && dbProduct.images.length > 0) ? dbProduct.images[0] : (dbProduct.mainImage || ''), // 优先用images[0]
        price: currentPrice,
        quantity: item.quantity,
        // specId: item.specId || null, // 如果有规格
        // specName: item.specName || '', // 如果有规格
        amount: currentPrice * item.quantity
      });
    }
    // 金额格式化为两位小数
    calculatedServerProductAmount = parseFloat(calculatedServerProductAmount.toFixed(2));


    // 4. 处理运费 (可以从前端传，也可以后端根据规则计算)
    const serverShippingFee = parseFloat(shippingFee.toFixed(2)); // 假设直接信任前端的运费

    // 5. 处理优惠券
    let serverCouponAmount = 0;
    let finalCouponInfo = null; // 存储使用的优惠券信息
    if (couponId) {
      const couponRes = await transaction.collection('coupons').doc(couponId).get();
      if (!couponRes.data) {
        await transaction.rollback();
        return { code: 400, message: '所选优惠券不存在' };
      }
      const coupon = couponRes.data;
      if (coupon.status !== 'available' || coupon._openid !== openid || (coupon.minAmount && calculatedServerProductAmount < coupon.minAmount) || (coupon.endTime && new Date(coupon.endTime) < new Date())) {
        await transaction.rollback();
        return { code: 400, message: '优惠券无效或不满足使用条件' };
      }
      serverCouponAmount = parseFloat(coupon.amount.toFixed(2));
      finalCouponInfo = { // 记录优惠券信息到订单
        couponId: coupon._id,
        name: coupon.name,
        amount: coupon.amount
      };
      // 标记优惠券已使用
      await transaction.collection('coupons').doc(couponId).update({
        data: {
          status: 'used',
          useTime: db.serverDate(),
          orderId: null // 占位，后面订单创建成功再回填
        }
      });
    }
    
    // 6. 计算最终支付金额 (后端计算为准)
    const serverTotalAmount = parseFloat((calculatedServerProductAmount + serverShippingFee - serverCouponAmount).toFixed(2));

    // 7. 金额校验 (可选，但建议有)
    // 允许一定误差，比如0.01元
    if (Math.abs(serverTotalAmount - parseFloat(totalAmount.toFixed(2))) > 0.01) {
      console.warn(`订单金额校验警告：前端总额 ${totalAmount}, 后端计算总额 ${serverTotalAmount}`);
      // 可以选择回滚或继续，取决于业务策略
      // await transaction.rollback();
      // return { code: 400, message: '订单金额校验失败，请重新提交' };
    }

    // 8. 生成订单号及创建时间
    const orderNo = generateOrderNumber();
    const now = db.serverDate(); // 使用服务端时间

    const orderData = {
      _openid: openid,
      orderNo,
      orderItems: processedOrderItems,
      productAmount: calculatedServerProductAmount,
      shippingFee: serverShippingFee,
      couponAmount: serverCouponAmount,
      totalAmount: serverTotalAmount, // 使用后端计算的总金额
      shippingAddress: { // 存储地址快照
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
      status: 'unpaid', // 初始状态为待付款
      createTime: now,
      updateTime: now,
      payTime: null,
      shipTime: null,
      completeTime: null,
      cancelTime: null,
      hasReviewed: false // 是否已评价
    };

    // 9. 创建订单记录
    const newOrderRes = await transaction.collection('orders').add({ data: orderData });
    const newOrderId = newOrderRes._id;

    // 10. 更新商品库存和销量
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

    // 11. 如果使用了优惠券，回填订单ID到优惠券记录 (可选)
    if (couponId && newOrderId) {
      await transaction.collection('coupons').doc(couponId).update({
        data: { orderId: newOrderId }
      });
    }

    await transaction.commit(); // 提交事务
    return {
      code: 0,
      message: '订单创建成功',
      data: {
        orderId: newOrderId,
        orderNo,
        totalAmount: serverTotalAmount // 返回最终需要支付的金额
      }
    };

  } catch (e) {
    await transaction.rollback(); // 发生任何错误都回滚事务
    console.error('internalCreateOrder error:', e);
    return { code: 500, message: '订单创建失败，请稍后再试', error: e.errMsg || e.message || e };
  }
}


/**
 * 获取订单列表
 * @param {object} event - 包含分页、状态等参数
 * @param {string} [event.status] - 订单状态 (unpaid, unshipped, shipped, completed, cancelled)
 * @param {number} [event.page=1] - 页码
 * @param {number} [event.pageSize=10] - 每页数量
 * @param {string} openid - 用户 OpenID
 */
async function internalListOrders(event, openid) {
  const { status, page = 1, pageSize = 10 } = event;
  try {
    const query = { _openid: openid };
    if (status && status !== 'all') { // 'all' 表示查询所有
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

/**
 * 获取订单详情
 * @param {object} event - 包含订单ID
 * @param {string} event.orderId - 订单ID
 * @param {string} openid - 用户 OpenID
 */
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
    // 校验订单是否属于当前用户
    if (orderRes.data._openid !== openid) {
      return { code: 403, message: '无权查看此订单' };
    }
    return { code: 0, message: '获取订单详情成功', data: orderRes.data };
  } catch (e) {
    console.error('internalGetOrderDetail error:', e);
    return { code: 500, message: '获取订单详情失败', error: e.errMsg || e.message };
  }
}

/**
 * 按状态统计订单数量
 * @param {string} openid - 用户 OpenID
 */
async function internalCountOrdersByStatus(openid) {
  try {
    const counts = {
      unpaid: 0,
      unshipped: 0,
      shipped: 0,
      // completed: 0, // 如果前端需要已完成的统计
      // afterSale: 0 // 如果有售后状态
    };
    const statusesToCount = ['unpaid', 'unshipped', 'shipped']; // 根据前端个人中心需要的状态来定

    for (const status of statusesToCount) {
      const result = await db.collection('orders').where({ _openid: openid, status: status }).count();
      counts[status] = result.total;
    }
    // 你也可以一次性聚合查询，但分开查对于少量状态也还好
    // const aggregateResult = await db.collection('orders')
    //   .aggregate()
    //   .match({ _openid: openid, status: _.in(statusesToCount) })
    //   .group({ _id: '$status', count: $.sum(1) })
    //   .end();
    // console.log(aggregateResult);
    // if (aggregateResult.list) {
    //   aggregateResult.list.forEach(item => {
    //     if (counts.hasOwnProperty(item._id)) {
    //       counts[item._id] = item.count;
    //     }
    //   });
    // }

    return { code: 0, message: '获取订单数量统计成功', data: counts };
  } catch (e) {
    console.error('internalCountOrdersByStatus error:', e);
    return { code: 500, message: '获取订单数量统计失败', error: e.errMsg || e.message };
  }
}

/**
 * 获取支付参数 (模拟)
 * 实际项目中，这里应该调用微信支付统一下单API，并返回给前端调起支付所需的参数
 * @param {object} event - 包含订单ID
 * @param {string} event.orderId - 订单ID
 * @param {string} openid - 用户 OpenID
 */
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

    // --- 模拟微信支付统一下单成功返回的参数 ---
    // ！！！注意：以下是模拟数据，实际生产环境需要对接微信支付SDK生成真实参数！！！
    const paymentParams = {
      timeStamp: String(Math.floor(Date.now() / 1000)), // 时间戳 (秒)
      nonceStr: Math.random().toString(36).substr(2, 15), // 随机字符串
      package: `prepay_id=wx${Date.now()}${Math.floor(Math.random()*100000)}`, // 预支付交易会话标识
      signType: 'MD5', // 或 RSA，根据实际配置
      paySign: 'SIMULATED_PAYSIGN_NEED_REAL_IMPLEMENTATION', // 签名，非常重要！
      // 以下为可选参数，根据实际情况
      // appId: cloud.getWXContext().APPID, // 小程序AppID (如果云函数配置中没有自动注入)
      // mch_id: 'YOUR_MERCHANT_ID', // 你的商户号
    };
    // 实际项目中，你会用 orderRes.data.orderNo, orderRes.data.totalAmount, openid 等信息去调用微信支付的统一下单接口。
    // 微信支付的云调用方法：cloud.cloudPay.unifiedOrder({...})

    // 模拟支付成功后，更新订单状态 (这部分逻辑应该在支付回调中处理，这里只是模拟)
    // setTimeout(async () => {
    //   try {
    //     await db.collection('orders').doc(orderId).update({
    //       data: {
    //         status: 'unshipped', // 假设支付成功后变为待发货
    //         payTime: db.serverDate(),
    //         paymentInfo: { // 可以记录一些支付信息
    //           transaction_id: 'simulated_transaction_id_' + Date.now(),
    //           payMethod: '微信支付'
    //         }
    //       }
    //     });
    //     console.log(`订单 ${orderId} 模拟支付成功，状态更新为待发货`);
    //   } catch (updateError) {
    //     console.error(`模拟支付后更新订单 ${orderId} 状态失败:`, updateError);
    //   }
    // }, 3000); // 模拟3秒后支付成功


    return { code: 0, message: '获取支付参数成功 (模拟)', data: { paymentParams } };
  } catch (e) {
    console.error('internalGetPaymentParams error:', e);
    return { code: 500, message: '获取支付参数失败', error: e.errMsg || e.message };
  }
}

/**
 * 取消订单
 * @param {object} event - 包含订单ID
 * @param {string} event.orderId - 订单ID
 * @param {string} openid - 用户 OpenID
 */
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
    if (orderRes.data.status !== 'unpaid') { // 只有未付款的订单才能取消
      await transaction.rollback();
      return { code: 400, message: '订单状态无法取消' };
    }

    // 1. 更新订单状态为已取消
    await transaction.collection('orders').doc(orderId).update({
      data: {
        status: 'cancelled',
        cancelTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });

    // 2. 恢复商品库存
    const productUpdatePromises = orderRes.data.orderItems.map(item => {
      return transaction.collection('products').doc(item.productId).update({
        data: {
          stock: _.inc(item.quantity), // 增加库存
          sales: _.inc(-item.quantity) // 减少销量
        }
      });
    });
    await Promise.all(productUpdatePromises);

    // 3. 如果使用了优惠券，恢复优惠券状态
    if (orderRes.data.couponInfo && orderRes.data.couponInfo.couponId) {
      await transaction.collection('coupons').doc(orderRes.data.couponInfo.couponId).update({
        data: {
          status: 'available', // 恢复为可用
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

/**
 * 确认收货
 * @param {object} event - 包含订单ID
 * @param {string} event.orderId - 订单ID
 * @param {string} openid - 用户 OpenID
 */
async function internalConfirmReceive(event, openid) {
  const { orderId } = event;
  if (!orderId) { return { code: 400, message: '缺少订单ID参数' }; }
  try {
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) { return { code: 404, message: '订单不存在' }; }
    if (orderRes.data._openid !== openid) { return { code: 403, message: '无权操作此订单' }; }
    if (orderRes.data.status !== 'shipped') { // 只有已发货的订单才能确认收货
      return { code: 400, message: '订单状态无法确认收货' };
    }

    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'completed', // 或 'toEvaluate' (待评价)
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

/**
 * 获取待评价订单详情 (简化版，主要返回商品列表用于评价)
 * @param {object} event - 包含订单ID
 * @param {string} event.orderId - 订单ID
 * @param {string} openid - 用户 OpenID
 */
async function internalGetDetailForReview(event, openid) {
    const { orderId } = event;
    if (!orderId) { return { code: 400, message: '缺少订单ID参数' }; }
    try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        if (!orderRes.data) { return { code: 404, message: '订单不存在' }; }
        if (orderRes.data._openid !== openid) { return { code: 403, message: '无权操作此订单' }; }
        // 校验订单是否可以评价，例如状态为 'completed' 且 hasReviewed 为 false
        if (orderRes.data.status !== 'completed' && orderRes.data.status !== 'toEvaluate') { // 假设 'toEvaluate' 也是可评价状态
             return { code: 400, message: '当前订单状态无法评价' };
        }
        if (orderRes.data.hasReviewed === true) {
            return { code: 400, message: '该订单已评价过' };
        }

        // 返回订单中的商品列表给前端进行评价
        return {
            code: 0,
            message: '获取待评价订单信息成功',
            data: {
                orderId: orderRes.data._id,
                orderNo: orderRes.data.orderNo,
                orderItems: orderRes.data.orderItems // 前端需要这个列表来逐个评价
            }
        };
    } catch (e) {
        console.error('internalGetDetailForReview error:', e);
        return { code: 500, message: '获取待评价订单信息失败', error: e.errMsg || e.message };
    }
}

/**
 * 获取订单摘要 (支付结果页用)
 * @param {object} event - 包含订单ID
 * @param {string} event.orderId - 订单ID
 * @param {string} openid - 用户 OpenID
 */
async function internalGetOrderSummary(event, openid) {
    const { orderId } = event;
    if (!orderId) { return { code: 400, message: '缺少订单ID参数' }; }
    try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        if (!orderRes.data) { return { code: 404, message: '订单不存在' }; }
        if (orderRes.data._openid !== openid) { return { code: 403, message: '无权查看此订单' }; }

        // 返回订单号和总金额等摘要信息
        return {
            code: 0,
            message: '获取订单摘要成功',
            data: {
                orderId: orderRes.data._id,
                orderNo: orderRes.data.orderNo,
                totalAmount: orderRes.data.totalAmount,
                status: orderRes.data.status
                // 可以根据需要添加更多摘要字段
            }
        };
    } catch (e) {
        console.error('internalGetOrderSummary error:', e);
        return { code: 500, message: '获取订单摘要失败', error: e.errMsg || e.message };
    }
}


/**
 * 订单管理主函数，根据 action 分发任务
 */
exports.main = async (event, context) => {
  const { action, ...restEventData } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; // 获取调用用户的openid

  if (!openid && action !== 'somePublicAction') { // 假设有一个不需要openid的例外
    console.error('Orders function called without openid for action:', action);
    return { code: 401, message: '用户身份校验失败，请重新登录 (orders cloud function)' };
  }

  // 将 openid 和剩余参数传递给内部函数
  // 注意：对于 createOrder，它自己也接收一个 event 对象，所以直接把 restEventData 传过去，并在内部函数中解构
  // 其他函数如果只需要特定参数，可以修改调用方式
  console.log(`Orders function called with action: ${action}, openid: ${openid ? 'present' : 'missing'}`);

  switch (action) {
    case 'create':
      // event 包含了 addressId, items, couponId, remark, totalAmount, shippingFee 等
      return internalCreateOrder(restEventData, openid);
    case 'list':
      // event 可能包含 status, page, pageSize
      return internalListOrders(restEventData, openid);
    case 'detail':
      // event 应该包含 orderId
      return internalGetOrderDetail(restEventData, openid);
    case 'countByStatus':
      // 此操作通常不需要前端额外参数，只基于 openid
      return internalCountOrdersByStatus(openid);
    case 'getPaymentParams':
      // event 应该包含 orderId
      return internalGetPaymentParams(restEventData, openid);
    case 'cancel':
      // event 应该包含 orderId
      return internalCancelOrder(restEventData, openid);
    case 'confirmReceive':
      // event 应该包含 orderId
      return internalConfirmReceive(restEventData, openid);
    case 'getDetailForReview': // 新增：获取待评价订单详情
      return internalGetDetailForReview(restEventData, openid);
    case 'getSummary': // 新增：获取订单摘要
      return internalGetOrderSummary(restEventData, openid);
    default:
      console.warn(`Orders function called with unsupported action: ${action}`);
      return { code: 400, message: `订单操作不支持的 action: ${action} (orders cloud function)` };
  }
};
