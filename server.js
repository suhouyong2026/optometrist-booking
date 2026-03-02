const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data', 'database.json');

// 初始化数据
function initData() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
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
      shifts: [], // 班次：{ date: '2024-01-15', optometristId: '2' }
      bookings: [], // 预约：{ id, serialNumber, customerName, age, phone, date, timeSlot, status, createdAt }
      timeSlots: {} // 时间段预约数：{ '2024-01-15_09:00': 1 }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

// 读取数据
function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取数据失败:', error);
    return null;
  }
}

// 写入数据
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('写入数据失败:', error);
    return false;
  }
}

// 生成唯一流水号：YYMMDD + 4 位随机数
function generateSerialNumber(date) {
  const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${dateStr}${random}`;
}

// 初始化数据
initData();

// API 路由

// 用户登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const data = readData();
  
  const user = data.users.find(u => u.username === username && u.password === password);
  
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
});

// 获取班次信息
app.get('/api/shifts', (req, res) => {
  const data = readData();
  res.json({ success: true, shifts: data.shifts });
});

// 获取某月班次（许晓龙）
app.get('/api/shifts/:optometristId/:month', (req, res) => {
  const { optometristId, month } = req.params;
  const data = readData();
  
  const monthShifts = data.shifts.filter(s => 
    s.optometristId === optometristId && s.date.startsWith(month)
  );
  
  res.json({ success: true, shifts: monthShifts });
});

// 设置班次（许晓龙）
app.post('/api/shifts', (req, res) => {
  const { optometristId, dates } = req.body;
  const data = readData();
  
  // 删除该验光师原有班次
  data.shifts = data.shifts.filter(s => s.optometristId !== optometristId);
  
  // 添加新班次
  dates.forEach(date => {
    data.shifts.push({
      id: uuidv4(),
      date,
      optometristId
    });
  });
  
  if (writeData(data)) {
    res.json({ success: true, message: '班次设置成功' });
  } else {
    res.json({ success: false, message: '保存失败' });
  }
});

// 获取可预约日期（未来一个月）
app.get('/api/available-dates', (req, res) => {
  const data = readData();
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  const availableDates = [];
  const currentDate = new Date(today);
  currentDate.setDate(currentDate.getDate() + 1); // 从明天开始
  
  while (currentDate <= nextMonth) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    const hasShift = data.shifts.some(s => s.date === dateStr);
    
    availableDates.push({
      date: dateStr,
      available: hasShift,
      dayOfWeek: currentDate.getDay()
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  res.json({ success: true, dates: availableDates });
});

// 获取时间段及预约情况
app.get('/api/time-slots/:date', (req, res) => {
  const { date } = req.params;
  const data = readData();
  
  // 检查该日期是否有班次
  const hasShift = data.shifts.some(s => s.date === date);
  
  if (!hasShift) {
    res.json({ success: false, message: '该日期不可预约', slots: [] });
    return;
  }
  
  // 生成 9:00-18:00 的时间段
  const slots = [];
  for (let hour = 9; hour < 18; hour++) {
    const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
    const slotKey = `${date}_${timeSlot}`;
    const booked = data.timeSlots[slotKey] || 0;
    
    slots.push({
      time: timeSlot,
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
  const data = readData();
  
  // 检查时间段是否可用
  const slotKey = `${date}_${timeSlot}`;
  const booked = data.timeSlots[slotKey] || 0;
  
  if (booked >= 2) {
    res.json({ success: false, message: '该时间段已约满' });
    return;
  }
  
  // 生成预约信息
  const booking = {
    id: uuidv4(),
    serialNumber: generateSerialNumber(new Date()),
    customerName,
    age,
    phone,
    date,
    timeSlot,
    status: 'pending', // pending, confirmed, cancelled, completed
    createdAt: new Date().toISOString()
  };
  
  data.bookings.push(booking);
  data.timeSlots[slotKey] = booked + 1;
  
  if (writeData(data)) {
    // 生成二维码
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
  } else {
    res.json({ success: false, message: '预约失败' });
  }
});

// 验证预约（核销）
app.post('/api/verify', (req, res) => {
  const { serialNumber } = req.body;
  const data = readData();
  
  const booking = data.bookings.find(b => b.serialNumber === serialNumber);
  
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
app.get('/api/customer/bookings', (req, res) => {
  const { phone } = req.query;
  const data = readData();
  
  let bookings = data.bookings;
  
  if (phone) {
    bookings = bookings.filter(b => b.phone === phone);
  }
  
  // 按日期排序
  bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({ success: true, bookings });
});

// 核销预约
app.post('/api/verify/confirm', (req, res) => {
  const { serialNumber } = req.body;
  const data = readData();
  
  const bookingIndex = data.bookings.findIndex(b => b.serialNumber === serialNumber);
  
  if (bookingIndex === -1) {
    res.json({ success: false, message: '未找到该预约' });
    return;
  }
  
  data.bookings[bookingIndex].status = 'completed';
  data.bookings[bookingIndex].verifiedAt = new Date().toISOString();
  
  if (writeData(data)) {
    res.json({ success: true, message: '核销成功' });
  } else {
    res.json({ success: false, message: '核销失败' });
  }
});

// 获取预约列表（员工/管理员）
app.get('/api/bookings', (req, res) => {
  const { date, status } = req.query;
  const data = readData();
  
  let bookings = data.bookings;
  
  if (date) {
    bookings = bookings.filter(b => b.date === date);
  }
  
  if (status) {
    bookings = bookings.filter(b => b.status === status);
  }
  
  // 按日期排序
  bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({ success: true, bookings });
});

// 获取统计数据（管理员）
app.get('/api/statistics', (req, res) => {
  const { month } = req.query;
  const data = readData();
  
  let bookings = data.bookings;
  
  if (month) {
    bookings = bookings.filter(b => b.date.startsWith(month));
  }
  
  // 按天统计
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

// 微信登录相关路由
app.get('/api/wechat/login', (req, res) => {
  const { code } = req.query;
  
  // 实际项目中需要：
  // 1. 使用 code 调用微信 API 获取 openid
  // 2. 根据 openid 查询或创建用户
  // 3. 返回用户信息和 token
  
  // 模拟微信登录
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

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`顾客端：http://localhost:${PORT}`);
  console.log(`员工入口：http://localhost:${PORT}/staff.html`);
});
