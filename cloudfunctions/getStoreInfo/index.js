// 云函数入口文件 cloudfunctions/getStoreInfo/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const settingsCollection = db.collection('settings');

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
 * 获取店铺/品牌信息
 * @param {object} event - 可选参数，例如 { key: 'brandInfo' }
 * @param {object} context
 */
exports.main = async (event, context) => {
  const keyToFetch = event.key || 'brandInfo'; // 默认获取 brandInfo
  console.log(`[云函数 getStoreInfo] event:`, event, `keyToFetch: ${keyToFetch}`);

  try {
    const settingRes = await settingsCollection.where({
      key: keyToFetch
    }).limit(1).get();

    if (settingRes.data && settingRes.data.length > 0) {
      let storeInfo = settingRes.data[0].value; // value 字段存储具体信息对象

      // 如果是 brandInfo，并且包含图片路径，则格式化
      if (keyToFetch === 'brandInfo' && storeInfo) {
        if (storeInfo.logoUrl) {
          storeInfo.logoUrl = formatImagePath(storeInfo.logoUrl);
        } else if (storeInfo.imageUrl) { // 兼容 imageUrl 字段
          storeInfo.imageUrl = formatImagePath(storeInfo.imageUrl);
        }
      }

      return {
        code: 0,
        message: `获取设置项 [${keyToFetch}] 成功`,
        data: storeInfo
      };
    } else {
      return {
        code: 404,
        message: `未找到设置项 [${keyToFetch}]`,
        data: null
      };
    }
  } catch (error) {
    console.error(`[云函数 getStoreInfo] 获取设置项 [${keyToFetch}] 失败:`, error);
    return {
      code: 500,
      message: `获取设置项 [${keyToFetch}] 失败`,
      error: error.message || error.errMsg || error
    };
  }
};
