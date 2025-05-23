// 后端API示例代码 - 商品相关接口
// 文件路径: /cloudfunctions/product/index.js (云函数示例)

// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event
  
  switch (action) {
    case 'getHomeData':
      return await getHomeData(data)
    case 'getProductList':
      return await getProductList(data)
    case 'getProductDetail':
      return await getProductDetail(data)
    case 'getRecommendProducts':
      return await getRecommendProducts(data)
    default:
      return {
        code: -1,
        message: '未知操作类型'
      }
  }
}

/**
 * 获取首页数据
 * @param {Object} data - 请求参数
 * @returns {Object} 返回结果
 */
async function getHomeData(data) {
  try {
    // 获取轮播图
    const bannerResult = await db.collection('banners')
      .where({
        status: 'active'
      })
      .orderBy('order', 'asc')
      .get()
    
    // 获取分类
    const categoryResult = await db.collection('categories')
      .where({
        status: 'active'
      })
      .orderBy('order', 'asc')
      .limit(5) // 首页只显示前5个分类
      .get()
    
    // 获取优惠券
    const couponResult = await db.collection('coupons')
      .where({
        status: 'active',
        endTime: _.gt(db.serverDate())
      })
      .orderBy('minAmount', 'asc')
      .limit(3) // 首页只显示3个优惠券
      .get()
    
    // 获取新品
    const newProductResult = await db.collection('products')
      .where({
        status: 'active',
        isNew: true
      })
      .orderBy('createTime', 'desc')
      .limit(4) // 首页只显示4个新品
      .get()
    
    // 获取热销商品
    const hotProductResult = await db.collection('products')
      .where({
        status: 'active',
        isHot: true
      })
      .orderBy('sales', 'desc')
      .limit(6) // 首页只显示6个热销商品
      .get()
    
    // 获取品牌信息
    const brandResult = await db.collection('settings')
      .where({
        key: 'brandInfo'
      })
      .get()
    
    return {
      code: 0,
      message: '获取成功',
      data: {
        banners: bannerResult.data,
        categories: categoryResult.data,
        coupons: couponResult.data,
        newProducts: newProductResult.data,
        hotProducts: hotProductResult.data,
        brandInfo: brandResult.data[0] ? brandResult.data[0].value : {}
      }
    }
  } catch (error) {
    console.error('获取首页数据失败', error)
    return {
      code: -1,
      message: '获取首页数据失败',
      error
    }
  }
}

/**
 * 获取商品列表
 * @param {Object} data - 请求参数
 * @returns {Object} 返回结果
 */
async function getProductList(data) {
  try {
    const { categoryId, keyword, isNew, isHot, sort, order, page = 1, pageSize = 10 } = data
    
    // 构建查询条件
    const condition = {
      status: 'active'
    }
    
    if (categoryId && categoryId !== 'all') {
      condition.categoryId = categoryId
    }
    
    if (keyword) {
      condition.name = db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    }
    
    if (isNew) {
      condition.isNew = true
    }
    
    if (isHot) {
      condition.isHot = true
    }
    
    // 构建排序条件
    let sortField = 'createTime'
    let sortOrder = 'desc'
    
    if (sort === 'price') {
      sortField = 'price'
      sortOrder = order === 'asc' ? 'asc' : 'desc'
    } else if (sort === 'sales') {
      sortField = 'sales'
      sortOrder = 'desc'
    }
    
    // 查询总数
    const countResult = await db.collection('products')
      .where(condition)
      .count()
    
    // 查询列表
    const listResult = await db.collection('products')
      .where(condition)
      .orderBy(sortField, sortOrder)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
    
    return {
      code: 0,
      message: '获取成功',
      data: {
        total: countResult.total,
        list: listResult.data
      }
    }
  } catch (error) {
    console.error('获取商品列表失败', error)
    return {
      code: -1,
      message: '获取商品列表失败',
      error
    }
  }
}

/**
 * 获取商品详情
 * @param {Object} data - 请求参数
 * @returns {Object} 返回结果
 */
async function getProductDetail(data) {
  try {
    const { id } = data
    
    // 查询商品详情
    const productResult = await db.collection('products')
      .doc(id)
      .get()
    
    if (!productResult.data) {
      return {
        code: -1,
        message: '商品不存在'
      }
    }
    
    // 增加浏览量
    await db.collection('products')
      .doc(id)
      .update({
        data: {
          viewCount: _.inc(1)
        }
      })
    
    return {
      code: 0,
      message: '获取成功',
      data: productResult.data
    }
  } catch (error) {
    console.error('获取商品详情失败', error)
    return {
      code: -1,
      message: '获取商品详情失败',
      error
    }
  }
}

/**
 * 获取推荐商品
 * @param {Object} data - 请求参数
 * @returns {Object} 返回结果
 */
async function getRecommendProducts(data) {
  try {
    const { limit = 10 } = data
    
    // 查询推荐商品
    const result = await db.collection('products')
      .where({
        status: 'active',
        isRecommend: true
      })
      .orderBy('sales', 'desc')
      .limit(limit)
      .get()
    
    return {
      code: 0,
      message: '获取成功',
      data: result.data
    }
  } catch (error) {
    console.error('获取推荐商品失败', error)
    return {
      code: -1,
      message: '获取推荐商品失败',
      error
    }
  }
}
