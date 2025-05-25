    // cloudfunctions/updateUser/index.js
    const cloud = require('wx-server-sdk');

    cloud.init({
      env: cloud.DYNAMIC_CURRENT_ENV
    });

    const db = cloud.database();
    const usersCollection = db.collection('users'); //  确保数据库中存在名为 'users' 的集合
    // const _ = db.command; // 如果需要用到 command，请取消注释

    /**
     * 更新或创建用户信息
     * 当用户在小程序端授权获取头像昵称等信息后，调用此云函数进行数据持久化。
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
      const {
        nickName,
        avatarUrl,
        gender,
        country,
        province,
        city
      } = event;

      // 3. 准备要更新或插入的数据对象
      const userDataToProcess = {};
      if (typeof nickName === 'string') userDataToProcess.nickName = nickName;
      if (typeof avatarUrl === 'string') userDataToProcess.avatarUrl = avatarUrl;
      if (typeof gender === 'number' && [0, 1, 2].includes(gender)) {
        userDataToProcess.gender = gender;
      } else if (typeof gender !== 'undefined') {
        console.warn(`[云函数 updateUser] 无效的 gender 值: ${gender}，将忽略`);
      }
      if (typeof country === 'string') userDataToProcess.country = country;
      if (typeof province === 'string') userDataToProcess.province = province;
      if (typeof city === 'string') userDataToProcess.city = city;


      // 4. 如果没有任何有效信息需要更新（除了openid）
      // 并且用户已存在，则直接返回成功，避免不必要的数据库写操作
      if (Object.keys(userDataToProcess).length === 0) {
          const userCountResult = await usersCollection.where({ _openid: openid }).count();
          if (userCountResult.total > 0) {
            console.log('[云函数 updateUser] 用户已存在，且没有提供新的信息字段用于更新。OpenID:', openid);
            return { code: 0, message: '用户信息已是最新，无需更新', data: { openid: openid } }; // 返回0表示操作成功
          }
          // 如果用户不存在，即使没有其他信息，也会继续创建基础用户记录
      }


      try {
        // 5. 查询用户是否已存在于数据库
        const userQueryResult = await usersCollection.where({
          _openid: openid
        }).limit(1).get();

        const now = db.serverDate(); // 获取服务端当前时间

        if (userQueryResult.data && userQueryResult.data.length > 0) {
          // 用户已存在，执行更新操作
          const userId = userQueryResult.data[0]._id;
          // 只更新传入的、且有值的字段，并更新 updateTime
          // 确保 userDataToProcess 不为空才执行更新，避免空更新
          if (Object.keys(userDataToProcess).length > 0) {
            const updateData = { ...userDataToProcess, updateTime: now };
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
            // 用户存在，但没有新信息提交，也视为成功
             return { code: 0, message: '用户信息无需更新', data: { userId: userId } };
          }
        } else {
          // 用户不存在，执行创建新用户操作
          const newUserRecord = {
            _openid: openid,
            ...userDataToProcess, // 包含昵称、头像、性别等
            createTime: now,
            updateTime: now,
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
    