// 云函数入口文件 cloudfunctions/cart/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cartCollection = db.collection('cart');
const productsCollection = db.collection('products'); 
const _ = db.command;

// --- 图片路径格式化相关的常量和函数 ---
const CLOUD_IMAGE_BASE_PATH = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images'; 
const PLACEHOLDER_IMAGE = CLOUD_IMAGE_BASE_PATH + '/placeholder.png';

function formatImagePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    console.warn('[formatImagePath] 路径无效或非字符串:', relativePath, '将使用占位图。');
    return PLACEHOLDER_IMAGE; 
  }
  if (relativePath.startsWith('cloud://')) {
    return relativePath;
  }
  let pathSegment = relativePath;
  if (CLOUD_IMAGE_BASE_PATH.endsWith('/') && pathSegment.startsWith('/')) {
    pathSegment = pathSegment.substring(1);
  } else if (!CLOUD_IMAGE_BASE_PATH.endsWith('/') && !pathSegment.startsWith('/') && pathSegment !== '') {
     return `${CLOUD_IMAGE_BASE_PATH}/${pathSegment}`;
  }
  return `${CLOUD_IMAGE_BASE_PATH}${pathSegment}`;
}
// --- 图片路径格式化结束 ---

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
    if (!productRes.data || productRes.data.status !== 'active') { // 检查商品是否存在且上架
      return { code: 404, message: '商品不存在或已下架' };
    }
    const productData = productRes.data;

    let currentPrice = productData.price;
    let currentStock = productData.stock;
    let currentSpecName = '';
    let rawProductImage = productData.mainImage || 
                         (productData.images && productData.images.length > 0 ? productData.images[0] : 
                         (productData.imageUrl || '')); 
    let currentSpecId = specId; // 保存原始specId

    if (specId && productData.specs && productData.specs.length > 0) {
      const selectedSpec = productData.specs.find(s => s._id === specId || s.id === specId); 
      if (!selectedSpec) {
        return { code: 404, message: '所选商品规格不存在' };
      }
      currentPrice = selectedSpec.price;
      currentStock = selectedSpec.stock;
      currentSpecName = selectedSpec.name;
      if (selectedSpec.image) { 
        rawProductImage = selectedSpec.image;
      }
    } else if (productData.specs && productData.specs.length > 0 && !specId) {
        // 如果商品有规格但用户未选择（理论上前端应引导选择）
        // return { code: 400, message: '请选择商品规格' }; // 或者根据业务逻辑处理
    }
    
    const currentProductImage = formatImagePath(rawProductImage);

    if (currentStock < quantity) {
      return { code: 400, message: `商品 "${productData.name}${currentSpecName ? ' ' + currentSpecName : ''}" 库存不足 (仅剩${currentStock}件)` };
    }

    const existItemQuery = {
      _openid: openid,
      productId: productId,
      specId: currentSpecId // 使用保存的 specId 查询
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
          productImage: currentProductImage,
          specName: currentSpecName,
          // specId 保持不变，因为是基于它查询的
          stock: currentStock, // 更新快照库存
          updateTime: db.serverDate()
        }
      });
      console.log(`[云函数 cart.addToCart] 更新购物车商品 ${productId} (规格 ${currentSpecId}) 数量为 ${newQuantity}`);
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
        productImage: currentProductImage,
        price: currentPrice,
        quantity: quantity,
        specId: currentSpecId, // 使用保存的 specId
        specName: currentSpecName,
        stock: currentStock, // 保存当前规格/商品库存快照
        selected: true, 
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      };
      const addResult = await cartCollection.add({ data: newItemData });
      console.log(`[云函数 cart.addToCart] 新增商品 ${productId} (规格 ${currentSpecId}) 到购物车, _id: ${addResult._id}`);
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

// 获取购物车列表 - 已优化
async function listCart(openid) {
  try {
    const cartResult = await cartCollection.where({ _openid: openid }).orderBy('createTime', 'desc').get();
    const cartItems = cartResult.data;

    if (cartItems.length === 0) {
      return { code: 0, message: '购物车为空', data: [] };
    }

    // 提取所有 productId，去重
    const productIds = [...new Set(cartItems.map(item => item.productId))];
    
    // 一次性查询所有相关商品信息
    const productsRes = await productsCollection.where({
      _id: _.in(productIds)
    }).field({ // 只查询需要的字段
      name: true,
      mainImage: true,
      images: true,
      price: true,
      stock: true,
      status: true,
      specs: true
    }).get();
    
    const productsMap = new Map();
    productsRes.data.forEach(p => productsMap.set(p._id, p));

    const updatedCartItems = [];
    let needsCartDBUpdate = false; // 标记是否有购物车项需要更新数量

    for (const item of cartItems) {
      const productInfo = productsMap.get(item.productId);
      let currentItem = { ...item }; // 复制一份，避免直接修改原始数据影响循环

      if (productInfo && productInfo.status === 'active') {
        currentItem.productName = productInfo.name; // 更新名称
        let effectivePrice = productInfo.price;
        let effectiveStock = productInfo.stock;
        let effectiveImage = productInfo.mainImage || (productInfo.images && productInfo.images.length > 0 ? productInfo.images[0] : '');

        if (item.specId && productInfo.specs && productInfo.specs.length > 0) {
          const selectedSpec = productInfo.specs.find(s => s._id === item.specId || s.id === item.specId);
          if (selectedSpec) {
            effectivePrice = selectedSpec.price;
            effectiveStock = selectedSpec.stock;
            currentItem.specName = selectedSpec.name; // 更新规格名
            if (selectedSpec.image) {
              effectiveImage = selectedSpec.image;
            }
          } else {
            // 规格找不到了，标记为失效或按默认商品处理
            console.warn(`Cart item ${item._id} spec ${item.specId} not found for product ${item.productId}.`);
            currentItem.isInvalid = true; // 添加一个失效标记
            currentItem.invalidReason = '规格已失效';
            // 或者将价格和库存设置为0
            effectivePrice = 0; // 或者item.price (保持旧价格)
            effectiveStock = 0;
          }
        }
        
        currentItem.price = parseFloat(effectivePrice.toFixed(2)); // 更新价格
        currentItem.productImage = formatImagePath(effectiveImage); // 更新图片并格式化
        currentItem.stock = effectiveStock; // 更新库存快照

        // 检查购物车数量是否超过当前库存
        if (currentItem.quantity > effectiveStock) {
          console.warn(`Cart item ${item._id} quantity ${item.quantity} exceeds stock ${effectiveStock}. Adjusting.`);
          currentItem.quantity = effectiveStock > 0 ? effectiveStock : 0; // 调整数量
          currentItem.selected = effectiveStock > 0 ? currentItem.selected : false; // 如果没库存了，取消选中
          if (effectiveStock <= 0) {
            currentItem.isInvalid = true;
            currentItem.invalidReason = currentItem.invalidReason || '库存不足';
          }
          // 标记此购物车项需要在数据库中更新
          // 实际项目中，可以在这里直接调用更新数据库的函数，或者收集起来批量更新
          // 为了简化，这里仅在前端调整，提示用户。更完善的做法是同步回数据库。
          // await cartCollection.doc(item._id).update({ data: { quantity: currentItem.quantity, selected: currentItem.selected, updateTime: db.serverDate() } });
          // needsCartDBUpdate = true; // 如果选择异步批量更新，则使用此标记
        }
        
      } else {
        // 商品找不到了或已下架
        console.warn(`Product ${item.productId} for cart item ${item._id} not found or not active.`);
        currentItem.isInvalid = true; // 添加一个失效标记
        currentItem.invalidReason = '商品已下架或不存在';
        currentItem.stock = 0; // 库存视为0
        currentItem.price = 0; // 价格视为0 (或保持旧价格)
        currentItem.selected = false; // 自动取消选中
      }
      updatedCartItems.push(currentItem);
    }

    // 如果需要更新数据库中的购物车项 (例如数量因库存不足调整)
    // if (needsCartDBUpdate) { /* ... 批量更新逻辑 ... */ }

    return { code: 0, message: '获取购物车列表成功', data: updatedCartItems };
  } catch (err) {
    console.error('[云函数 cart.listCart] 获取列表失败:', err);
    return { code: 500, message: '获取购物车列表失败' };
  }
}

async function updateCart(event, openid) {
  const { cartItemId, quantity } = event; 
  if (!cartItemId || typeof quantity !== 'number' || quantity < 0) { // 允许数量为0（即删除）
    return { code: 400, message: '参数错误：缺少购物车项目ID或数量无效' };
  }

  try {
    const cartItemRes = await cartCollection.doc(cartItemId).get();
    if (!cartItemRes.data || cartItemRes.data._openid !== openid) {
      return { code: 403, message: '无权操作或购物车项不存在' };
    }
    const cartItem = cartItemRes.data;

    // 查询最新商品/规格信息以校验库存
    const productRes = await productsCollection.doc(cartItem.productId).get();
    if (!productRes.data || productRes.data.status !== 'active') {
      // 商品已下架，则直接从购物车删除此项
      await cartCollection.doc(cartItemId).remove();
      return { code: 404, message: `商品"${cartItem.productName}"已下架，已从购物车移除`, reloaded: true }; // 提示前端刷新
    }
    const productData = productRes.data;
    let currentStock = productData.stock;
    if (cartItem.specId && productData.specs && productData.specs.length > 0) {
      const selectedSpec = productData.specs.find(s => s._id === cartItem.specId || s.id === cartItem.specId);
      if (selectedSpec) {
        currentStock = selectedSpec.stock;
      } else {
        // 规格失效，也从购物车删除
        await cartCollection.doc(cartItemId).remove();
        return { code: 404, message: `商品"${cartItem.productName}"规格已失效，已从购物车移除`, reloaded: true };
      }
    }

    if (quantity > currentStock) {
      return { code: 400, message: `库存不足，仅剩${currentStock}件`, currentStock: currentStock };
    }

    if (quantity === 0) { // 如果数量更新为0，则删除该购物车项
        await cartCollection.doc(cartItemId).remove();
        console.log(`[云函数 cart.updateCart] 购物车项 ${cartItemId} 因数量为0被删除`);
        return { code: 0, message: '商品已从购物车移除' };
    }

    await cartCollection.doc(cartItemId).update({
      data: {
        quantity: quantity,
        stock: currentStock, // 更新库存快照
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

async function getCartCount(openid) {
  try {
    // 只统计有效商品（未标记为isInvalid的）
    // 如果购物车项没有isInvalid字段，则默认有效
    const result = await cartCollection.where({ 
        _openid: openid,
        isInvalid: _.neq(true) // 排除isInvalid为true的项
    }).count();
    console.log(`[云函数 cart.getCartCount] 用户 ${openid} 的有效购物车数量: ${result.total}`);
    return { code: 0, message: '获取购物车数量成功', data: { count: result.total } };
  } catch (err) {
    console.error('[云函数 cart.getCartCount] 获取数量失败:', err);
    return { code: 500, message: '获取购物车数量失败', data: { count: 0 } };
  }
}

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
            // 即使没有找到匹配的（可能已经被其他操作删除了），也返回成功，避免前端困惑
            return { code: 0, message: '操作完成，未找到符合条件的商品或已移除' };
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