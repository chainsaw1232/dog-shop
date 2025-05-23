// 云函数入口文件 cloudfunctions/getCategories/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const categoriesCollection = db.collection('categories');

// 你的云存储基础路径
const CLOUD_IMAGE_BASE_PATH = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images';

function formatImagePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    return '';
  }
  if (relativePath.startsWith('cloud://')) {
    return relativePath;
  }
  let pathSegment = relativePath;
  if (pathSegment.startsWith('cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/')) {
    pathSegment = pathSegment.substring('cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/'.length);
  } else if (pathSegment.startsWith('/')) {
    pathSegment = pathSegment.substring(1);
  }
  return `${CLOUD_IMAGE_BASE_PATH}/${pathSegment}`;
}

/**
 * 获取商品分类列表
 * @param {object} event - 可选参数，例如 { activeOnly: true }
 * @param {object} context
 */
exports.main = async (event, context) => {
  console.log(`[云函数 getCategories] event:`, event);
  try {
    let query = {};
    if (event.activeOnly === true || event.status === 'active') { // 如果需要只获取激活的分类
      query.status = 'active';
    }

    const categoriesRes = await categoriesCollection
      .where(query)
      .orderBy('order', 'asc') // 按 order 字段升序排列
      .get();

    const formattedCategories = categoriesRes.data.map(category => ({
      ...category,
      iconUrl: formatImagePath(category.iconUrl) // 格式化图标路径
    }));

    return {
      code: 0,
      message: '获取分类列表成功',
      data: formattedCategories
    };
  } catch (error) {
    console.error('[云函数 getCategories] 获取失败:', error);
    return {
      code: 500,
      message: '获取分类列表失败',
      error: error.message || error.errMsg || error
    };
  }
};
