    // cloudfunctions/login/index.js
    const cloud = require('wx-server-sdk');

    // 初始化云环境，建议使用 DYNAMIC_CURRENT_ENV 以便环境共享
    cloud.init({
      env: cloud.DYNAMIC_CURRENT_ENV
    });

    /**
     * 用户登录云函数 (云函数环境内获取用户身份)
     * 当前主要用于小程序端通过 app.js 调用以获取和确认用户的 OpenID。
     * @param {object} event - 前端调用时传递的参数 (此函数通常不需要前端传递额外参数)
     * @param {object} context - 云函数上下文，包含调用信息如 appid, openid, unionid
     */
    exports.main = async (event, context) => {
      console.log('[云函数 login] Event: ', event);

      try {
        // 1. 从云函数调用上下文直接获取微信用户的身份信息
        const wxContext = cloud.getWXContext();

        // 2. 校验是否成功获取到 OPENID
        if (!wxContext.OPENID) {
          console.error('[云函数 login] 获取 OPENID 失败。wxContext:', wxContext);
          return {
            code: 5001, // 自定义错误码，表示获取 OpenID 失败
            message: '获取用户身份信息失败 (OpenID is null)',
            data: null
          };
        }

        const responseData = {
          openid: wxContext.OPENID,
          appid: wxContext.APPID, // 小程序的 AppID
          unionid: wxContext.UNIONID || null, // UnionID，可能不存在，不存在时设为 null
        };

        console.log('[云函数 login] 成功获取身份信息:', responseData);
        return {
          code: 0,
          message: '登录凭证获取成功 (来自云函数)', // 稍作修改以区分来源
          data: responseData
        };

      } catch (error) {
        console.error('[云函数 login] 执行过程中发生未知错误:', error);
        return {
          code: 5000,
          message: '登录过程中发生未知错误，请稍后再试',
          error: {
            name: error.name,
            message: error.message,
          },
          data: null
        };
      }
    };
    