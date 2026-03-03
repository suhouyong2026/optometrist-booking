// 云函数 - 简化版（不使用 wx-server-sdk）
exports.main = async function(event, context) {
  const path = event.path || '/';
  const method = event.httpMethod || 'GET';
  
  // 使用 global 存储数据（比临时缓存持久，但云函数冷启动会清空）
  if (!global.bookings) global.bookings = [];
  if (!global.shifts) global.shifts = [];
  if (!global.users) global.users = [
    { username: 'xuxiaolong', password: 'xxl2024', role: 'optometrist', name: '许晓龙' },
    { username: 'admin', password: 'admin123', role: 'admin', name: '管理员' },
    { username: 'staff', password: 'staff123', role: 'staff', name: '员工' }
  ];
  
  try {
    // 获取可预约日期
    if (path === '/api/available-dates' && method === 'GET') {
      const dates = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().slice(0, 10);
        const hasShift = global.shifts.some(s => s.date === dateStr);
        dates.push({ date: dateStr, available: hasShift, dayOfWeek: date.getDay() });
      }
      
      return { code: 0, success: true, dates: dates };
    }
    
    // 获取时间段
    if (path.startsWith('/api/time-slots/') && method === 'GET') {
      const date = path.split('/').pop();
      const shift = global.shifts.find(s => s.date === date);
      
      if (!shift) return { code: 0, success: false, message: '该日期不可预约', slots: [] };
      
      const totalSlots = shift.slots || 2;
      const bookingsForDate = global.bookings.filter(b => b.date === date && b.status === 'confirmed');
      
      const slots = [];
      for (let hour = 9; hour < 18; hour++) {
        const time = `${hour}:00-${hour + 1}:00`;
        const booked = bookingsForDate.filter(b => b.time === time).length;
        slots.push({ time, available: booked < totalSlots, total: totalSlots, booked });
      }
      
      return { code: 0, success: true, slots: slots };
    }
    
    // 创建预约
    if (path === '/api/bookings' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { customerName, age, phone, date, timeSlot } = body;
      
      if (!customerName || !age || !phone || !date || !timeSlot) {
        return { code: -1, success: false, message: '请填写完整信息' };
      }
      
      const shift = global.shifts.find(s => s.date === date);
      if (!shift) return { code: -1, success: false, message: '该日期不可预约' };
      
      const totalSlots = shift.slots || 2;
      const bookedCount = global.bookings.filter(
        b => b.date === date && b.time === timeSlot && b.status === 'confirmed'
      ).length;
      
      if (bookedCount >= totalSlots) return { code: -1, success: false, message: '该时间段已约满' };
      
      const serialNumber = 'BK' + Date.now();
      
      global.bookings.push({
        serialNumber, customerName, age: parseInt(age), phone, date, time: timeSlot,
        status: 'confirmed', verified: false, createdAt: new Date().toISOString()
      });
      
      return { code: 0, success: true, booking: { serialNumber, date, time: timeSlot, timeSlot: timeSlot, verified: false } };
    }
    
    // 获取顾客预约记录
    if (path === '/api/customer/bookings' && method === 'GET') {
      const phone = event.queryStringParameters && event.queryStringParameters.phone;
      let bookings = global.bookings;
      if (phone) bookings = bookings.filter(b => b.phone === phone);
      bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      bookings = bookings.map(b => ({
        ...b,
        statusText: b.status === 'cancelled' ? '已撤销' : (b.verified ? '已核销' : '已预约')
      }));
      
      return { code: 0, success: true, bookings: bookings };
    }
    
    // 设置班次
    if (path === '/api/shifts' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { optometristId, dates, slots } = body;
      global.shifts = global.shifts.filter(s => s.optometristId !== optometristId);
      for (const date of dates) {
        global.shifts.push({ optometristId, date, slots: slots || 2, createdAt: new Date().toISOString() });
      }
      return { code: 0, success: true, message: '班次设置成功' };
    }
    
    // 获取班次
    if (path.startsWith('/api/shifts/') && method === 'GET') {
      const parts = path.split('/');
      const optometristId = parts[3];
      const month = parts[4];
      let shifts = global.shifts.filter(s => s.optometristId === optometristId);
      if (month) shifts = shifts.filter(s => s.date.startsWith(month));
      return { code: 0, success: true, shifts: shifts };
    }
    
    // 获取预约列表
    if (path === '/api/bookings' && method === 'GET') {
      let bookings = global.bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      bookings = bookings.map(b => ({ ...b, statusText: b.status === 'cancelled' ? '已撤销' : (b.verified ? '已核销' : '已预约') }));
      return { code: 0, success: true, bookings: bookings };
    }
    
    // 核销预约
    if (path === '/api/verify/confirm' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { serialNumber } = body;
      const booking = global.bookings.find(b => b.serialNumber === serialNumber);
      if (!booking) return { code: -1, success: false, message: '预约不存在' };
      if (booking.verified) return { code: 0, success: true, message: '已核销', alreadyUsed: true };
      booking.verified = true;
      booking.verifiedAt = new Date().toISOString();
      booking.status = 'completed';
      return { code: 0, success: true, message: '核销成功' };
    }
    
    // 撤销预约
    if (path === '/api/bookings/cancel' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { serialNumber } = body;
      
      const bookingIndex = global.bookings.findIndex(b => b.serialNumber === serialNumber);
      if (bookingIndex === -1) return { code: -1, success: false, message: '预约不存在' };
      
      const booking = global.bookings[bookingIndex];
      if (booking.verified) return { code: -1, success: false, message: '已核销的预约无法撤销' };
      if (booking.status === 'cancelled') return { code: -1, success: false, message: '预约已撤销' };
      
      booking.status = 'cancelled';
      booking.cancelledAt = new Date().toISOString();
      
      return { code: 0, success: true, message: '撤销成功' };
    }
    
    // 用户登录
    if (path === '/api/login' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { username, password } = body;
      const user = global.users.find(u => u.username === username && u.password === password);
      if (user) return { code: 0, success: true, user: { id: username, username: username, role: user.role, name: user.name } };
      return { code: -1, success: false, message: '用户名或密码错误' };
    }
    
    // 微信授权回调 - 简化版
    if (path === '/api/wechat/callback' && method === 'GET') {
      const code = event.queryStringParameters && event.queryStringParameters.code;
      
      if (!code) {
        return { code: -1, success: false, message: '授权失败' };
      }
      
      // 简化处理：直接返回成功，不调用微信API
      // 实际项目中应该使用 code 换取 access_token
      const mockOpenid = 'wx_' + Date.now();
      
      return {
        code: 0,
        success: true,
        user: {
          openid: mockOpenid,
          nickname: '微信用户',
          avatar: ''
        }
      };
    }
    
    return { code: -1, success: false, message: '接口不存在' };
    
  } catch (error) {
    return { code: -1, success: false, message: error.message };
  }
};
