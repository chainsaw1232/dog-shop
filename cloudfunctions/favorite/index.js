// 云函数入口文件 cloudfunctions/favorite/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const favoriteCollection = db.collection('favorites'); // 收藏表
const productsCollection = db.collection('products'); // 商品表

// 你的云存储基础路径 (这个路径必须和你云存储中实际的图片存放路径一致)
// 从你提供的 File ID 截图来看，这个路径是正确的
const CLOUD_IMAGE_BASE_PATH = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images';

/**
 * 辅助函数：格式化图片路径为完整的 File ID
 * @param {string} relativePath - 数据库中存储的图片路径 (如: "cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/banner/banner_01.png" 或 "banner/banner_01.png")
 * @returns {string} - 完整的云存储 File ID
 */
function formatImagePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    console.warn('[formatImagePath] 路径无效或非字符串:', relativePath);
    return ''; // 如果路径无效，返回空字符串或一个默认的占位图File ID
  }
  // 如果已经是完整的 cloud:// 路径，则直接返回，避免重复拼接
  if (relativePath.startsWith('cloud://')) {
    return relativePath;
  }

  let pathSegment = relativePath;
  // **核心修改点**：移除路径中可能存在的 "cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/" 前缀
  if (pathSegment.startsWith('cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/')) {
    pathSegment = pathSegment.substring('cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/'.length);
  } else if (pathSegment.startsWith('/')) {
    // 如果是以 / 开头但不是 cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/ (例如直接是 /banner/banner_01.png)
    // 也移除开头的 /
    pathSegment = pathSegment.substring(1);
  }
  return `${CLOUD_IMAGE_BASE_PATH}/${pathSegment}`;
}


/**
 * 收藏云函数主入口
 * @param {object} event
 * @param {string} event.action - 操作类型: 'add', 'remove', 'check', 'list'
 * @param {string} [event.productId] - 商品ID (用于 add, remove by productId, check)
 * @param {string} [event.favoriteId] - 收藏记录的 _id (用于 remove by favoriteId)
 * @param {number} [event.page=1] - 页码 (用于 list)
 * @param {number} [event.pageSize=10] - 每页数量 (用于 list)
 * @param {object} context
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 401, message: '用户未登录' };
  }

  const { action, productId, favoriteId, page = 1, pageSize = 10 } = event;

  console.log(`[云函数 favorite] action: ${action}, openid: ${openid ? '******' : '无'}, productId: ${productId}, favoriteId: ${favoriteId}`);

  try {
    switch (action) {
      case 'add':
        if (!productId) return { code: 400, message: '缺少商品ID' };
        return await addFavorite(openid, productId);
      case 'remove':
        // 优先通过 favoriteId 删除，如果提供了的话
        if (favoriteId) {
             return await removeFavoriteById(openid, favoriteId);
        } else if (productId) {
             return await removeFavoriteByProductId(openid, productId);
        } else {
            return { code: 400, message: '缺少收藏ID或商品ID' };
        }
      case 'check':
        if (!productId) return { code: 400, message: '缺少商品ID' };
        return await checkFavorite(openid, productId);
      case 'list':
        return await getFavoriteList(openid, Number(page), Number(pageSize));
      default:
        return { code: 400, message: '未知操作' };
    }
  } catch (error) {
    console.error(`[云函数 favorite] 执行 action ${action} 失败:`, error);
    return { code: 500, message: '服务器内部错误', error: error.message || error.errMsg || error };
  }
};

async function addFavorite(openid, productId) {
  // 检查商品是否存在
  const productRes = await productsCollection.doc(productId).get().catch(err => {
    console.error(`[addFavorite] 查询商品 ${productId} 失败:`, err);
    return null;
  });

  if (!productRes || !productRes.data) {
    return { code: 404, message: '商品不存在或已下架' };
  }

  // 检查是否已收藏
  const existing = await favoriteCollection.where({
    _openid: openid,
    productId: productId
  }).count();

  if (existing.total > 0) {
    const favRecord = await favoriteCollection.where({ _openid: openid, productId: productId }).limit(1).get();
    return { code: 0, message: '商品已在收藏中', data: { isFavorite: true, favoriteId: favRecord.data.length > 0 ? favRecord.data[0]._id : null } };
  }

  const addRes = await favoriteCollection.add({
    data: {
      _openid: openid,
      productId: productId,
      createTime: db.serverDate()
    }
  });
  return { code: 0, message: '收藏成功', data: { isFavorite: true, favoriteId: addRes._id } };
}

async function removeFavoriteByProductId(openid, productId) {
  const removeRes = await favoriteCollection.where({
    _openid: openid,
    productId: productId
  }).remove();

  if (removeRes.stats.removed > 0) {
    return { code: 0, message: '取消收藏成功', data: { isFavorite: false } };
  } else {
    // 可能是因为之前就没有收藏这个商品
    return { code: 0, message: '该商品未被收藏或已取消', data: { isFavorite: false } };
  }
}

async function removeFavoriteById(openid, favoriteId) {
    const favRecord = await favoriteCollection.doc(favoriteId).get().catch(err => {
        console.error(`[removeFavoriteById] 查询收藏记录 ${favoriteId} 失败:`, err);
        return null;
    });
    if (!favRecord || !favRecord.data) {
        return { code: 404, message: '收藏记录不存在' };
    }
    if (favRecord.data._openid !== openid) {
        return { code: 403, message: '无权限删除此收藏记录' };
    }

    const removeRes = await favoriteCollection.doc(favoriteId).remove();
    if (removeRes.stats.removed > 0) {
        return { code: 0, message: '取消收藏成功', data: { isFavorite: false } };
    } else {
        return { code: 500, message: '取消收藏失败，请重试' };
    }
}


async function checkFavorite(openid, productId) {
  const countRes = await favoriteCollection.where({
    _openid: openid,
    productId: productId
  }).count();

  const isFavorite = countRes.total > 0;
  let favoriteId = null;
  if (isFavorite) {
    const favRecord = await favoriteCollection.where({ _openid: openid, productId: productId }).limit(1).get();
    if (favRecord.data.length > 0) {
        favoriteId = favRecord.data[0]._id;
    }
  }
  return { code: 0, message: '检查成功', data: { isFavorite, favoriteId } };
}

async function getFavoriteList(openid, page = 1, pageSize = 10) {
  const skip = (page - 1) * pageSize;

  const totalRes = await favoriteCollection.where({ _openid: openid }).count();
  const total = totalRes.total;

  const favoritesRes = await favoriteCollection.where({ _openid: openid })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  const productIds = favoritesRes.data.map(fav => fav.productId);
  if (productIds.length === 0) {
    return { code: 0, message: '暂无收藏', data: { list: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  }

  const productsRes = await productsCollection.where({
    _id: _.in(productIds)
  }).field({
    name: true,
    mainImage: true,
    price: true,
    originalPrice: true,
    sales: true,
    status: true, // 获取商品状态
  }).get();

  const productsMap = new Map();
  productsRes.data.forEach(p => productsMap.set(p._id, p));

  const list = favoritesRes.data.map(fav => {
    const productInfo = productsMap.get(fav.productId);
    return {
      _id: fav._id, // 收藏记录的ID
      productId: fav.productId,
      createTime: fav.createTime,
      productName: productInfo ? productInfo.name : '商品信息已失效',
      productImage: productInfo ? formatImagePath(productInfo.mainImage) : formatImagePath('cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/placeholder.png'),
      price: productInfo ? productInfo.price : 'N/A',
      originalPrice: productInfo ? productInfo.originalPrice : null,
      sales: productInfo ? productInfo.sales : 0,
      status: productInfo ? productInfo.status : 'inactive', // 商品状态
    };
  }).filter(item => item.productName !== '商品信息已失效'); // 过滤掉商品信息失效的项

  return {
    code: 0,
    message: '获取收藏列表成功',
    data: {
      list,
      total, // 这里的total应该是过滤前的总数，如果需要过滤后的总数，需要重新计算
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}
