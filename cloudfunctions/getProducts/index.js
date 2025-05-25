// cloudfunctions/getProducts/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const productsCollection = db.collection('products'); // 确保这是你正确的商品集合名称
const _ = db.command;

// --- 新增：图片路径格式化相关的常量和函数 ---
// 你的云存储基础路径，确保这个和你云存储中实际的图片存放目录一致
// 例如: 'cloud://YOUR_ENV_ID.YOUR_DB_ALIAS/images'
// 从你的其他云函数（如getHomeData）推断，可能是这个路径
const CLOUD_IMAGE_BASE_PATH = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images';
// 默认的占位图片，当图片路径无效时使用 (可选)
const PLACEHOLDER_IMAGE = CLOUD_IMAGE_BASE_PATH + '/placeholder.png'; // 确保这个占位图真实存在

/**
 * 辅助函数：格式化图片路径为完整的 File ID
 * @param {string} relativePath - 数据库中存储的图片相对路径或已经是云路径
 * @returns {string} - 完整的云存储 File ID，如果无效则返回占位图路径或空字符串
 */
function formatImagePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    console.warn('[formatImagePath] 路径无效或非字符串:', relativePath, '将使用占位图或空路径。');
    // return PLACEHOLDER_IMAGE; // 如果想用占位图
    return ''; // 或者返回空字符串，让小程序图片加载失败事件处理
  }
  // 如果已经是完整的 cloud:// 路径，则直接返回
  if (relativePath.startsWith('cloud://')) {
    return relativePath;
  }

  // 处理相对路径 (假设 relativePath 是类似 'products/product_01.png' 的形式)
  let pathSegment = relativePath;
  if (CLOUD_IMAGE_BASE_PATH.endsWith('/') && pathSegment.startsWith('/')) {
    pathSegment = pathSegment.substring(1);
  } else if (!CLOUD_IMAGE_BASE_PATH.endsWith('/') && !pathSegment.startsWith('/') && pathSegment !== '') {
    return `${CLOUD_IMAGE_BASE_PATH}/${pathSegment}`;
  }
  return `${CLOUD_IMAGE_BASE_PATH}${pathSegment}`;
}
// --- 图片路径格式化相关的常量和函数结束 ---

async function getProductList(params) {
  const { categoryId, keyword, page = 1, pageSize = 10, isNew, isHot, isRecommend } = params; // 添加 isRecommend
  try {
    const skip = (Number(page) - 1) * Number(pageSize);
    let query = {
        status: 'active' // 通常只查询上架商品
    };

    if (categoryId && categoryId !== 'all') {
      query.categoryId = categoryId;
    }
    if (keyword && String(keyword).trim() !== '') {
      query.name = db.RegExp({
        regexp: String(keyword).trim(),
        options: 'i' // 不区分大小写
      });
    }
    if (isNew === true) {
        query.isNew = true;
    }
    if (isHot === true) {
        query.isHot = true;
    }
    // --- 新增：处理 isRecommend 参数 ---
    if (isRecommend === true) {
        query.isRecommend = true;
    }
    // --- 结束新增 ---

    console.log(`[getProductList] Querying 'products' with:`, JSON.stringify(query), `Page: ${page}, PageSize: ${pageSize}`);

    const countResult = await productsCollection.where(query).count();
    const total = countResult.total;
    console.log(`[getProductList] Total products found for query: ${total}`);

    let productsData = [];
    if (total > 0) {
        const productsResult = await productsCollection
            .where(query)
            .orderBy('createTime', 'desc') // 你可以根据需要更改排序字段
            .skip(skip)
            .limit(Number(pageSize))
            .get();
        productsData = productsResult.data || [];

        // --- 新增：格式化图片路径 ---
        productsData = productsData.map(p => ({
          ...p,
          mainImage: formatImagePath(p.mainImage), // 格式化主图
          // 如果商品有多张图片，并且你也需要在列表或推荐中显示它们，也需要格式化
          images: p.images ? p.images.map(img => formatImagePath(img)) : []
        }));
        // --- 结束新增 ---
    }

    return {
      code: 0,
      message: '获取商品列表成功',
      data: {
        list: productsData,
        total: total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / Number(pageSize))
      }
    };
  } catch (err) {
    console.error(`[云函数 getProducts.getProductList] 获取商品列表失败. Params: ${JSON.stringify(params)}. Error:`, err);
    return {
        code: 5001,
        message: '服务器开小差了，获取商品列表失败，请稍后再试。',
        error: {
            name: err.name,
            message: err.message,
            errMsg: err.errMsg
        }
    };
  }
}

async function getProductDetail(id) {
  if (!id) {
    return { code: 4001, message: '商品ID缺失' };
  }
  try {
    let productDoc;
    if (typeof id === 'string' && id.length >= 16) {
        productDoc = await productsCollection.doc(id).get().catch(() => null);
    }

    if (!productDoc || !productDoc.data) {
        const numericId = Number(id);
        if (!isNaN(numericId) && String(numericId) === String(id)) {
            const productResult = await productsCollection.where({ id: numericId }).limit(1).get();
            if (productResult.data && productResult.data.length > 0) {
                productDoc = { data: productResult.data[0] };
            }
        } else if (typeof id === 'string') {
            const productResult = await productsCollection.where({ id: id }).limit(1).get();
            if (productResult.data && productResult.data.length > 0) {
                productDoc = { data: productResult.data[0] };
            }
        }
    }

    if (!productDoc || !productDoc.data) {
      return { code: 4041, message: `商品 (ID: ${id}) 未找到` };
    }
    let productData = productDoc.data;

    if (productData._id) {
        await productsCollection.doc(productData._id).update({
            data: { viewCount: _.inc(1) }
        }).catch(err => console.warn(`[getProductDetail] 更新商品 ${productData._id} 浏览量失败:`, err));
    }
    
    // --- 新增：格式化详情页的图片路径 ---
    productData.mainImage = formatImagePath(productData.mainImage);
    productData.images = productData.images ? productData.images.map(img => formatImagePath(img)) : [];
    if (productData.specs && productData.specs.length > 0) {
        productData.specs = productData.specs.map(spec => ({
            ...spec,
            image: spec.image ? formatImagePath(spec.image) : '' // 格式化规格图片
        }));
    }
    // --- 结束新增 ---

    return { code: 0, message: '获取商品详情成功', data: productData };
  } catch (err) {
    console.error(`[getProductDetail] 获取商品详情失败 for ID ${id}:`, err);
    return { 
        code: 5002, 
        message: '获取商品详情失败',
        error: { name: err.name, message: err.message, errMsg: err.errMsg }
    };
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, id, categoryId, keyword, page = 1, pageSize = 10, isNew, isHot, isRecommend } = event; // 添加 isRecommend
  console.log(`[云函数 getProducts] Action: ${action}, Incoming Params:`, JSON.stringify(event));

  const listParams = { 
    categoryId, 
    keyword, 
    page: Number(page), 
    pageSize: Number(pageSize)
  };
  if (isNew !== undefined) listParams.isNew = (isNew === true || String(isNew).toLowerCase() === 'true');
  if (isHot !== undefined) listParams.isHot = (isHot === true || String(isHot).toLowerCase() === 'true');
  // --- 新增：传递 isRecommend 参数 ---
  if (isRecommend !== undefined) listParams.isRecommend = (isRecommend === true || String(isRecommend).toLowerCase() === 'true');
  // --- 结束新增 ---


  switch (action) {
    case 'detail':
      return await getProductDetail(id);
    case 'list':
      return await getProductList(listParams);
    default:
      console.warn(`[云函数 getProducts] 未知 action: ${action}`);
      return { code: 4000, message: '未知操作 (getProducts)' };
  }
};
