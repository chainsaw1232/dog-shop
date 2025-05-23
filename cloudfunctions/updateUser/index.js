// 云函数入口文件 cloudfunctions/updateUser/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const usersCollection = db.collection('users'); //  确保数据库中存在名为 'users' 的集合
const _ = db.command;

/**
 * 更新或创建用户信息
 * 当用户在小程序端授权获取头像昵称等信息后，调用此云函数进行数据持久化。
 *
 * @param {object} event - 前端调用时传递的参数
 * @param {string} [event.nickName] - 用户昵称 (可选，但通常会提供)
 * @param {string} [event.avatarUrl] - 用户头像链接 (可选，但通常会提供)
 * @param {number} [event.gender] - 用户性别 (0:未知, 1:男, 2:女) (可选)
 * 小程序 wx.getUserProfile 返回的 gender 可能为 0, 1, 2
 * @param {string} [event.country] - 国家 (可选)
 * @param {string} [event.province] - 省份 (可选)
 * @param {string} [event.city] - 城市 (可选)
 * @param {object} context - 云函数上下文，自动包含 openid, appid 等
 *
 * @returns {object} 返回结果对象
 * @returns {number} result.code - 状态码，0 表示成功，其他表示失败
 * @returns {string} result.message - 状态描述
 * @returns {object} [result.data] - 成功时可能返回的数据 (例如更新后的用户信息或新创建的用户ID)
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 1. 校验 OpenID 是否存在
  if (!openid) {
    console.error('[云函数 updateUser] 获取 OpenID 失败。wxContext:', wxContext);
    return {
      code: 401, // 401 通常表示未授权或身份验证失败
      message: '获取用户身份信息失败，无法更新用户信息'
    };
  }

  // 2. 从 event 中解构需要更新的用户信息
  //    只提取我们关心和允许更新的字段，避免前端传递过多无关或恶意数据
  const {
    nickName,
    avatarUrl,
    gender, // wx.getUserProfile 返回的 gender: 0（未知）、1（男）、2（女）
    country,
    province,
    city
    // 可以根据需要添加其他字段，如 language 等
  } = event;

  // 3. 准备要更新或插入的数据对象
  const userDataToProcess = {};
  if (typeof nickName === 'string') { // 确保是字符串类型
    userDataToProcess.nickName = nickName;
  }
  if (typeof avatarUrl === 'string') { // 确保是字符串类型
    userDataToProcess.avatarUrl = avatarUrl;
  }
  if (typeof gender === 'number' && [0, 1, 2].includes(gender)) { // 校验 gender 是否为有效值
    userDataToProcess.gender = gender;
  } else if (typeof gender !== 'undefined') { // 如果传了 gender 但值无效，可以记录一下或设为默认
    console.warn(`[云函数 updateUser] 无效的 gender 值: ${gender}，将忽略或设为默认`);
    // userDataToProcess.gender = 0; // 或者不设置，让数据库保持原样或默认值
  }
  // 其他字段类似处理
  if (typeof country === 'string') userDataToProcess.country = country;
  if (typeof province === 'string') userDataToProcess.province = province;
  if (typeof city === 'string') userDataToProcess.city = city;


  // 4. 如果没有任何有效信息需要更新/创建（除了openid），可以提前返回
  //    但通常前端既然调用了，至少会有昵称头像
  if (Object.keys(userDataToProcess).length === 0 && !(await usersCollection.where({ _openid: openid }).count()).total) {
      // 如果没有可更新字段，并且数据库中也没有该用户记录（即不是首次创建），则可能无需操作
      console.log('[云函数 updateUser] 没有有效的用户信息需要更新，且用户可能已存在或无需创建。OpenID:', openid);
      // return { code: 201, message: '没有有效的用户信息字段提供，操作未执行' }; // 201 No Content 或其他合适的状态码
  }


  try {
    // 5. 查询用户是否已存在于数据库
    const userQueryResult = await usersCollection.where({
      _openid: openid // 使用 _openid 进行查询，因为小程序用户表的 openid 字段通常是 _openid
    }).limit(1).get(); // limit(1) 提高查询效率，因为 openid 应该是唯一的

    const now = db.serverDate(); // 获取服务端当前时间

    if (userQueryResult.data && userQueryResult.data.length > 0) {
      // 用户已存在，执行更新操作
      const userId = userQueryResult.data[0]._id;
      // 只更新传入的、且有值的字段，并更新 updateTime
      const updateData = { ...userDataToProcess, updateTime: now };
      if (Object.keys(userDataToProcess).length > 0) { // 确保有数据要更新
        await usersCollection.doc(userId).update({
          data: updateData
        });
        console.log(`[云函数 updateUser] 用户信息更新成功。OpenID: ${openid}, UserID: ${userId}`);
        return {
          code: 0,
          message: '用户信息更新成功',
          data: { userId: userId, updatedFields: Object.keys(userDataToProcess) }
        };
      } else {
        console.log(`[云函数 updateUser] 用户已存在，但没有提供新的信息字段用于更新。OpenID: ${openid}`);
        return {
          code: 0, // 也可以认为是成功的，只是没有实际更新
          message: '用户信息已是最新，无需更新',
          data: { userId: userId }
        };
      }
    } else {
      // 用户不存在，执行创建新用户操作
      // 合并基础信息和创建时间
      const newUserRecord = {
        _openid: openid, // 存储 openid
        ...userDataToProcess, // 包含昵称、头像、性别等
        createTime: now,
        updateTime: now,
        // 可以添加一些其他默认字段，比如注册来源、初始积分等
        // registrationSource: 'miniprogram',
        // points: 0,
      };
      const addUserResult = await usersCollection.add({
        data: newUserRecord
      });
      console.log(`[云函数 updateUser] 新用户创建成功。OpenID: ${openid}, New UserID: ${addUserResult._id}`);
      return {
        code: 0,
        message: '用户信息创建成功',
        data: { userId: addUserResult._id }
      };
    }
  } catch (err) {
    console.error(`[云函数 updateUser] 更新或创建用户信息失败。OpenID: ${openid}, Error:`, err);
    return {
      code: 500, // 服务端错误
      message: '处理用户信息失败，请稍后再试',
      error: { name: err.name, message: err.message }
    };
  }
};
