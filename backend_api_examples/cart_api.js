// 后端API示例代码 - 购物车相关接口
// 文件路径: /cloudfunctions/cart/index.js (云函数示例)

// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event
  
  // 获取微信用户的openid
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || data.openid
  
  switch (action) {
    case 'add':
      return await addToCart(openid, data)
    case 'update':
      return await updateCart(openid, data)
    case 'delete':
      return await deleteFromCart(openid, data)
    case 'list':
      return await getCartList(openid)
    case 'count':
      return await getCartCount(openid)
    case 'clear':
      return await clearCart(openid, data)
    default:
      return {
        code: -1,
        message: '未知操作类型'
      }
  }
}

/**
 * 添加商品到购物车
 * @param {string} openid - 用户的openid
 * @param {Object} data - 请求数据
 * @returns {Object} 返回结果
 */
async function addToCart(openid, data) {
  try {
    const { productId, specId = '', quantity = 1 } = data
    
    // 查询商品信息
    const productResult = await db.collection('products').doc(productId).get()
    if (!productResult.data) {
      return {
        code: -1,
        message: '商品不存在'
      }
    }
    
    const product = productResult.data
    
    // 获取规格信息和价格
    let spec = null
    let price = product.price
    let stock = product.stock
    
    if (specId && product.specs && product.specs.length > 0) {
      spec = product.specs.find(item => item.id === specId)
      if (spec) {
        price = spec.price
        stock = spec.stock
      }
    }
    
    // 检查库存
    if (stock < quantity) {
      return {
        code: -1,
        message: '商品库存不足'
      }
    }
    
    // 查询购物车中是否已存在该商品
    const cartResult = await db.collection('carts').where({
      _openid: openid,
      productId,
      specId
    }).get()
    
    if (cartResult.data.length > 0) {
      // 已存在，更新数量
      const cartItem = cartResult.data[0]
      const newQuantity = cartItem.quantity + quantity
      
      // 再次检查库存
      if (stock < newQuantity) {
        return {
          code: -1,
          message: '商品库存不足'
        }
      }
      
      await db.collection('carts').doc(cartItem._id).update({
        data: {
          quantity: newQuantity,
          updateTime: db.serverDate()
        }
      })
    } else {
      // 不存在，添加新记录
      await db.collection('carts').add({
        data: {
          _openid: openid,
          productId,
          productName: product.name,
          productImage: product.images[0],
          price,
          specId: specId || '',
          specName: spec ? spec.name : '',
          quantity,
          stock,
          selected: true,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    }
    
    return {
      code: 0,
      message: '添加成功'
    }
  } catch (error) {
    console.error('添加到购物车失败', error)
    return {
      code: -1,
      message: '添加到购物车失败',
      error
    }
  }
}

/**
 * 更新购物车商品数量
 * @param {string} openid - 用户的openid
 * @param {Object} data - 请求数据
 * @returns {Object} 返回结果
 */
async function updateCart(openid, data) {
  try {
    const { id, quantity } = data
    
    // 查询购物车项
    const cartResult = await db.collection('carts').doc(id).get()
    if (!cartResult.data) {
      return {
        code: -1,
        message: '购物车项不存在'
      }
    }
    
    const cartItem = cartResult.data
    
    // 检查是否是当前用户的购物车项
    if (cartItem._openid !== openid) {
      return {
        code: -1,
        message: '无权操作'
      }
    }
    
    // 检查库存
    if (cartItem.stock < quantity) {
      return {
        code: -1,
        message: '商品库存不足'
      }
    }
    
    // 更新数量
    await db.collection('carts').doc(id).update({
      data: {
        quantity,
        updateTime: db.serverDate()
      }
    })
    
    return {
      code: 0,
      message: '更新成功'
    }
  } catch (error) {
    console.error('更新购物车失败', error)
    return {
      code: -1,
      message: '更新购物车失败',
      error
    }
  }
}

/**
 * 从购物车中删除商品
 * @param {string} openid - 用户的openid
 * @param {Object} data - 请求数据
 * @returns {Object} 返回结果
 */
async function deleteFromCart(openid, data) {
  try {
    const { id } = data
    
    // 查询购物车项
    const cartResult = await db.collection('carts').doc(id).get()
    if (!cartResult.data) {
      return {
        code: -1,
        message: '购物车项不存在'
      }
    }
    
    // 检查是否是当前用户的购物车项
    if (cartResult.data._openid !== openid) {
      return {
        code: -1,
        message: '无权操作'
      }
    }
    
    // 删除购物车项
    await db.collection('carts').doc(id).remove()
    
    return {
      code: 0,
      message: '删除成功'
    }
  } catch (error) {
    console.error('删除购物车项失败', error)
    return {
      code: -1,
      message: '删除购物车项失败',
      error
    }
  }
}

/**
 * 获取购物车列表
 * @param {string} openid - 用户的openid
 * @returns {Object} 返回结果
 */
async function getCartList(openid) {
  try {
    // 查询购物车列表
    const cartResult = await db.collection('carts')
      .where({
        _openid: openid
      })
      .orderBy('createTime', 'desc')
      .get()
    
    // 更新商品最新价格和库存信息
    const cartItems = cartResult.data
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i]
      
      // 查询商品最新信息
      const productResult = await db.collection('products').doc(item.productId).get()
      if (productResult.data) {
        const product = productResult.data
        
        // 更新商品基本信息
        item.productName = product.name
        item.productImage = product.images[0]
        
        // 更新规格信息
        if (item.specId && product.specs && product.specs.length > 0) {
          const spec = product.specs.find(s => s.id === item.specId)
          if (spec) {
            item.price = spec.price
            item.stock = spec.stock
            item.specName = spec.name
          } else {
            item.price = product.price
            item.stock = product.stock
            item.specId = ''
            item.specName = ''
          }
        } else {
          item.price = product.price
          item.stock = product.stock
        }
        
        // 如果库存不足，调整数量
        if (item.quantity > item.stock) {
          item.quantity = item.stock
          
          // 更新数据库中的数量
          await db.collection('carts').doc(item._id).update({
            data: {
              quantity: item.stock,
              updateTime: db.serverDate()
            }
          })
        }
      }
    }
    
    return {
      code: 0,
      message: '获取成功',
      data: cartItems
    }
  } catch (error) {
    console.error('获取购物车列表失败', error)
    return {
      code: -1,
      message: '获取购物车列表失败',
      error
    }
  }
}

/**
 * 获取购物车商品数量
 * @param {string} openid - 用户的openid
 * @returns {Object} 返回结果
 */
async function getCartCount(openid) {
  try {
    // 查询购物车商品总数
    const countResult = await db.collection('carts')
      .where({
        _openid: openid
      })
      .count()
    
    return {
      code: 0,
      message: '获取成功',
      data: {
        count: countResult.total
      }
    }
  } catch (error) {
    console.error('获取购物车数量失败', error)
    return {
      code: -1,
      message: '获取购物车数量失败',
      error
    }
  }
}

/**
 * 清空购物车（批量删除）
 * @param {string} openid - 用户的openid
 * @param {Object} data - 请求数据
 * @returns {Object} 返回结果
 */
async function clearCart(openid, data) {
  try {
    const { ids } = data
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return {
        code: -1,
        message: '参数错误'
      }
    }
    
    // 批量删除购物车项
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      
      // 查询购物车项
      const cartResult = await db.collection('carts').doc(id).get()
      if (cartResult.data && cartResult.data._openid === openid) {
        await db.collection('carts').doc(id).remove()
      }
    }
    
    return {
      code: 0,
      message: '清空成功'
    }
  } catch (error) {
    console.error('清空购物车失败', error)
    return {
      code: -1,
      message: '清空购物车失败',
      error
    }
  }
}
