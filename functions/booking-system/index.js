const cloud = require('tcb-admin-node');
const QRCode = require('qrcode');

// 云函数入口
exports.main = async (event, context) => {
  const { path, method, body, queryStringParameters } = event;
  
  // 初始化云数据库
  const app = cloud.init({
    env: cloud.SYMBOL_CURRENT_ENV
  });
  const db = app.database();
  
  try {
    // 路由处理
    if (path === '/api/available-dates' && method === 'GET') {
      return await getAvailableDates(db);
    }
    
    if (path.startsWith('/api/time-slots/') && method === 'GET') {
      const date = path.split('/').pop();
      return await getTimeSlots(db, date);
    }
    
    if (path === '/api/bookings' && method === 'POST') {
      return await createBooking(db, body);
    }
    
    if (path === '/api/login' && method === 'POST') {
      return await login(db, body);
    }
    
    if (path === '/api/verify' && method === 'POST') {
      return await verifyBooking(db, body);
    }
    
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: { success: false, message: '接口不存在' }
    };
  } catch (error) {
    console.error('API 错误:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: { success: false, message: error.message }
    };
  }
};

// 获取可预约日期
async function getAvailableDates(db) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const nextMonth = new Date(today);
  nextMonth.setDate(nextMonth.getDate() + 30);
  
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
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: { success: true, dates: availableDates }
  };
}

// 获取时间段
async function getTimeSlots(db, date) {
  // 查询班次
  const shiftsResult = await db.collection('shifts')
    .where({ date })
    .get();
  
  if (shiftsResult.data.length === 0) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: { success: false, message: '该日期不可预约' }
    };
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
  
  // 生成时间段（9:00-10:00, 10:00-11:00, ...）
  const slots = [];
  for (let hour = 9; hour < 18; hour++) {
    const time = `${hour}:00-${hour + 1}:00`;
    const booked = timeCount[time] || 0;
    
    slots.push({
      time: time,
      available: booked < totalSlots,
      total: totalSlots,
      booked: booked
    });
  }
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: { success: true, slots: slots }
  };
}

// 创建预约
async function createBooking(db, body) {
  const { customerName, age, phone, date, timeSlot } = body;
  
  if (!customerName || !age || !phone || !date || !timeSlot) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: { success: false, message: '请填写完整信息' }
    };
  }
  
  // 生成流水号
  const serialNumber = 'BK' + Date.now();
  
  // 检查该时间段是否还有名额
  const shiftsResult = await db.collection('shifts')
    .where({ date })
    .get();
  
  if (shiftsResult.data.length === 0) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: { success: false, message: '该日期不可预约' }
    };
  }
  
  const totalSlots = shiftsResult.data[0].slots || 2;
  
  const countResult = await db.collection('bookings')
    .where({
      date: date,
      time: timeSlot,
      status: 'confirmed'
    })
    .count();
  
  if (countResult.total >= totalSlots) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: { success: false, message: '该时间段已约满' }
    };
  }
  
  // 创建预约记录
  const booking = {
    serialNumber: serialNumber,
    customerName: customerName,
    age: parseInt(age),
    phone: phone,
    date: date,
    time: timeSlot,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    verified: false
  };
  
  await db.collection('bookings').add(booking);
  
  // 生成二维码
  const qrData = JSON.stringify({
    serialNumber: serialNumber,
    customerName: customerName,
    date: date,
    time: timeSlot
  });
  
  const qrCode = await QRCode.toDataURL(qrData, {
    width: 200,
    margin: 2,
    errorCorrectionLevel: 'M'
  });
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: {
      success: true,
      booking: {
        serialNumber: serialNumber,
        date: date,
        timeSlot: timeSlot,
        qrCode: qrCode
      }
    }
  };
}

// 用户登录
async function login(db, body) {
  const { username, password } = body;
  
  const usersResult = await db.collection('users')
    .where({ username, password })
    .get();
  
  if (usersResult.data.length > 0) {
    const user = usersResult.data[0];
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
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
  }
  
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: { success: false, message: '用户名或密码错误' }
  };
}

// 核销预约
async function verifyBooking(db, body) {
  const { serialNumber } = body;
  
  const bookingsResult = await db.collection('bookings')
    .where({ serialNumber })
    .get();
  
  if (bookingsResult.data.length === 0) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: { success: false, message: '预约不存在' }
    };
  }
  
  const booking = bookingsResult.data[0];
  
  if (booking.verified) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: { success: false, message: '已核销' }
    };
  }
  
  // 更新核销状态
  await db.collection('bookings')
    .doc(booking._id)
    .update({
      verified: true,
      verifiedAt: new Date().toISOString()
    });
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: {
      success: true,
      booking: booking
    }
  };
}
