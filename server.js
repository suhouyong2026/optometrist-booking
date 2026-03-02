const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const QRCode = require('qrcode');
const axios = require('axios');
const cloud = require('tcb-admin-node');

const app = express();
const PORT = process.env.PORT || 3000;

// 微信配置
const WECHAT_APPID = process.env.WECHAT_APPID || 'YOUR_WECHAT_APPID';
const WECHAT_SECRET = process.env.WECHAT_SECRET || 'YOUR_WECHAT_SECRET';

// 腾讯云环境 ID
const TENCENT_ENV_ID = process.env.TENCENT_ENV_ID || 'suhouyong2026-5gq178it64857137';

// 初始化腾讯云开发
let db = null;
try {
  const app = cloud.init({
    env: TENCENT_ENV_ID
  });
  db = app.database();
  console.log('腾讯云开发初始化成功');
} catch (error) {
  console.error('腾讯云开发初始化失败:', error.message);
}

// 中间件
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// 根路径
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// 其他静态页面路由
app.get('/profile.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'profile.html'));
});

app.get('/staff.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'staff.html'));
});

app.get('/staff/dashboard.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'staff', 'dashboard.html'));
});

app.get('/optometrist/dashboard.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'optometrist', 'dashboard.html'));
});

app.get('/admin/dashboard.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'admin', 'dashboard.html'));
});

app.get('/wechat-auth.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'wechat-auth.html'));
});

// ==================== 微信 OAuth2.0 相关接口 ====================

// 微信授权回调 - 获取 code
app.get('/api/wechat/auth', (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    // 重定向到微信授权页
    const redirectUri = encodeURIComponent(`${process.env.BASE_URL || 'http://localhost:3000'}/api/wechat/callback`);
    const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APPID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=STATE#wechat_redirect`;
    res.redirect(authUrl);
    return;
  }
  
  res.redirect(`/api/wechat/callback?code=${code}`);
});

// 微信授权回调 - 处理 code
app.get('/api/wechat/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    // 1. 使用 code 换取 access_token 和 openid
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}&code=${code}&grant_type=authorization_code`;
    const tokenResponse = await axios.get(tokenUrl);
    
    if (tokenResponse.data.errcode) {
      throw new Error(tokenResponse.data.errmsg);
    }
    
    const { access_token, openid } = tokenResponse.data;
    
    // 2. 使用 access_token 和 openid 获取用户信息
    const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
    const userInfoResponse = await axios.get(userInfoUrl);
    
    if (userInfoResponse.data.errcode) {
      throw new Error(userInfoResponse.data.errmsg);
    }
    
    const userInfo = userInfoResponse.data;
    
    // 3. 保存或更新用户信息到腾讯云数据库
    const user = await saveWechatUser(openid, userInfo);
    
    // 4. 跳转到主页，携带用户信息
    res.redirect(`/?openid=${openid}&wechat_login=1`);
    
  } catch (error) {
    console.error('微信授权失败:', error);
    res.redirect('/?error=wechat_auth_failed');
  }
});

// 保存微信用户到数据库
async function saveWechatUser(openid, userInfo) {
  if (!db) {
    console.warn('数据库未初始化，使用内存存储');
    return { openid, ...userInfo };
  }
  
  try {
    // 查询用户是否已存在
    const queryResult = await db.collection('users')
      .where({ openid })
      .get();
    
    if (queryResult.data.length > 0) {
      // 更新用户信息
      await db.collection('users')
        .doc(queryResult.data[0]._id)
        .update({
          nickname: userInfo.nickname,
          avatar: userInfo.headimgurl,
          lastLoginAt: new Date().toISOString()
        });
      
      return queryResult.data[0];
    } else {
      // 创建新用户
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
    return { openid, ...userInfo };
  }
}

// 获取用户信息
app.get('/api/wechat/userinfo', async (req, res) => {
  const { openid } = req.query;
  
  if (!openid) {
    res.json({ success: false, message: '缺少 openid' });
    return;
  }
  
  try {
    if (!db) {
      res.json({ 
        success: true, 
        user: {
          openid,
          nickname: '微信用户',
          avatar: ''
        }
      });
      return;
    }
    
    const result = await db.collection('users')
      .where({ openid })
      .get();
    
    if (result.data.length > 0) {
      res.json({ success: true, user: result.data[0] });
    } else {
      res.json({ success: false, message: '用户不存在' });
    }
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.json({ success: false, message: error.message });
  }
});

// ==================== 预约相关接口（对接腾讯云数据库） ====================

// 获取可预约日期
app.get('/api/available-dates', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const nextMonth = new Date(today);
    nextMonth.setDate(nextMonth.getDate() + 30);
    
    if (!db) {
      // 内存数据（备用）
      res.json({ 
        success: true, 
        dates: generateMockDates(today, nextMonth)
      });
      return;
    }
    
    // 查询班次
    const shiftsResult = await db.collection('shifts')
      .where({
        date: db.command.gte(today.toISOString().slice(0, 10))
          .and(db.command.lte(nextMonth.toISOString().slice(0, 10)))
      })
      .get();
    
    const shifts = shiftsResult.data || [];
    
    // 生成日期列表
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
    
    res.json({ success: true, dates: availableDates });
    
  } catch (error) {
    console.error('获取可预约日期失败:', error);
    res.json({ success: false, message: error.message });
  }
});

// 生成模拟日期（备用）
function generateMockDates(today, nextMonth) {
  const dates = [];
  const currentDate = new Date(today);
  currentDate.setDate(currentDate.getDate() + 1);
  
  while (currentDate <= nextMonth) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    // 周末不可约
    const dayOfWeek = currentDate.getDay();
    const available = dayOfWeek >= 1 && dayOfWeek <= 5;
    
    dates.push({
      date: dateStr,
      available,
      dayOfWeek
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
}

// 获取时间段
app.get('/api/time-slots/:date', async (req, res) => {
  const { date } = req.params;
  
  try {
    if (!db) {
      res.json({ 
        success: true, 
        slots: generateMockTimeSlots()
      });
      return;
    }
    
    // 查询班次
    const shiftsResult = await db.collection('shifts')
      .where({ date })
      .get();
    
    if (shiftsResult.data.length === 0) {
      res.json({ success: false, message: '该日期不可预约', slots: [] });
      return;
    }
    
    const shift = shiftsResult.data[0];
    const totalSlots = shift.slots || 2;
    
    // 查询已预约记录
    const bookingsResult = await db.collection('bookings')
      .where({
        date: date,
        status: 'confirmed'
      })
      .get();
    
    const bookings = bookingsResult.data || [];
    
    // 统计每个时间段的预约数量
    const timeCount = {};
    bookings.forEach(b => {
      timeCount[b.time] = (timeCount[b.time] || 0) + 1;
    });
    
    // 生成时间段
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
    
    res.json({ success: true, slots });
    
  } catch (error) {
    console.error('获取时间段失败:', error);
    res.json({ success: false, message: error.message, slots: generateMockTimeSlots() });
  }
});

// 生成模拟时间段（备用）
function generateMockTimeSlots() {
  const slots = [];
  for (let hour = 9; hour < 18; hour++) {
    const time = `${hour}:00-${hour + 1}:00`;
    slots.push({
      time,
      available: true,
      total: 2,
      booked: 0
    });
  }
  return slots;
}

// 创建预约
app.post('/api/bookings', async (req, res) => {
  const { customerName, age, phone, date, timeSlot, openid } = req.body;
  
  try {
    if (!db) {
      res.json({ 
        success: false, 
        message: '数据库未连接'
      });
      return;
    }
    
    // 检查该日期是否有班次
    const shiftsResult = await db.collection('shifts')
      .where({ date })
      .get();
    
    if (shiftsResult.data.length === 0) {
      res.json({ success: false, message: '该日期不可预约' });
      return;
    }
    
    const totalSlots = shiftsResult.data[0].slots || 2;
    
    // 查询该时间段已预约数量
    const countResult = await db.collection('bookings')
      .where({
        date,
        time: timeSlot,
        status: 'confirmed'
      })
      .count();
    
    if (countResult.total >= totalSlots) {
      res.json({ success: false, message: '该时间段已约满' });
      return;
    }
    
    // 生成流水号
    const serialNumber = 'BK' + Date.now();
    
    // 创建预约记录
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
    
    // 生成二维码
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
    
    res.json({
      success: true,
      booking: {
        serialNumber,
        date,
        timeSlot,
        qrCode
      }
    });
    
  } catch (error) {
    console.error('创建预约失败:', error);
    res.json({ success: false, message: error.message });
  }
});

// 获取顾客预约记录
app.get('/api/customer/bookings', async (req, res) => {
  const { phone, openid } = req.query;
  
  try {
    if (!db) {
      res.json({ success: true, bookings: [] });
      return;
    }
    
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
    
    res.json({ success: true, bookings: result.data || [] });
    
  } catch (error) {
    console.error('获取预约记录失败:', error);
    res.json({ success: false, message: error.message, bookings: [] });
  }
});

// 核销预约
app.post('/api/verify/confirm', async (req, res) => {
  const { serialNumber } = req.body;
  
  try {
    if (!db) {
      res.json({ success: false, message: '数据库未连接' });
      return;
    }
    
    const result = await db.collection('bookings')
      .where({ serialNumber })
      .get();
    
    if (result.data.length === 0) {
      res.json({ success: false, message: '预约不存在' });
      return;
    }
    
    const booking = result.data[0];
    
    if (booking.verified) {
      res.json({ success: true, message: '已核销', alreadyUsed: true });
      return;
    }
    
    await db.collection('bookings')
      .doc(booking._id)
      .update({
        verified: true,
        verifiedAt: new Date().toISOString(),
        status: 'completed'
      });
    
    res.json({ success: true, message: '核销成功' });
    
  } catch (error) {
    console.error('核销失败:', error);
    res.json({ success: false, message: error.message });
  }
});

// 获取预约列表
app.get('/api/bookings', async (req, res) => {
  const { date, status } = req.query;
  
  try {
    if (!db) {
      res.json({ success: true, bookings: [] });
      return;
    }
    
    let query = {};
    if (date) query.date = date;
    if (status) query.status = status;
    
    const result = await db.collection('bookings')
      .where(query)
      .orderBy('createdAt', 'desc')
      .get();
    
    res.json({ success: true, bookings: result.data || [] });
    
  } catch (error) {
    console.error('获取预约列表失败:', error);
    res.json({ success: false, message: error.message, bookings: [] });
  }
});

// 获取统计数据
app.get('/api/statistics', async (req, res) => {
  const { month } = req.query;
  
  try {
    if (!db) {
      res.json({ 
        success: true, 
        summary: { total: 0, completed: 0, pending: 0 },
        dailyStats: []
      });
      return;
    }
    
    let query = {};
    if (month) {
      query.date = db.command.startsWith(month);
    }
    
    const result = await db.collection('bookings')
      .where(query)
      .get();
    
    const bookings = result.data || [];
    
    // 统计数据
    const summary = {
      total: bookings.length,
      completed: bookings.filter(b => b.status === 'completed').length,
      pending: bookings.filter(b => b.status === 'confirmed').length
    };
    
    // 按天统计
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
    
    res.json({
      success: true,
      summary,
      dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))
    });
    
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.json({ success: false, message: error.message });
  }
});

// 设置班次
app.post('/api/shifts', async (req, res) => {
  const { optometristId, dates, slots } = req.body;
  
  try {
    if (!db) {
      res.json({ success: false, message: '数据库未连接' });
      return;
    }
    
    // 删除该验光师原有班次
    const existingShifts = await db.collection('shifts')
      .where({ optometristId })
      .get();
    
    for (const shift of existingShifts.data) {
      await db.collection('shifts').doc(shift._id).remove();
    }
    
    // 添加新班次
    for (const date of dates) {
      await db.collection('shifts').add({
        optometristId,
        date,
        slots: slots || 2,
        createdAt: new Date().toISOString()
      });
    }
    
    res.json({ success: true, message: '班次设置成功' });
    
  } catch (error) {
    console.error('设置班次失败:', error);
    res.json({ success: false, message: error.message });
  }
});

// 获取班次
app.get('/api/shifts/:optometristId/:month', async (req, res) => {
  const { optometristId, month } = req.params;
  
  try {
    if (!db) {
      res.json({ success: true, shifts: [] });
      return;
    }
    
    const result = await db.collection('shifts')
      .where({
        optometristId,
        date: db.command.startsWith(month)
      })
      .get();
    
    res.json({ success: true, shifts: result.data || [] });
    
  } catch (error) {
    console.error('获取班次失败:', error);
    res.json({ success: false, message: error.message, shifts: [] });
  }
});

// 用户登录（后台使用）
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    if (!db) {
      res.json({ success: false, message: '数据库未连接' });
      return;
    }
    
    const result = await db.collection('users')
      .where({ username, password, role: db.command.neq('customer') })
      .get();
    
    if (result.data.length > 0) {
      const user = result.data[0];
      res.json({
        success: true,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
          name: user.name
        }
      });
    } else {
      res.json({ success: false, message: '用户名或密码错误' });
    }
    
  } catch (error) {
    console.error('登录失败:', error);
    res.json({ success: false, message: error.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`顾客端：http://localhost:${PORT}`);
  console.log(`微信授权回调地址：http://localhost:${PORT}/api/wechat/callback`);
  console.log('');
  console.log('⚠️  请配置环境变量：');
  console.log('   WECHAT_APPID=你的微信 AppID');
  console.log('   WECHAT_SECRET=你的微信 AppSecret');
  console.log('   BASE_URL=你的域名（用于微信回调）');
});
