// cloudfunctions/getProducts/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const productsCollection = db.collection('products');
const _ = db.command;

const CLOUD_IMAGE_BASE_PATH = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images';
const PLACEHOLDER_IMAGE = CLOUD_IMAGE_BASE_PATH + '/placeholder.png';

function formatImagePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    console.warn('[formatImagePath] 路径无效或非字符串:', relativePath, '将使用占位图或空路径。');
    return ''; // 返回空字符串或一个默认的占位图File ID
  }
  if (relativePath.startsWith('cloud://')) {
    return relativePath;
  }
  let pathSegment = relativePath;
  // 修正路径拼接，确保不会出现双斜杠，且能正确处理开头无斜杠的相对路径
  if (CLOUD_IMAGE_BASE_PATH.endsWith('/') && pathSegment.startsWith('/')) {
    pathSegment = pathSegment.substring(1);
  } else if (!CLOUD_IMAGE_BASE_PATH.endsWith('/') && !pathSegment.startsWith('/') && pathSegment !== '') {
    return `${CLOUD_IMAGE_BASE_PATH}/${pathSegment}`;
  } else if (CLOUD_IMAGE_BASE_PATH.endsWith('/') && !pathSegment.startsWith('/')) {
    // CLOUD_IMAGE_BASE_PATH ends with / and pathSegment does not start with /
    // No change needed for pathSegment
  } else if (!CLOUD_IMAGE_BASE_PATH.endsWith('/') && pathSegment.startsWith('/')) {
     // CLOUD_IMAGE_BASE_PATH does not end with / and pathSegment starts with /
     // No change needed for pathSegment
  }
  return `${CLOUD_IMAGE_BASE_PATH}${pathSegment}`;
}

async function getProductList(params) {
  const { categoryId, keyword, page = 1, pageSize = 10, isNew, isHot, isRecommend } = params;
  try {
    const skip = (Number(page) - 1) * Number(pageSize);
    let query = {
        status: 'active' // 只获取上架商品
    };

    if (categoryId && categoryId !== 'all') {
      query.categoryId = categoryId;
    }
    if (keyword && String(keyword).trim() !== '') {
      query.name = db.RegExp({
        regexp: String(keyword).trim(),
        options: 'i' // 忽略大小写搜索
      });
    }
    if (isNew === true) {
        query.isNew = true;
    }
    if (isHot === true) {
        query.isHot = true;
    }
    if (isRecommend === true) {
        query.isRecommend = true;
    }

    console.log(`[getProductList] Querying 'products' with:`, JSON.stringify(query), `Page: ${page}, PageSize: ${pageSize}`);

    const countResult = await productsCollection.where(query).count();
    const total = countResult.total;
    console.log(`[getProductList] Total products found for query: ${total}`);

    let productsData = [];
    if (total > 0) {
        const productsResult = await productsCollection
            .where(query)
            .orderBy('createTime', 'desc') // 默认按创建时间降序
            .skip(skip)
            .limit(Number(pageSize))
            .get();
        productsData = productsResult.data || [];

        productsData = productsData.map(p => ({
          ...p,
          mainImage: formatImagePath(p.mainImage),
          images: p.images ? p.images.map(img => formatImagePath(img)) : []
        }));
    }

    return {
      code: 0, // 标准化成功代码为0
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
        code: 5001, // 自定义错误码
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
  if (!id || typeof id !== 'string') {
    return { code: 4001, message: '商品ID无效或缺失 (必须为字符串)' };
  }
  console.log(`[getProductDetail] Attempting to fetch product with _id: ${id}`);
  try {
    const productDoc = await productsCollection.doc(id).get();

    if (!productDoc || !productDoc.data) {
      // 这个分支理论上会被下面的 catch(err.errCode === -502004) 捕获
      console.warn(`[getProductDetail] Product with _id: ${id} not found (productDoc.data is falsy).`);
      return { code: 4041, message: `商品 (ID: ${id}) 未找到或已下架` };
    }
    
    let productData = productDoc.data;

    // 确保商品是 active 状态，如果不是，则也视为找不到或不可访问
    if (productData.status !== 'active') {
        console.warn(`[getProductDetail] Product with _id: ${id} is not active (status: ${productData.status}).`);
        return { code: 4043, message: `商品 (ID: ${id}) 已下架或暂不可见` };
    }

    // 更新浏览量
    await productsCollection.doc(productData._id).update({
        data: { viewCount: _.inc(1) }
    }).catch(updateErr => console.warn(`[getProductDetail] 更新商品 ${productData._id} 浏览量失败:`, updateErr)); // 即使更新失败也继续
    
    // 格式化图片路径
    productData.mainImage = formatImagePath(productData.mainImage);
    productData.images = productData.images ? productData.images.map(img => formatImagePath(img)) : [];
    if (productData.specs && productData.specs.length > 0) {
        productData.specs = productData.specs.map(spec => ({
            ...spec,
            image: spec.image ? formatImagePath(spec.image) : ''
        }));
    }

    console.log(`[getProductDetail] Product with _id: ${id} fetched successfully.`);
    return { code: 0, message: '获取商品详情成功', data: productData }; // 标准化成功代码为0

  } catch (err) {
    console.error(`[getProductDetail] 获取商品详情失败 for _id ${id}. Error:`, err);
    // 更准确地判断文档不存在的错误
    // -502004: document non-exists (旧版SDK或特定情况)
    // -502002: invalid document id (如果ID格式完全不对，但我们前面校验了是string)
    // 新版SDK中，查询不存在的doc，err.code可能是 "DOCUMENT_NOT_FOUND" 或类似的字符串
    // 或者检查 err.message 是否包含 "document non-exists" "does not exist"
    if (err.errCode === -502004 || 
        (typeof err.code === 'string' && err.code.includes('DOCUMENT_NOT_FOUND')) ||
        (err.message && (err.message.toLowerCase().includes('document non-exists') || err.message.toLowerCase().includes('does not exist')))) {
        console.warn(`[getProductDetail] Product with _id: ${id} does not exist (Error Code: ${err.errCode || err.code}).`);
        return { code: 4042, message: `您查看的商品 (ID: ${id}) 可能已下架或不存在` };
    }
    // 其他类型的数据库错误或未知错误
    return { 
        code: 5002, 
        message: '获取商品详情时服务器遇到问题，请稍后再试', // 更通用的服务器错误提示
        error: { name: err.name, message: err.message, errMsg: err.errMsg, errCode: err.errCode || err.code }
    };
  }
}

exports.main = async (event, context) => {
  const { action, id, categoryId, keyword, page = 1, pageSize = 10, isNew, isHot, isRecommend } = event;
  console.log(`[云函数 getProducts] Action: ${action}, Incoming Params:`, JSON.stringify(event));

  const listParams = { 
    categoryId, 
    keyword, 
    page: Number(page), 
    pageSize: Number(pageSize)
  };
  if (isNew !== undefined) listParams.isNew = (isNew === true || String(isNew).toLowerCase() === 'true');
  if (isHot !== undefined) listParams.isHot = (isHot === true || String(isHot).toLowerCase() === 'true');
  if (isRecommend !== undefined) listParams.isRecommend = (isRecommend === true || String(isRecommend).toLowerCase() === 'true');

  switch (action) {
    case 'detail':
      // id 从前端传来，经过前端 String(currentId) 处理，应为字符串
      return await getProductDetail(id); 
    case 'list':
      return await getProductList(listParams);
    default:
      console.warn(`[云函数 getProducts] 未知 action: ${action}`);
      return { code: 4000, message: '未知操作 (getProducts)' };
  }
};