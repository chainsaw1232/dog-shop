// 后端API示例代码 - 用户相关接口
// 文件路径: /cloudfunctions/user/index.js (云函数示例)

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
  const openid = wxContext.OPENID
  
  switch (action) {
    case 'login':
      return await login(openid, data)
    case 'getUserInfo':
      return await getUserInfo(openid)
    case 'updateUserInfo':
      return await updateUserInfo(openid, data)
    default:
      return {
        code: -1,
        message: '未知操作类型'
      }
  }
}

/**
 * 用户登录
 * @param {string} openid - 用户的openid
 * @param {Object} data - 请求数据
 * @returns {Object} 返回结果
 */
async function login(openid, data) {
  try {
    // 查询用户是否已存在
    const userResult = await db.collection('users').where({
      _openid: openid
    }).get()
    
    if (userResult.data.length === 0) {
      // 用户不存在，创建新用户
      await db.collection('users').add({
        data: {
          _openid: openid,
          nickName: '',
          avatarUrl: '',
          gender: 0,
          country: '',
          province: '',
          city: '',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    }
    
    return {
      code: 0,
      message: '登录成功',
      data: {
        openid
      }
    }
  } catch (error) {
    console.error('登录失败', error)
    return {
      code: -1,
      message: '登录失败',
      error
    }
  }
}

/**
 * 获取用户信息
 * @param {string} openid - 用户的openid
 * @returns {Object} 返回结果
 */
async function getUserInfo(openid) {
  try {
    const userResult = await db.collection('users').where({
      _openid: openid
    }).get()
    
    if (userResult.data.length === 0) {
      return {
        code: -1,
        message: '用户不存在'
      }
    }
    
    return {
      code: 0,
      message: '获取成功',
      data: userResult.data[0]
    }
  } catch (error) {
    console.error('获取用户信息失败', error)
    return {
      code: -1,
      message: '获取用户信息失败',
      error
    }
  }
}

/**
 * 更新用户信息
 * @param {string} openid - 用户的openid
 * @param {Object} data - 用户信息
 * @returns {Object} 返回结果
 */
async function updateUserInfo(openid, data) {
  try {
    // 过滤掉不允许更新的字段
    const { nickName, avatarUrl, gender, country, province, city } = data
    
    await db.collection('users').where({
      _openid: openid
    }).update({
      data: {
        nickName,
        avatarUrl,
        gender,
        country,
        province,
        city,
        updateTime: db.serverDate()
      }
    })
    
    return {
      code: 0,
      message: '更新成功'
    }
  } catch (error) {
    console.error('更新用户信息失败', error)
    return {
      code: -1,
      message: '更新用户信息失败',
      error
    }
  }
}
