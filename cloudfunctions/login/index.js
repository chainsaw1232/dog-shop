// 云函数入口文件 cloudfunctions/login/index.js
const cloud = require('wx-server-sdk');

// 初始化云环境，建议使用 DYNAMIC_CURRENT_ENV 以便环境共享
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 用户登录云函数
 * 目的：获取用户的 OpenID、UnionID（如果绑定了开放平台且同主体）等微信身份信息。
 * 前端 app.js 中的 cloudLogin 方法会调用此云函数。
 *
 * @param {object} event - 前端调用时传递的参数 (此函数通常不需要前端传递额外参数)
 * @param {object} context - 云函数上下文，包含调用信息如 appid, openid, unionid
 *
 * @returns {object} 返回结果对象
 * @returns {number} result.code - 状态码，0 表示成功，其他表示失败
 * @returns {string} result.message - 状态描述
 * @returns {object} [result.data] - 成功时返回的数据
 * @returns {string} result.data.openid - 用户的 OpenID
 * @returns {string} [result.data.appid] - 小程序 AppID
 * @returns {string} [result.data.unionid] - 用户的 UnionID（如果小程序绑定到微信开放平台账号，且用户在同一开放平台账号下的其他应用中授权过）
 * @returns {object} [result.error] - 失败时的错误详情 (可选)
 */
exports.main = async (event, context) => {
  console.log('[云函数 login] Event: ', event); // 记录前端传来的事件对象，方便调试
  // console.log('[云函数 login] Context: ', context); // 记录云函数上下文，可以看到 appid, openid, unionid

  try {
    // 1. 从云函数调用上下文直接获取微信用户的身份信息
    const wxContext = cloud.getWXContext();

    // 2. 校验是否成功获取到 OPENID
    if (!wxContext.OPENID) {
      console.error('[云函数 login] 获取 OPENID 失败。wxContext:', wxContext);
      return {
        code: 5001, // 自定义错误码，表示获取 OpenID 失败
        message: '获取用户身份信息失败 (OpenID is null)',
        data: null // 明确表示没有数据返回
      };
    }

    // 3. 成功获取，构造返回数据
    // 注意：前端 app.js 中的 cloudLogin 方法期望 res.result.openid 能直接取到 openid
    // 所以我们把 openid 等信息放在 data 对象里，符合之前其他云函数的返回结构
    // 同时，为了兼容 app.js 直接从 result 取 openid 的写法，也可以在顶层也放一份（但不推荐，最好统一结构）
    const responseData = {
      openid: wxContext.OPENID,
      appid: wxContext.APPID, // 小程序的 AppID
      unionid: wxContext.UNIONID || null, // UnionID，可能不存在，不存在时设为 null
    };

    console.log('[云函数 login] 成功获取身份信息:', responseData);
    return {
      code: 0, // 0 代表成功
      message: '登录凭证获取成功',
      data: responseData
      // 如果你的 app.js 期望 res.result.openid 这样取值，那么可以这样返回：
      // openid: wxContext.OPENID,
      // appid: wxContext.APPID,
      // unionid: wxContext.UNIONID || null,
      // _originalResult: responseData // 保留一个原始的 data 结构
    };

  } catch (error) {
    // 4. 捕获其他未知错误
    console.error('[云函数 login] 执行过程中发生未知错误:', error);
    return {
      code: 5000, // 自定义错误码，表示云函数内部未知错误
      message: '登录过程中发生未知错误，请稍后再试',
      error: { // 可以选择性地返回错误信息给前端，但要注意不要泄露敏感信息
        name: error.name,
        message: error.message,
        // stack: error.stack // 生产环境不建议返回堆栈信息
      },
      data: null
    };
  }
};
