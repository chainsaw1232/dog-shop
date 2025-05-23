// 云函数入口文件 cloudfunctions/getHomeData/index.js
const cloud = require('wx-server-sdk'); // <--- 确保是这样直接引入

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 你的云存储基础路径
const CLOUD_IMAGE_BASE_PATH = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images';

/**
 * 辅助函数：格式化图片路径为完整的 File ID
 * @param {string} relativePath - 数据库中存储的图片路径
 * @returns {string} - 完整的云存储 File ID
 */
function formatImagePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    console.warn('[formatImagePath] 路径无效或非字符串:', relativePath);
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

// 云函数主函数
exports.main = async (event, context) => {
  console.log('--- [getHomeData] 云函数开始执行 ---');
  console.log('[getHomeData] 收到前端参数 event: ', JSON.stringify(event));

  try {
    // 1. 获取轮播图 (banners 集合)
    console.log('[getHomeData] 开始查询 banners...');
    const bannerRes = await db.collection('banners')
      .where({ status: 'active' })
      .orderBy('order', 'asc')
      .limit(5)
      .get();
    console.log('[getHomeData] banners 查询结果: ', JSON.stringify(bannerRes.data));

    const banners = bannerRes.data.map(banner => ({
      ...banner,
      imageUrl: formatImagePath(banner.imageUrl)
    }));

    // 2. 获取商品分类 (categories 集合)
    console.log('[getHomeData] 开始查询 categories...');
    const categoryRes = await db.collection('categories')
      .where({ status: 'active' })
      .orderBy('order', 'asc')
      .limit(5) // 首页通常不需要所有分类，可以限制数量
      .get();
    console.log('[getHomeData] categories 查询结果: ', JSON.stringify(categoryRes.data));

    const categories = categoryRes.data.map(category => ({
      ...category,
      iconUrl: formatImagePath(category.iconUrl)
    }));

    // 3. 获取新品推荐 (products 集合)
    console.log('[getHomeData] 开始查询 newProducts...');
    const newProductsRes = await db.collection('products')
      .where({
        isNew: true,
        status: 'active'
      })
      .orderBy('createTime', 'desc')
      .limit(4) // 首页新品数量
      .get();
    console.log('[getHomeData] newProducts 查询结果: ', JSON.stringify(newProductsRes.data));

    const newProducts = newProductsRes.data.map(product => ({
      ...product,
      mainImage: formatImagePath(product.mainImage)
    }));

    // 4. 获取热销商品 (products 集合 - 首页通常加载第一页)
    const hotProductsPageSize = event.pageSize || 6; // 允许前端传入pageSize
    console.log(`[getHomeData] 开始查询 hotProducts (pageSize: ${hotProductsPageSize})...`);
    const hotProductsRes = await db.collection('products')
      .where({
        isHot: true,
        status: 'active'
      })
      .orderBy('sales', 'desc')
      .limit(hotProductsPageSize)
      .get();
    console.log('[getHomeData] hotProducts 查询结果: ', JSON.stringify(hotProductsRes.data));

    const hotProducts = hotProductsRes.data.map(product => ({
      ...product,
      mainImage: formatImagePath(product.mainImage)
    }));

    // 5. 获取品牌信息 (settings 集合)
    console.log('[getHomeData] 开始查询 brandInfo...');
    const brandInfoRes = await db.collection('settings')
      .where({ key: 'brandInfo' })
      .limit(1)
      .get();
    console.log('[getHomeData] brandInfo 查询结果: ', JSON.stringify(brandInfoRes.data));

    let brandInfo = {
      title: '汪汪零食铺（默认）',
      description: '品质保证，爱宠首选（默认）',
      imageUrl: formatImagePath('logo/logo.png') // 默认logo路径
    };
    if (brandInfoRes.data.length > 0 && brandInfoRes.data[0].value) {
      const dbBrandInfo = brandInfoRes.data[0].value;
      brandInfo = {
        title: dbBrandInfo.title || brandInfo.title,
        description: dbBrandInfo.description || brandInfo.description,
        imageUrl: formatImagePath(dbBrandInfo.logoUrl || dbBrandInfo.imageUrl || 'logo/logo.png')
      };
    }

    // 6. 获取可领取的优惠券模板 (coupon_templates 集合)
    console.log('[getHomeData] 开始查询 coupon_templates...');
    const couponTemplatesRes = await db.collection('coupon_templates')
        .where({
            status: 'active',
            // 可以加上更多筛选条件，如有效期内、余量大于0等
            // endTime: _.gt(new Date()),
            // totalQuantity: _.gt(db.command.F('issuedQuantity')) // 注意: F() 在云函数中不可用，需查询后在代码中比较或使用聚合
        })
        .orderBy('createTime', 'desc') // 或按某种优先级排序
        .limit(3) // 首页优惠券数量
        .get();
    console.log('[getHomeData] coupon_templates 查询结果: ', JSON.stringify(couponTemplatesRes.data));
    const coupons = couponTemplatesRes.data;

    const resultData = {
      banners,
      categories,
      newProducts,
      hotProducts,
      brandInfo,
      coupons
    };
    console.log('[getHomeData] 最终返回数据: ', JSON.stringify(resultData));
    console.log('--- [getHomeData] 云函数执行成功结束 ---');

    return {
      code: 0,
      message: '获取首页数据成功',
      data: resultData
    };

  } catch (error) {
    console.error('--- [getHomeData] 云函数执行出错 ---');
    console.error('[getHomeData] 错误详情: ', error);
    console.error('[getHomeData] 错误堆栈: ', error.stack); // 打印堆栈信息
    return {
      code: 5001, // 自定义错误码
      message: '服务器开小差了，首页数据加载失败，请稍后重试~',
      errorDetail: error.toString()
    };
  }
};
