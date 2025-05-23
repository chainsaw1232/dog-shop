// cloudfunctions/getProducts/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const productsCollection = db.collection('products'); // 确保这是你正确的商品集合名称
const _ = db.command;

// 辅助函数：格式化图片路径 (如果你的商品图片路径需要转换)
// const CLOUD_IMAGE_BASE_PATH = 'cloud://YOUR_ENV_ID.YOUR_DB_ALIAS/images/products'; // 示例，请替换成你的实际路径
// function formatProductImage(relativePath) {
//   if (!relativePath) return '';
//   if (relativePath.startsWith('cloud://') || relativePath.startsWith('http')) return relativePath;
//   return `${CLOUD_IMAGE_BASE_PATH}/${relativePath.startsWith('/') ? relativePath.substring(1) : relativePath}`;
// }

async function getProductList(params) {
  const { categoryId, keyword, page = 1, pageSize = 10, isNew, isHot } = params; // Renamed limit to pageSize for clarity
  try {
    const skip = (Number(page) - 1) * Number(pageSize);
    let query = {
        // status: 'active' // 建议添加: 只查询上架商品
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
    // 注意：isNew 和 isHot 应该用布尔值 true 来查询
    if (isNew === true) {
        query.isNew = true;
    }
    if (isHot === true) {
        query.isHot = true;
    }

    console.log(`[getProductList] Querying 'products' with:`, JSON.stringify(query), `Page: ${page}, PageSize: ${pageSize}`);

    const countResult = await productsCollection.where(query).count();
    const total = countResult.total;
    console.log(`[getProductList] Total products found for query: ${total}`);

    let productsData = [];
    if (total > 0) {
        const productsResult = await productsCollection
            .where(query)
            .orderBy('createTime', 'desc') // 你可以根据需要更改排序字段，例如销量 'sales'
            .skip(skip)
            .limit(Number(pageSize))
            .get();
        productsData = productsResult.data || [];

        // 如果需要在这里转换图片路径:
        // productsData = productsData.map(p => ({
        //   ...p,
        //   mainImage: formatProductImage(p.mainImage),
        //   images: p.images ? p.images.map(img => formatProductImage(img)) : []
        // }));
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
    // 返回更详细的错误信息，帮助前端定位
    return {
        code: 5001, // 自定义错误码
        message: '服务器开小差了，获取商品列表失败，请稍后再试。', // 用户友好的消息
        error: { // 包含一些错误细节，但不要泄露敏感信息
            name: err.name,
            message: err.message,
            errMsg: err.errMsg // errMsg 通常包含更具体的微信云开发错误信息
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
    // 优先尝试作为文档 _id 查询 (通常是24位字符串)
    if (typeof id === 'string' && id.length >= 16) { // _id 长度通常较长
        productDoc = await productsCollection.doc(id).get().catch(() => null);
    }

    // 如果按 _id 未找到，或者 id 不是标准的 _id 格式 (例如，它是一个数字或短字符串 "prod_001")
    // 则尝试按自定义的 'id' 字段查询
    if (!productDoc || !productDoc.data) {
        // 检查 id 是否可以被视为数字 id
        const numericId = Number(id);
        if (!isNaN(numericId) && String(numericId) === String(id)) { // 确保转换前后一致，避免 "prod_001" 被转为 0
            const productResult = await productsCollection.where({ id: numericId }).limit(1).get();
            if (productResult.data && productResult.data.length > 0) {
                productDoc = { data: productResult.data[0] }; // 保持结构一致
            }
        } else if (typeof id === 'string') {
            // 如果 id 是字符串，但不是 _id，尝试作为自定义字符串 id 查询
            const productResult = await productsCollection.where({ id: id }).limit(1).get();
            if (productResult.data && productResult.data.length > 0) {
                productDoc = { data: productResult.data[0] };
            }
        }
    }

    if (!productDoc || !productDoc.data) {
      return { code: 4041, message: `商品 (ID: ${id}) 未找到` };
    }
    const productData = productDoc.data;

    // 确保使用文档的 _id 来更新浏览量
    if (productData._id) {
        await productsCollection.doc(productData._id).update({
            data: { viewCount: _.inc(1) }
        }).catch(err => console.warn(`[getProductDetail] 更新商品 ${productData._id} 浏览量失败:`, err));
    }
    
    // 如果需要在这里转换图片路径:
    // productData.mainImage = formatProductImage(productData.mainImage);
    // productData.images = productData.images ? productData.images.map(img => formatProductImage(img)) : [];

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
  const { action, id, categoryId, keyword, page = 1, pageSize = 10, isNew, isHot } = event; //接收pageSize
  console.log(`[云函数 getProducts] Action: ${action}, Incoming Params:`, JSON.stringify(event));

  const listParams = { 
    categoryId, 
    keyword, 
    page: Number(page), 
    pageSize: Number(pageSize) // 使用pageSize
  };
  // 确保布尔值正确传递和处理
  if (isNew !== undefined) listParams.isNew = (isNew === true || String(isNew).toLowerCase() === 'true');
  if (isHot !== undefined) listParams.isHot = (isHot === true || String(isHot).toLowerCase() === 'true');

  switch (action) {
    case 'detail':
      return await getProductDetail(id);
    case 'list':
      return await getProductList(listParams);
    // case 'recommend': // 如果有推荐逻辑，可以单独实现或作为 list 的一种特殊参数组合
    //   return await getRecommendProducts({ pageSize: Number(pageSize) });
    default:
      console.warn(`[云函数 getProducts] 未知 action: ${action}`);
      return { code: 4000, message: '未知操作 (getProducts)' };
  }
};
