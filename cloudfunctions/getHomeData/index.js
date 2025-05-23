// 云函数入口文件 cloudfunctions/getHomeData/index.js
const cloud = require('wx-server-sdk'); 

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const CLOUD_IMAGE_BASE_PATH = 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images';

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

exports.main = async (event, context) => {
  console.log('--- [getHomeData] 云函数开始执行 ---');
  console.log('[getHomeData] 收到前端参数 event: ', JSON.stringify(event));

  try {
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

    console.log('[getHomeData] 开始查询 categories...');
    const categoryRes = await db.collection('categories')
      .where({ status: 'active' })
      .orderBy('order', 'asc')
      .limit(5) 
      .get();
    console.log('[getHomeData] categories 查询结果: ', JSON.stringify(categoryRes.data));

    const categories = categoryRes.data.map(category => ({
      ...category,
      iconUrl: formatImagePath(category.iconUrl)
    }));

    console.log('[getHomeData] 开始查询 newProducts...');
    const newProductsRes = await db.collection('products')
      .where({
        isNew: true,
        status: 'active'
      })
      .orderBy('createTime', 'desc')
      .limit(4) 
      .get();
    console.log('[getHomeData] newProducts 查询结果: ', JSON.stringify(newProductsRes.data));

    const newProducts = newProductsRes.data.map(product => ({
      ...product,
      mainImage: formatImagePath(product.mainImage)
    }));

    const hotProductsPageSize = event.pageSize || 6; 
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

    console.log('[getHomeData] 开始查询 brandInfo...');
    const brandInfoRes = await db.collection('settings')
      .where({ key: 'brandInfo' })
      .limit(1)
      .get();
    console.log('[getHomeData] brandInfo 查询结果: ', JSON.stringify(brandInfoRes.data));

    let brandInfo = {
      title: '火山零食小卖部', // <--- 修改点
      description: '品质保证，爱宠首选（默认）',
      imageUrl: formatImagePath('logo/logo.png') 
    };
    if (brandInfoRes.data.length > 0 && brandInfoRes.data[0].value) {
      const dbBrandInfo = brandInfoRes.data[0].value;
      brandInfo = {
        title: dbBrandInfo.title || brandInfo.title, // 如果数据库有，则用数据库的，否则用默认的“火山零食小卖部”
        description: dbBrandInfo.description || brandInfo.description,
        imageUrl: formatImagePath(dbBrandInfo.logoUrl || dbBrandInfo.imageUrl || 'logo/logo.png')
      };
    }

    console.log('[getHomeData] 开始查询 coupon_templates...');
    const couponTemplatesRes = await db.collection('coupon_templates')
        .where({
            status: 'active',
        })
        .orderBy('createTime', 'desc') 
        .limit(3) 
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
    console.error('[getHomeData] 错误堆栈: ', error.stack); 
    return {
      code: 5001, 
      message: '服务器开小差了，首页数据加载失败，请稍后重试~',
      errorDetail: error.toString()
    };
  }
};
