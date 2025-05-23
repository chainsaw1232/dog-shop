// 云函数入口文件 cloudfunctions/cart/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cartCollection = db.collection('cart');
const productsCollection = db.collection('products'); 
const _ = db.command;

// --- 新增：图片路径格式化相关的常量和函数 ---
// 你的云存储基础路径，确保这个和你云存储中实际的图片存放目录一致
const CLOUD_IMAGE_BASE_PATH = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images'; 
// 默认的占位图片，当图片路径无效时使用
const PLACEHOLDER_IMAGE = CLOUD_IMAGE_BASE_PATH + '/placeholder.png'; // 假设你有一个占位图

/**
 * 辅助函数：格式化图片路径为完整的 File ID
 * @param {string} relativePath - 数据库中存储的图片相对路径或已经是云路径
 * @returns {string} - 完整的云存储 File ID，如果无效则返回占位图路径
 */
function formatImagePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    console.warn('[formatImagePath] 路径无效或非字符串:', relativePath, '将使用占位图。');
    return PLACEHOLDER_IMAGE; 
  }
  // 如果已经是完整的 cloud:// 路径，则直接返回
  if (relativePath.startsWith('cloud://')) {
    return relativePath;
  }

  let pathSegment = relativePath;
  // 移除路径中可能存在的 "cloud://<env_id>/images/" 前缀，避免重复拼接
  // 注意：这里的 env_id 应该和你实际的 CLOUD_IMAGE_BASE_PATH 匹配
  const cloudBasePathPrefix = CLOUD_IMAGE_BASE_PATH + '/'; // 例如 "cloud://env-id.xxxx/images/"
  if (pathSegment.startsWith(cloudBasePathPrefix)) {
    // 如果已经是基于 CLOUD_IMAGE_BASE_PATH 的完整路径了，但不是 cloud:// 开头（理论上不应该）
    // 或者说，如果 relativePath 是 "images/products/product_01.png" 这种，而 CLOUD_IMAGE_BASE_PATH 是 "cloud://env/images"
    // 那么这里逻辑要调整。
    // 当前的逻辑是：如果 relativePath 是 "/products/product_01.png" 这种，会拼接成 "cloud://env/images/products/product_01.png"
    // 如果 relativePath 是 "products/product_01.png" 这种，也会拼接正确。
  } else if (pathSegment.startsWith('/')) { 
    // 如果是以 / 开头但不是 CLOUD_IMAGE_BASE_PATH (例如直接是 /products/product_01.png)
    pathSegment = pathSegment.substring(1); // 移除开头的 /
  }
  
  // 确保不会在 CLOUD_IMAGE_BASE_PATH 和 pathSegment 之间出现双斜杠 "//"
  if (CLOUD_IMAGE_BASE_PATH.endsWith('/') && pathSegment.startsWith('/')) {
    pathSegment = pathSegment.substring(1);
  } else if (!CLOUD_IMAGE_BASE_PATH.endsWith('/') && !pathSegment.startsWith('/') && pathSegment !== '') {
    // 如果 CLOUD_IMAGE_BASE_PATH 不以 / 结尾，且 pathSegment 不以 / 开头也不为空，则中间需要加 /
     return `${CLOUD_IMAGE_BASE_PATH}/${pathSegment}`;
  }
  
  return `${CLOUD_IMAGE_BASE_PATH}${pathSegment}`; // 拼接
}
// --- 图片路径格式化相关的常量和函数结束 ---


/**
 * 添加商品到购物车
 * @param {object} event - 前端传递的参数
 * @param {string} event.productId - 商品ID (必需)
 * @param {number} [event.quantity=1] - 购买数量 (可选, 默认为1)
 * @param {string} [event.specId] - 规格ID (可选)
 * @param {string} openid - 用户 OpenID (由主函数传入)
 */
async function addToCart(event, openid) {
  const { productId, quantity = 1, specId = '' } = event; 

  if (!productId) {
    return { code: 400, message: '缺少商品ID参数' };
  }
  if (typeof quantity !== 'number' || quantity <= 0) {
    return { code: 400, message: '购买数量必须为正整数' };
  }

  try {
    const productRes = await productsCollection.doc(productId).get();
    if (!productRes.data) {
      return { code: 404, message: '商品不存在或已下架' };
    }
    const productData = productRes.data;

    let currentPrice = productData.price;
    let currentStock = productData.stock;
    let currentSpecName = '';
    // --- 修改：优先使用 mainImage，然后是 images[0]，最后是 imageUrl ---
    let rawProductImage = productData.mainImage || 
                         (productData.images && productData.images.length > 0 ? productData.images[0] : 
                         (productData.imageUrl || '')); // 获取原始图片路径

    if (specId && productData.specs && productData.specs.length > 0) {
      const selectedSpec = productData.specs.find(s => s._id === specId || s.id === specId); 
      if (!selectedSpec) {
        return { code: 404, message: '所选商品规格不存在' };
      }
      currentPrice = selectedSpec.price;
      currentStock = selectedSpec.stock;
      currentSpecName = selectedSpec.name;
      if (selectedSpec.image) { // 如果规格有独立的图片
        rawProductImage = selectedSpec.image; // 更新为规格图片路径
      }
    }
    
    // --- 修改：格式化图片路径 ---
    const currentProductImage = formatImagePath(rawProductImage);

    if (currentStock < quantity) {
      return { code: 400, message: `商品 "${productData.name}" 库存不足 (仅剩${currentStock}件)` };
    }

    const existItemQuery = {
      _openid: openid,
      productId: productId,
      specId: specId 
    };
    const existItemRes = await cartCollection.where(existItemQuery).get();

    if (existItemRes.data && existItemRes.data.length > 0) {
      const cartItem = existItemRes.data[0];
      const newQuantity = cartItem.quantity + quantity;

      if (currentStock < newQuantity) {
        return {
          code: 400,
          message: `购物车中已有${cartItem.quantity}件，再加${quantity}件将超过库存 (仅剩${currentStock}件)`
        };
      }

      await cartCollection.doc(cartItem._id).update({
        data: {
          quantity: newQuantity,
          price: currentPrice, 
          productName: productData.name,
          productImage: currentProductImage, // --- 修改：使用格式化后的图片路径 ---
          specName: currentSpecName,
          updateTime: db.serverDate()
        }
      });
      console.log(`[云函数 cart.addToCart] 更新购物车商品 ${productId} (规格 ${specId}) 数量为 ${newQuantity}`);
      return {
        code: 0,
        message: '已更新购物车数量',
        data: { id: cartItem._id, quantity: newQuantity }
      };

    } else {
      const newItemData = {
        _openid: openid,
        productId: productId,
        productName: productData.name,
        productImage: currentProductImage, // --- 修改：使用格式化后的图片路径 ---
        price: currentPrice,
        quantity: quantity,
        specId: specId,
        specName: currentSpecName,
        selected: true, 
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      };
      const addResult = await cartCollection.add({ data: newItemData });
      console.log(`[云函数 cart.addToCart] 新增商品 ${productId} (规格 ${specId}) 到购物车, _id: ${addResult._id}`);
      return {
        code: 0,
        message: '已添加到购物车',
        data: { id: addResult._id }
      };
    }

  } catch (err) {
    console.error('[云函数 cart.addToCart] 操作失败:', err);
    if (err.message && err.message.includes('库存不足')) {
        return { code: 400, message: err.message };
    }
    return { code: 500, message: '添加到购物车失败，请稍后再试' };
  }
}

// 获取购物车列表
async function listCart(openid) {
  try {
    const result = await cartCollection.where({ _openid: openid }).orderBy('createTime', 'desc').get();
    
    // --- 新增：格式化购物车中每项商品的图片路径 ---
    const formattedCartItems = result.data.map(item => {
      // 确保即使原始 productImage 已经是 cloud:// 路径，formatImagePath 也能正确处理
      // 或者如果 productImage 存储的是相对路径，则进行转换
      return {
        ...item,
        productImage: formatImagePath(item.productImage) 
      };
    });
    // --- 格式化结束 ---

    return { code: 0, message: '获取购物车列表成功', data: formattedCartItems }; // --- 修改：返回格式化后的列表 ---
  } catch (err) {
    console.error('[云函数 cart.listCart] 获取列表失败:', err);
    return { code: 500, message: '获取购物车列表失败' };
  }
}

// 更新购物车商品 (保持原有逻辑，因为图片路径应该在添加时就已正确)
async function updateCart(event, openid) {
  const { cartItemId, quantity } = event; 
  if (!cartItemId || typeof quantity !== 'number' || quantity <= 0) {
    return { code: 400, message: '参数错误：缺少购物车项目ID或数量无效' };
  }
  try {
    // 考虑：如果商品信息（如价格、图片）可能在后台更新，这里也可以选择重新从 products 表获取并更新到购物车项
    // 但为了聚焦图片问题，暂时不修改这部分的价格等字段更新逻辑
    await cartCollection.doc(cartItemId).update({
      data: {
        quantity: quantity,
        updateTime: db.serverDate()
      }
    });
    console.log(`[云函数 cart.updateCart] 更新购物车项 ${cartItemId} 数量为 ${quantity}`);
    return { code: 0, message: '更新成功' };
  } catch (err) {
    console.error('[云函数 cart.updateCart] 更新失败:', err);
    return { code: 500, message: '更新购物车失败' };
  }
}

// 删除购物车商品 (保持原有逻辑)
async function deleteFromCart(event, openid) {
  const { cartItemId } = event; 
  if (!cartItemId) {
    return { code: 400, message: '缺少购物车项目ID参数' };
  }
  try {
    const itemToDelete = await cartCollection.doc(cartItemId).get();
    if (!itemToDelete.data || itemToDelete.data._openid !== openid) {
        return { code: 403, message: '无权删除或购物车项不存在' };
    }
    await cartCollection.doc(cartItemId).remove();
    console.log(`[云函数 cart.deleteFromCart] 删除购物车项 ${cartItemId}`);
    return { code: 0, message: '删除成功' };
  } catch (err) {
    console.error('[云函数 cart.deleteFromCart] 删除失败:', err);
    return { code: 500, message: '删除购物车商品失败' };
  }
}

// 获取购物车商品数量 (保持原有逻辑)
async function getCartCount(openid) {
  try {
    const result = await cartCollection.where({ _openid: openid }).count();
    console.log(`[云函数 cart.getCartCount] 用户 ${openid} 的购物车数量: ${result.total}`);
    return { code: 0, message: '获取购物车数量成功', data: { count: result.total } };
  } catch (err) {
    console.error('[云函数 cart.getCartCount] 获取数量失败:', err);
    return { code: 500, message: '获取购物车数量失败', data: { count: 0 } };
  }
}

// 批量删除购物车项 (保持原有逻辑)
async function removeMultipleCartItems(event, openid) {
    const { ids } = event; 
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return { code: 400, message: '缺少要删除的购物车项目ID列表' };
    }
    try {
        const result = await cartCollection.where({
            _openid: openid,
            _id: _.in(ids) 
        }).remove();

        console.log(`[云函数 cart.removeMultipleCartItems] 批量删除购物车项, openid: ${openid}, ids: ${ids.join(',')}, 影响行数: ${result.stats.removed}`);
        if (result.stats.removed > 0) {
            return { code: 0, message: '部分或全部选中商品已从购物车移除' };
        } else {
            return { code: 404, message: '未找到需要移除的商品，或无权限操作' };
        }
    } catch (err) {
        console.error('[云函数 cart.removeMultipleCartItems] 批量删除失败:', err);
        return { code: 500, message: '从购物车移除商品失败' };
    }
}


// 云函数入口函数
exports.main = async (event, context) => {
  const { action } = event; 
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; 

  if (!openid && action !== 'somePublicActionWithoutLogin') { 
    return { code: 401, message: '用户未登录或登录状态已过期' };
  }

  console.log(`[云函数 cart] 执行 action: ${action}, openid: ${openid ? '******' : '无'}`);

  switch (action) {
    case 'list':
      return await listCart(openid); 
    case 'add':
      return await addToCart(event, openid); 
    case 'update':
      return await updateCart(event, openid);
    case 'delete':
      return await deleteFromCart(event, openid);
    case 'count':
      return await getCartCount(openid); 
    case 'removeMultiple': 
      return await removeMultipleCartItems(event, openid);
    default:
      console.warn(`[云函数 cart] 未知的 action 类型: ${action}`);
      return { code: 400, message: '未知操作类型' };
  }
};
