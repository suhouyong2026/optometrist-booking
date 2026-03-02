const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();

// 中间件
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 云数据库引用
let db = null;

// 初始化数据库
async function initDB() {
  if (!db) {
    const cloud = require('tcb-admin-node');
    db = cloud.database();
  }
  return db;
}

// 内存数据存储（用于初始化）
let inMemoryData = {
  users: [
    { 
      id: '1', 
      username: 'staff', 
      password: 'staff123', 
      role: 'staff',
      name: '和平路总店员工'
    },
    { 
      id: '2', 
      username: 'xuxiaolong', 
      password: 'xxl2024', 
      role: 'optometrist',
      name: '许晓龙'
    },
    { 
      id: '3', 
      username: 'admin', 
      password: 'admin2024', 
      role: 'admin',
      name: '管理员'
    }
  ],
  shifts: [],
  bookings: [],
  timeSlots: {}
};

// 生成唯一流水号
function generateSerialNumber(date) {
  const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${dateStr}${random}`;
}

// API 路由

// 用户登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const db = await initDB();
  
  try {
    const usersCollection = db.collection('users');
    const userResult = await usersCollection
      .where({ username, password })
      .get();
    
    if (userResult.data.length > 0) {
      const user = userResult.data[0];
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
    // 如果数据库没有数据，使用内存数据
    const user = inMemoryData.users.find(u => u.username === username && u.password === password);
    if (user) {
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role,
          name: user.name
        } 
      });
    } else {
      res.json({ success: false, message: '用户名或密码错误' });
    }
  }
});

// 获取班次信息
app.get('/api/shifts', async (req, res) => {
  const db = await initDB();
  try {
    const shiftsCollection = db.collection('shifts');
    const result = await shiftsCollection.get();
    res.json({ success: true, shifts: result.data });
  } catch (error) {
    res.json({ success: true, shifts: inMemoryData.shifts });
  }
});

// 获取某月班次
app.get('/api/shifts/:optometristId/:month', async (req, res) => {
  const { optometristId, month } = req.params;
  const db = await initDB();
  
  try {
    const shiftsCollection = db.collection('shifts');
    const result = await shiftsCollection
      .where({
        optometristId,
        date: db.command.regex({ regexp: `^${month}` })
      })
      .get();
    
    res.json({ success: true, shifts: result.data });
  } catch (error) {
    const shifts = inMemoryData.shifts.filter(s => 
      s.optometristId === optometristId && s.date.startsWith(month)
    );
    res.json({ success: true, shifts });
  }
});

// 设置班次
app.post('/api/shifts', async (req, res) => {
  const { optometristId, dates } = req.body;
  const db = await initDB();
  
  try {
    const shiftsCollection = db.collection('shifts');
    
    // 删除原有班次
    await shiftsCollection
      .where({ optometristId })
      .remove();
    
    // 添加新班次
    const newShifts = dates.map(date => ({
      id: uuidv4(),
      date,
      optometristId
    }));
    
    await shiftsCollection.add({
      data: newShifts[0] || {}
    });
    
    res.json({ success: true, message: '班次设置成功' });
  } catch (error) {
    // 使用内存存储
    inMemoryData.shifts = inMemoryData.shifts.filter(s => s.optometristId !== optometristId);
    dates.forEach(date => {
      inMemoryData.shifts.push({
        id: uuidv4(),
        date,
        optometristId
      });
    });
    res.json({ success: true, message: '班次设置成功' });
  }
});

// 获取可预约日期
app.get('/api/available-dates', async (req, res) => {
  const db = await initDB();
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  let shifts = [];
  
  try {
    const shiftsCollection = db.collection('shifts');
    const result = await shiftsCollection.get();
    shifts = result.data;
  } catch (error) {
    shifts = inMemoryData.shifts;
  }
  
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
});

// 获取时间段
app.get('/api/time-slots/:date', async (req, res) => {
  const { date } = req.params;
  const db = await initDB();
  
  let shifts = [];
  let timeSlots = {};
  
  try {
    const shiftsCollection = db.collection('shifts');
    const shiftsResult = await shiftsCollection.where({ date }).get();
    shifts = shiftsResult.data;
    
    const bookingsCollection = db.collection('bookings');
    const bookingsResult = await bookingsCollection.where({ date }).get();
    
    bookingsResult.data.forEach(booking => {
      const slotKey = `${date}_${booking.timeSlot}`;
      timeSlots[slotKey] = (timeSlots[slotKey] || 0) + 1;
    });
  } catch (error) {
    shifts = inMemoryData.shifts.filter(s => s.date === date);
    timeSlots = inMemoryData.timeSlots;
  }
  
  if (shifts.length === 0) {
    res.json({ success: false, message: '该日期不可预约', slots: [] });
    return;
  }
  
  const slots = [];
  for (let hour = 9; hour < 18; hour++) {
    const startTime = `${hour.toString().padStart(2, '0')}:00`;
    const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`;
    const timeSlot = `${startTime}-${endTime}`;
    const slotKey = `${date}_${startTime}`;
    const booked = timeSlots[slotKey] || 0;
    
    slots.push({
      time: timeSlot,
      startTime: startTime,
      total: 2,
      booked,
      available: booked < 2
    });
  }
  
  res.json({ success: true, slots });
});

// 创建预约
app.post('/api/bookings', async (req, res) => {
  const { customerName, age, phone, date, timeSlot } = req.body;
  const db = await initDB();
  
  const startTime = timeSlot.split('-')[0];
  const slotKey = `${date}_${startTime}`;
  
  let bookings = [];
  try {
    const bookingsCollection = db.collection('bookings');
    const result = await bookingsCollection.where({ date, timeSlot: startTime }).get();
    bookings = result.data;
  } catch (error) {
    bookings = [];
  }
  
  const booked = bookings.length;
  
  if (booked >= 2) {
    res.json({ success: false, message: '该时间段已约满' });
    return;
  }
  
  const booking = {
    id: uuidv4(),
    serialNumber: generateSerialNumber(new Date()),
    customerName,
    age,
    phone,
    date,
    timeSlot,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  try {
    const bookingsCollection = db.collection('bookings');
    await bookingsCollection.add({
      data: booking
    });
    
    const qrData = JSON.stringify({
      serialNumber: booking.serialNumber,
      id: booking.id
    });
    
    const qrCodeImage = await QRCode.toDataURL(qrData);
    
    res.json({ 
      success: true, 
      message: '预约成功',
      booking: {
        ...booking,
        qrCode: qrCodeImage
      }
    });
  } catch (error) {
    inMemoryData.bookings.push(booking);
    inMemoryData.timeSlots[slotKey] = booked + 1;
    
    const qrData = JSON.stringify({
      serialNumber: booking.serialNumber,
      id: booking.id
    });
    
    const qrCodeImage = await QRCode.toDataURL(qrData);
    
    res.json({ 
      success: true, 
      message: '预约成功',
      booking: {
        ...booking,
        qrCode: qrCodeImage
      }
    });
  }
});

// 验证预约
app.post('/api/verify', async (req, res) => {
  const { serialNumber } = req.body;
  const db = await initDB();
  
  let booking = null;
  
  try {
    const bookingsCollection = db.collection('bookings');
    const result = await bookingsCollection
      .where({ serialNumber })
      .get();
    
    if (result.data.length > 0) {
      booking = result.data[0];
    }
  } catch (error) {
    booking = inMemoryData.bookings.find(b => b.serialNumber === serialNumber);
  }
  
  if (!booking) {
    res.json({ 
      success: false, 
      valid: false,
      message: '未找到该预约信息' 
    });
    return;
  }
  
  if (booking.status === 'completed') {
    res.json({ 
      success: true, 
      valid: true,
      alreadyUsed: true,
      message: '该预约已核销',
      booking 
    });
    return;
  }
  
  res.json({ 
    success: true, 
    valid: true,
    alreadyUsed: false,
    message: '预约有效',
    booking 
  });
});

// 获取顾客预约记录
app.get('/api/customer/bookings', async (req, res) => {
  const { phone } = req.query;
  const db = await initDB();
  
  let bookings = [];
  
  try {
    const bookingsCollection = db.collection('bookings');
    const result = await bookingsCollection.where({ phone }).get();
    bookings = result.data;
  } catch (error) {
    bookings = inMemoryData.bookings.filter(b => b.phone === phone);
  }
  
  bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({ success: true, bookings });
});

// 核销预约
app.post('/api/verify/confirm', async (req, res) => {
  const { serialNumber } = req.body;
  const db = await initDB();
  
  try {
    const bookingsCollection = db.collection('bookings');
    const result = await bookingsCollection
      .where({ serialNumber })
      .update({
        status: 'completed',
        verifiedAt: new Date().toISOString()
      });
    
    res.json({ success: true, message: '核销成功' });
  } catch (error) {
    const bookingIndex = inMemoryData.bookings.findIndex(b => b.serialNumber === serialNumber);
    if (bookingIndex !== -1) {
      inMemoryData.bookings[bookingIndex].status = 'completed';
      inMemoryData.bookings[bookingIndex].verifiedAt = new Date().toISOString();
      res.json({ success: true, message: '核销成功' });
    } else {
      res.json({ success: false, message: '未找到该预约' });
    }
  }
});

// 获取预约列表
app.get('/api/bookings', async (req, res) => {
  const { date, status } = req.query;
  const db = await initDB();
  
  let bookings = [];
  
  try {
    const bookingsCollection = db.collection('bookings');
    let query = bookingsCollection;
    
    if (date) {
      query = query.where({ date });
    }
    
    if (status) {
      query = query.where({ status });
    }
    
    const result = await query.get();
    bookings = result.data;
  } catch (error) {
    bookings = inMemoryData.bookings;
    if (date) {
      bookings = bookings.filter(b => b.date === date);
    }
    if (status) {
      bookings = bookings.filter(b => b.status === status);
    }
  }
  
  bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({ success: true, bookings });
});

// 获取统计数据
app.get('/api/statistics', async (req, res) => {
  const { month } = req.query;
  const db = await initDB();
  
  let bookings = [];
  
  try {
    const bookingsCollection = db.collection('bookings');
    const result = await bookingsCollection.get();
    bookings = result.data;
  } catch (error) {
    bookings = inMemoryData.bookings;
  }
  
  if (month) {
    bookings = bookings.filter(b => b.date.startsWith(month));
  }
  
  const dailyStats = {};
  bookings.forEach(booking => {
    const date = booking.date;
    if (!dailyStats[date]) {
      dailyStats[date] = {
        date,
        total: 0,
        completed: 0,
        pending: 0,
        cancelled: 0
      };
    }
    dailyStats[date].total++;
    dailyStats[date][booking.status]++;
  });
  
  const summary = {
    total: bookings.length,
    completed: bookings.filter(b => b.status === 'completed').length,
    pending: bookings.filter(b => b.status === 'pending').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length
  };
  
  res.json({ 
    success: true, 
    summary,
    dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))
  });
});

// 微信登录
app.get('/api/wechat/login', (req, res) => {
  const mockUser = {
    id: 'wechat_' + Math.random().toString(36).substr(2, 9),
    name: '微信用户',
    phone: '13800138000',
    avatar: ''
  };
  
  res.json({ 
    success: true, 
    user: mockUser 
  });
});

// 云函数入口
exports.main = async (event, context) => {
  const { path, method, headers, body } = event;
  
  // 创建请求和响应对象
  const req = {
    method: method || 'GET',
    path: path,
    headers: headers || {},
    body: body || {},
    query: event.queryStringParameters || {}
  };
  
  const res = {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: null
  };
  
  // 路由处理
  try {
    if (path === '/api/login' && method === 'POST') {
      await app._router.handle(req, res, () => {});
    } else if (path.startsWith('/api/')) {
      // 调用相应的 API 处理函数
      const route = path.replace('/api/', '');
      const handler = app[route] || app[`/${route}`];
      
      if (handler) {
        await handler(req, res);
      }
    }
    
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: JSON.stringify(res.body)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: res.headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
