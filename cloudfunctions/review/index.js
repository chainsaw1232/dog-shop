// cloudfunctions/review/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

/**
 * 更新商品的平均评分和评价总数
 * @param {string} productId - 商品ID
 */
async function updateProductRating(productId) {
  if (!productId) {
    console.warn('[updateProductRating] Product ID is missing.');
    return;
  }
  try {
    const stats = await db.collection('reviews').aggregate()
      .match({
        productId: productId
      })
      .group({
        _id: '$productId',
        avgRating: $.avg('$rating'),
        totalReviews: $.sum(1)
      })
      .end();

    if (stats.list && stats.list.length > 0) {
      const { avgRating, totalReviews } = stats.list[0];
      await db.collection('products').doc(productId).update({
        data: {
          avgRating: parseFloat(avgRating.toFixed(1)), // 保留一位小数
          reviewCount: totalReviews // 可以额外存储评价总数
        }
      });
      console.log(`[updateProductRating] Product ${productId} rating updated: avgRating=${avgRating}, totalReviews=${totalReviews}`);
    } else {
      // 如果没有评价了（比如评价被删除了），可以考虑将评分重置或设为特定值
      await db.collection('products').doc(productId).update({
        data: {
          avgRating: 0, // 或者 5，根据业务逻辑
          reviewCount: 0
        }
      });
      console.log(`[updateProductRating] Product ${productId} has no reviews, rating reset.`);
    }
  } catch (error) {
    console.error(`[updateProductRating] Failed for product ${productId}:`, error);
  }
}

/**
 * 批量添加评价 (针对一个订单中的多个商品)
 * @param {object} event
 * @param {string} event.orderId - 订单ID
 * @param {Array<object>} event.reviews - 评价对象数组, [{ productId, rating, content, images (fileIDs) }]
 * @param {boolean} event.isAnonymous - 是否匿名
 * @param {string} openid - 调用者 openid
 */
async function addBatchReviews(event, openid) {
  const { orderId, reviews, isAnonymous } = event;

  if (!orderId || !Array.isArray(reviews) || reviews.length === 0) {
    return { code: 400, message: '参数错误：缺少订单ID或评价内容' };
  }

  const transaction = await db.startTransaction();
  try {
    // 1. 验证订单状态，确保订单存在、属于该用户、且未被评价过
    const orderRes = await transaction.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      await transaction.rollback();
      return { code: 404, message: '订单不存在' };
    }
    if (orderRes.data._openid !== openid) {
      await transaction.rollback();
      return { code: 403, message: '无权评价此订单' };
    }
    // 允许的状态，例如 'completed' 或 'toEvaluate'
    if (orderRes.data.status !== 'completed' && orderRes.data.status !== 'toEvaluate') {
      await transaction.rollback();
      return { code: 400, message: '当前订单状态无法评价' };
    }
    if (orderRes.data.hasReviewed) {
      // 注意：如果允许追评，这里的逻辑需要调整
      await transaction.rollback();
      return { code: 400, message: '该订单已评价过' };
    }

    const userRes = await transaction.collection('users').where({ _openid: openid }).limit(1).get();
    const userId = (userRes.data && userRes.data.length > 0) ? userRes.data[0]._id : openid; // Fallback to openid if no user doc _id

    const reviewPromises = [];
    const productIdsToUpdateRating = new Set(); // 存储需要更新评分的商品ID

    for (const reviewData of reviews) {
      if (!reviewData.productId || typeof reviewData.rating !== 'number' || reviewData.rating < 1 || reviewData.rating > 5 || typeof reviewData.content !== 'string') {
        // 跳过无效的评价项，或在此处决定是否回滚整个事务
        console.warn('[addBatchReviews] Invalid review item skipped:', reviewData);
        continue;
      }
      
      const newReview = {
        _openid: openid,
        userId: userId, // 关联用户表的 _id
        orderId: orderId,
        productId: reviewData.productId,
        productName: reviewData.productName || '', // 前端可以传入商品名快照
        productImage: reviewData.productImage || '', // 前端可以传入商品图片快照
        rating: reviewData.rating,
        content: reviewData.content.trim(),
        images: Array.isArray(reviewData.images) ? reviewData.images : [], // 图片fileID数组
        isAnonymous: !!isAnonymous,
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        // specInfo: reviewData.specInfo || null, // (可选) 如果评价区分规格
      };
      reviewPromises.push(transaction.collection('reviews').add({ data: newReview }));
      productIdsToUpdateRating.add(reviewData.productId);
    }

    if (reviewPromises.length === 0) {
        await transaction.rollback();
        return { code: 400, message: '没有有效的评价内容可提交' };
    }

    await Promise.all(reviewPromises);

    // 2. 更新订单的评价状态
    await transaction.collection('orders').doc(orderId).update({
      data: {
        hasReviewed: true,
        updateTime: db.serverDate()
      }
    });

    await transaction.commit(); // 先提交事务，确保评价和订单状态写入

    // 3. 独立更新所有相关商品的平均评分 (事务提交后执行，避免长时间占用事务)
    for (const productId of productIdsToUpdateRating) {
      await updateProductRating(productId);
    }

    return { code: 0, message: '评价提交成功', data: { count: reviewPromises.length } };

  } catch (error) {
    await transaction.rollback();
    console.error('[addBatchReviews] Error:', error);
    return { code: 500, message: '评价提交失败，请稍后再试', error: error.message || error.errMsg };
  }
}

/**
 * 获取商品评价列表
 * @param {object} event
 * @param {string} event.productId - 商品ID
 * @param {string} [event.type='all'] - 评价类型：all, good, medium, bad, hasImage
 * @param {number} [event.page=1] - 页码
 * @param {number} [event.pageSize=10] - 每页数量
 */
async function listReviewsByProduct(event) {
  const { productId, type = 'all', page = 1, pageSize = 10 } = event;

  if (!productId) {
    return { code: 400, message: '缺少商品ID参数' };
  }

  try {
    const query = { productId: productId };
    if (type === 'good') query.rating = _.gte(4);
    else if (type === 'medium') query.rating = 3;
    else if (type === 'bad') query.rating = _.lte(2);
    else if (type === 'hasImage') query.images = _.exists(true).and(_.neq([]));

    const skip = (Number(page) - 1) * Number(pageSize);

    const totalRes = await db.collection('reviews').where(query).count();
    const total = totalRes.total;

    let reviewsList = [];
    if (total > 0) {
        reviewsList = await db.collection('reviews')
        .where(query)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(Number(pageSize))
        .get();
        reviewsList = reviewsList.data;
    }
    
    // 丰富评价的用户信息
    const userIds = reviewsList.filter(r => !r.isAnonymous && r.userId).map(r => r.userId);
    let usersMap = {};
    if (userIds.length > 0) {
        const usersRes = await db.collection('users').where({
            _id: _.in([...new Set(userIds)]) // 去重
        }).field({ nickName: true, avatarUrl: true }).get();
        usersRes.data.forEach(u => usersMap[u._id] = u);
    }

    const defaultAnonymousAvatar = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/avatar/default_avatar.png'; //

    const formattedReviews = reviewsList.map(review => {
        let userDisplay = {
            nickName: '匿名用户',
            avatarUrl: defaultAnonymousAvatar
        };
        if (!review.isAnonymous && review.userId && usersMap[review.userId]) {
            userDisplay.nickName = usersMap[review.userId].nickName || '用户';
            userDisplay.avatarUrl = usersMap[review.userId].avatarUrl || defaultAnonymousAvatar;
        }
        return {
            ...review,
            createTimeFormatted: review.createTime ? new Date(review.createTime).toISOString().split('T')[0] : '',
            user: userDisplay
        };
    });


    return {
      code: 0,
      message: '获取评价列表成功',
      data: {
        list: formattedReviews,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / Number(pageSize))
      }
    };
  } catch (error) {
    console.error('[listReviewsByProduct] Error:', error);
    return { code: 500, message: '获取评价列表失败', error: error.message || error.errMsg };
  }
}

/**
 * 获取商品评价统计
 * @param {object} event
 * @param {string} event.productId - 商品ID
 */
async function getReviewStatsByProduct(event) {
  const { productId } = event;
  if (!productId) {
    return { code: 400, message: '缺少商品ID参数' };
  }

  try {
    const productRes = await db.collection('products').doc(productId).field({ avgRating: true }).get();
    const productAvgRating = (productRes.data && typeof productRes.data.avgRating === 'number') ? productRes.data.avgRating : 0;

    const countQuery = { productId: productId };
    
    const totalPromise = db.collection('reviews').where(countQuery).count();
    const goodCountPromise = db.collection('reviews').where({ ...countQuery, rating: _.gte(4) }).count();
    const mediumCountPromise = db.collection('reviews').where({ ...countQuery, rating: 3 }).count();
    const badCountPromise = db.collection('reviews').where({ ...countQuery, rating: _.lte(2) }).count();
    const hasImageCountPromise = db.collection('reviews').where({ ...countQuery, images: _.exists(true).and(_.neq([])) }).count();

    const [totalRes, goodRes, mediumRes, badRes, hasImageRes] = await Promise.all([
        totalPromise, goodCountPromise, mediumCountPromise, badCountPromise, hasImageCountPromise
    ]);

    const total = totalRes.total;
    const goodCount = goodRes.total;
    const mediumCount = mediumRes.total;
    const badCount = badRes.total;
    const hasImageCount = hasImageRes.total;
    
    const goodRate = total > 0 ? Math.round((goodCount / total) * 100) : (productAvgRating >=4 ? 100 : 0); // 如果没评价，好评率基于商品平均分或给100

    return {
      code: 0,
      message: '获取评价统计成功',
      data: {
        total,
        goodCount,
        mediumCount,
        badCount,
        hasImageCount,
        goodRate,
        avgRating: productAvgRating // 直接从商品表读取，由 updateProductRating 维护
      }
    };
  } catch (error) {
    console.error('[getReviewStatsByProduct] Error:', error);
    return { code: 500, message: '获取评价统计失败', error: error.message || error.errMsg };
  }
}


// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; // 用户 openid

  if (!openid && event.action !== 'listByProduct' && event.action !== 'getStatsByProduct') { // 部分查询接口可以不强求登录
    return { code: 401, message: '用户未登录或登录状态异常' };
  }
  
  console.log(`[Review CF] Action: ${event.action}, Caller OpenID: ${openid ? '******' : 'N/A'}`);

  switch (event.action) {
    case 'addBatch':
      return await addBatchReviews(event, openid);
    case 'listByProduct':
      return await listReviewsByProduct(event); // openid 不是必须的，但可以用来判断用户是否点赞过某条评价等扩展功能
    case 'getStatsByProduct':
      return await getReviewStatsByProduct(event);
    default:
      return { code: 400, message: '未知操作类型' };
  }
};