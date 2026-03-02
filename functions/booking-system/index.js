const cloud = require('tcb-admin-node');
const axios = require('axios');
const QRCode = require('qrcode');

// 云函数入口
exports.main = async (event, context) => {
  const { path, method, body, queryStringParameters, headers } = event;
  
  // 初始化云数据库
  const app = cloud.init({
    env: cloud.SYMBOL_CURRENT_ENV
  });
  const db = app.database();
  
  // 微信配置
  const WECHAT_APPID = process.env.WECHAT_APPID || '';
  const WECHAT_SECRET = process.env.WECHAT_SECRET || '';
  
  try {
    // ==================== 微信 OAuth2.0 相关接口 ====================
    
    // 微信授权回调
    if (path === '/api/wechat/callback' && method === 'GET') {
      const { code } = queryStringParameters || {};
      
      if (!code) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: { success: false, message: '缺少 code 参数' }
        };
      }
      
      // 获取 access_token
      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}&code=${code}&grant_type=authorization_code`;
      const tokenResponse = await axios.get(tokenUrl);
      
      if (tokenResponse.data.errcode) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: { success: false, message: tokenResponse.data.errmsg }
        };
      }
      
      const { access_token, openid } = tokenResponse.data;
      
      // 获取用户信息
      const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
      const userInfoResponse = await axios.get(userInfoUrl);
      
      if (userInfoResponse.data.errcode) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: { success: false, message: userInfoResponse.data.errmsg }
        };
      }
      
      const userInfo = userInfoResponse.data;
      
      // 保存用户到数据库
      await saveWechatUser(db, openid, userInfo);
      
      // 返回重定向
      return {
        statusCode: 302,
        headers: {
          'Location': `/?openid=${openid}&wechat_login=1`,
          'Access-Control-Allow-Origin': '*'
        },
        body: {}
      };
    }
    
    // 获取用户信息
    if (path === '/api/wechat/userinfo' && method === 'GET') {
      const { openid } = queryStringParameters || {};
      
      if (!openid) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: { success: false, message: '缺少 openid' }
        };
      }
      
      const result = await db.collection('users').where({ openid }).get();
      
      if (result.data.length > 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: { success: true, user: result.data[0] }
        };
      } else {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: { success: false, message: '用户不存在' }
        };
      }
    }
    
    // ==================== 预约相关接口 ====================
    
    // 获取可预约日期
    if (path === '/api/available-dates' && method === 'GET') {
      return await getAvailableDates(db);
    }
    
    // 获取时间段
    if (path.startsWith('/api/time-slots/') && method === 'GET') {
      const date = path.split('/').pop();
      return await getTimeSlots(db, date);
    }
    
    // 创建预约
    if (path === '/api/bookings' && method === 'POST') {
      return await createBooking(db, body);
    }
    
    // 获取顾客预约记录
    if (path === '/api/customer/bookings' && method === 'GET') {
      const { phone, openid } = queryStringParameters || {};
      return await getCustomerBookings(db, phone, openid);
    }
    
    // 核销预约
    if (path === '/api/verify/confirm' && method === 'POST') {
      return await verifyBooking(db, body);
    }
    
    // 获取预约列表
    if (path === '/api/bookings' && method === 'GET') {
      const { date, status } = queryStringParameters || {};
      return await getBookings(db, date, status);
    }
    
    // 获取统计数据
    if (path === '/api/statistics' && method === 'GET') {
      const { month } = queryStringParameters || {};
      return await getStatistics(db, month);
    }
    
    // 设置班次
    if (path === '/api/shifts' && method === 'POST') {
      return await setShifts(db, body);
    }
    
    // 获取班次
    if (path.startsWith('/api/shifts/') && method === 'GET') {
      const parts = path.split('/');
      const optometristId = parts[3];
      const month = parts[4];
      return await getShifts(db, optometristId, month);
    }
    
    // 用户登录
    if (path === '/api/login' && method === 'POST') {
      return await login(db, body);
    }
    
    // 404
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: false, message: '接口不存在' }
    };
    
  } catch (error) {
    console.error('API 错误:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: false, message: error.message }
    };
  }
};

// ==================== 辅助函数 ====================

// 保存微信用户
async function saveWechatUser(db, openid, userInfo) {
  try {
    const queryResult = await db.collection('users').where({ openid }).get();
    
    if (queryResult.data.length > 0) {
      await db.collection('users').doc(queryResult.data[0]._id).update({
        nickname: userInfo.nickname,
        avatar: userInfo.headimgurl,
        lastLoginAt: new Date().toISOString()
      });
      return queryResult.data[0];
    } else {
      const user = {
        openid,
        nickname: userInfo.nickname,
        avatar: userInfo.headimgurl,
        sex: userInfo.sex,
        city: userInfo.city,
        province: userInfo.province,
        country: userInfo.country,
        role: 'customer',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      const result = await db.collection('users').add(user);
      return { _id: result.id, ...user };
    }
  } catch (error) {
    console.error('保存微信用户失败:', error);
    throw error;
  }
}

// 获取可预约日期
async function getAvailableDates(db) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const nextMonth = new Date(today);
  nextMonth.setDate(nextMonth.getDate() + 30);
  
  const shiftsResult = await db.collection('shifts')
    .where({
      date: db.command.gte(today.toISOString().slice(0, 10))
        .and(db.command.lte(nextMonth.toISOString().slice(0, 10)))
    })
    .get();
  
  const shifts = shiftsResult.data || [];
  
  const availableDates = [];
  const currentDate = new Date(today);
  currentDate.setDate(currentDate.getDate() + 1);
  
  while (currentDate <= nextMonth) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    const hasShift = shifts.some(s => s.date === dateStr);
    
    availableDates.push({
      date: dateStr,
      available: hasShift,
      dayOfWeek: currentDate.getDay()
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: { success: true, dates: availableDates }
  };
}

// 获取时间段
async function getTimeSlots(db, date) {
  const shiftsResult = await db.collection('shifts').where({ date }).get();
  
  if (shiftsResult.data.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: false, message: '该日期不可预约', slots: [] }
    };
  }
  
  const shift = shiftsResult.data[0];
  const totalSlots = shift.slots || 2;
  
  const bookingsResult = await db.collection('bookings')
    .where({ date, status: 'confirmed' })
    .get();
  
  const bookings = bookingsResult.data || [];
  const timeCount = {};
  bookings.forEach(b => {
    timeCount[b.time] = (timeCount[b.time] || 0) + 1;
  });
  
  const slots = [];
  for (let hour = 9; hour < 18; hour++) {
    const time = `${hour}:00-${hour + 1}:00`;
    const booked = timeCount[time] || 0;
    
    slots.push({
      time,
      available: booked < totalSlots,
      total: totalSlots,
      booked
    });
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: { success: true, slots }
  };
}

// 创建预约
async function createBooking(db, body) {
  const { customerName, age, phone, date, timeSlot, openid } = body;
  
  if (!customerName || !age || !phone || !date || !timeSlot) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: false, message: '请填写完整信息' }
    };
  }
  
  const shiftsResult = await db.collection('shifts').where({ date }).get();
  
  if (shiftsResult.data.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: false, message: '该日期不可预约' }
    };
  }
  
  const totalSlots = shiftsResult.data[0].slots || 2;
  
  const countResult = await db.collection('bookings')
    .where({ date, time: timeSlot, status: 'confirmed' })
    .count();
  
  if (countResult.total >= totalSlots) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: false, message: '该时间段已约满' }
    };
  }
  
  const serialNumber = 'BK' + Date.now();
  
  const booking = {
    serialNumber,
    customerName,
    age: parseInt(age),
    phone,
    openid: openid || '',
    date,
    time: timeSlot,
    status: 'confirmed',
    verified: false,
    createdAt: new Date().toISOString()
  };
  
  await db.collection('bookings').add(booking);
  
  const qrData = JSON.stringify({
    serialNumber,
    customerName,
    date,
    time: timeSlot
  });
  
  const qrCode = await QRCode.toDataURL(qrData, {
    width: 200,
    margin: 2,
    errorCorrectionLevel: 'M'
  });
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: {
      success: true,
      booking: {
        serialNumber,
        date,
        timeSlot,
        qrCode
      }
    }
  };
}

// 获取顾客预约记录
async function getCustomerBookings(db, phone, openid) {
  let query = {};
  if (openid) {
    query.openid = openid;
  } else if (phone) {
    query.phone = phone;
  }
  
  const result = await db.collection('bookings')
    .where(query)
    .orderBy('createdAt', 'desc')
    .get();
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: { success: true, bookings: result.data || [] }
  };
}

// 核销预约
async function verifyBooking(db, body) {
  const { serialNumber } = body;
  
  const result = await db.collection('bookings').where({ serialNumber }).get();
  
  if (result.data.length === 0) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: false, message: '预约不存在' }
    };
  }
  
  const booking = result.data[0];
  
  if (booking.verified) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: true, message: '已核销', alreadyUsed: true }
    };
  }
  
  await db.collection('bookings').doc(booking._id).update({
    verified: true,
    verifiedAt: new Date().toISOString(),
    status: 'completed'
  });
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: { success: true, message: '核销成功' }
  };
}

// 获取预约列表
async function getBookings(db, date, status) {
  let query = {};
  if (date) query.date = date;
  if (status) query.status = status;
  
  const result = await db.collection('bookings')
    .where(query)
    .orderBy('createdAt', 'desc')
    .get();
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: { success: true, bookings: result.data || [] }
  };
}

// 获取统计数据
async function getStatistics(db, month) {
  let query = {};
  if (month) {
    query.date = db.command.startsWith(month);
  }
  
  const result = await db.collection('bookings').where(query).get();
  const bookings = result.data || [];
  
  const summary = {
    total: bookings.length,
    completed: bookings.filter(b => b.status === 'completed').length,
    pending: bookings.filter(b => b.status === 'confirmed').length
  };
  
  const dailyStats = {};
  bookings.forEach(booking => {
    const date = booking.date;
    if (!dailyStats[date]) {
      dailyStats[date] = { date, total: 0, completed: 0, pending: 0 };
    }
    dailyStats[date].total++;
    if (booking.status === 'completed') dailyStats[date].completed++;
    else dailyStats[date].pending++;
  });
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: {
      success: true,
      summary,
      dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))
    }
  };
}

// 设置班次
async function setShifts(db, body) {
  const { optometristId, dates, slots } = body;
  
  const existingShifts = await db.collection('shifts').where({ optometristId }).get();
  
  for (const shift of existingShifts.data) {
    await db.collection('shifts').doc(shift._id).remove();
  }
  
  for (const date of dates) {
    await db.collection('shifts').add({
      optometristId,
      date,
      slots: slots || 2,
      createdAt: new Date().toISOString()
    });
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: { success: true, message: '班次设置成功' }
  };
}

// 获取班次
async function getShifts(db, optometristId, month) {
  const result = await db.collection('shifts')
    .where({
      optometristId,
      date: db.command.startsWith(month)
    })
    .get();
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: { success: true, shifts: result.data || [] }
  };
}

// 用户登录
async function login(db, body) {
  const { username, password } = body;
  
  const result = await db.collection('users')
    .where({ username, password, role: db.command.neq('customer') })
    .get();
  
  if (result.data.length > 0) {
    const user = result.data[0];
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: {
        success: true,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
          name: user.name
        }
      }
    };
  } else {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: { success: false, message: '用户名或密码错误' }
    };
  }
}
