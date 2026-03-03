// 完整版云函数 - 不需要额外依赖
exports.main = async function(event, context) {
  const path = event.path || '/';
  const method = event.httpMethod || 'GET';
  
  // 模拟数据存储（内存）
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
        const dayOfWeek = date.getDay();
        const dateStr = date.toISOString().slice(0, 10);
        
        // 检查是否有班次
        const hasShift = global.shifts.some(s => s.date === dateStr);
        
        dates.push({
          date: dateStr,
          available: hasShift,
          dayOfWeek: dayOfWeek
        });
      }
      
      return { code: 0, success: true, dates: dates };
    }
    
    // 获取时间段
    if (path.startsWith('/api/time-slots/') && method === 'GET') {
      const date = path.split('/').pop();
      const shift = global.shifts.find(s => s.date === date);
      
      if (!shift) {
        return { code: 0, success: false, message: '该日期不可预约', slots: [] };
      }
      
      const totalSlots = shift.slots || 2;
      const bookingsForDate = global.bookings.filter(b => b.date === date && b.status === 'confirmed');
      
      const slots = [];
      for (let hour = 9; hour < 18; hour++) {
        const time = `${hour}:00-${hour + 1}:00`;
        const booked = bookingsForDate.filter(b => b.time === time).length;
        
        slots.push({
          time: time,
          available: booked < totalSlots,
          total: totalSlots,
          booked: booked
        });
      }
      
      return { code: 0, success: true, slots: slots };
    }
    
    // 创建预约
    if (path === '/api/bookings' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { customerName, age, phone, date, timeSlot, openid } = body;
      
      if (!customerName || !age || !phone || !date || !timeSlot) {
        return { code: -1, success: false, message: '请填写完整信息' };
      }
      
      const shift = global.shifts.find(s => s.date === date);
      if (!shift) {
        return { code: -1, success: false, message: '该日期不可预约' };
      }
      
      const totalSlots = shift.slots || 2;
      const bookedCount = global.bookings.filter(
        b => b.date === date && b.time === timeSlot && b.status === 'confirmed'
      ).length;
      
      if (bookedCount >= totalSlots) {
        return { code: -1, success: false, message: '该时间段已约满' };
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
      
      global.bookings.push(booking);
      
      // 简单的二维码（SVG 格式）
      const qrCode = `data:image/svg+xml;base64,${Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
          <rect fill="white" width="200" height="200"/>
          <text x="50%" y="50%" font-size="20" text-anchor="middle" dy=".3em">${serialNumber}</text>
        </svg>
      `).toString('base64')}`;
      
      return {
        code: 0,
        success: true,
        booking: {
          serialNumber: serialNumber,
          date: date,
          timeSlot: timeSlot,
          qrCode: qrCode
        }
      };
    }
    
    // 获取顾客预约记录
    if (path === '/api/customer/bookings' && method === 'GET') {
      const phone = event.queryStringParameters && event.queryStringParameters.phone;
      const openid = event.queryStringParameters && event.queryStringParameters.openid;
      
      let bookings = global.bookings;
      if (phone) {
        bookings = bookings.filter(b => b.phone === phone);
      } else if (openid) {
        bookings = bookings.filter(b => b.openid === openid);
      }
      
      bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return { code: 0, success: true, bookings: bookings };
    }
    
    // 获取用户信息
    if (path === '/api/wechat/userinfo' && method === 'GET') {
      const openid = event.queryStringParameters && event.queryStringParameters.openid;
      if (!openid) return { code: -1, success: false, message: '缺少 openid' };
      
      return {
        code: 0,
        success: true,
        user: {
          openid: openid,
          nickname: '微信用户',
          avatar: ''
        }
      };
    }
    
    // 核销预约
    if (path === '/api/verify/confirm' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { serialNumber } = body;
      
      const booking = global.bookings.find(b => b.serialNumber === serialNumber);
      
      if (!booking) {
        return { code: -1, success: false, message: '预约不存在' };
      }
      
      if (booking.verified) {
        return { code: 0, success: true, message: '已核销', alreadyUsed: true };
      }
      
      booking.verified = true;
      booking.verifiedAt = new Date().toISOString();
      booking.status = 'completed';
      
      return { code: 0, success: true, message: '核销成功' };
    }
    
    // 获取预约列表
    if (path === '/api/bookings' && method === 'GET') {
      const date = event.queryStringParameters && event.queryStringParameters.date;
      const status = event.queryStringParameters && event.queryStringParameters.status;
      
      let bookings = global.bookings;
      if (date) bookings = bookings.filter(b => b.date === date);
      if (status) bookings = bookings.filter(b => b.status === status);
      
      bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return { code: 0, success: true, bookings: bookings };
    }
    
    // 获取统计数据
    if (path === '/api/statistics' && method === 'GET') {
      const bookings = global.bookings;
      
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
        code: 0,
        success: true,
        summary: summary,
        dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))
      };
    }
    
    // 设置班次
    if (path === '/api/shifts' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { optometristId, dates, slots } = body;
      
      // 删除旧班次
      global.shifts = global.shifts.filter(s => s.optometristId !== optometristId);
      
      // 添加新班次
      for (const date of dates) {
        global.shifts.push({
          optometristId,
          date,
          slots: slots || 2,
          createdAt: new Date().toISOString()
        });
      }
      
      return { code: 0, success: true, message: '班次设置成功' };
    }
    
    // 获取班次
    if (path.startsWith('/api/shifts/') && method === 'GET') {
      const parts = path.split('/');
      const optometristId = parts[3];
      const month = parts[4];
      
      let shifts = global.shifts.filter(s => s.optometristId === optometristId);
      if (month) {
        shifts = shifts.filter(s => s.date.startsWith(month));
      }
      
      return { code: 0, success: true, shifts: shifts };
    }
    
    // 用户登录
    if (path === '/api/login' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { username, password } = body;
      
      // 查找用户
      const user = global.users.find(u => u.username === username && u.password === password);
      
      if (user) {
        return {
          code: 0,
          success: true,
          user: { 
            id: username, 
            username: username, 
            role: user.role, 
            name: user.name 
          }
        };
      }
      
      return { code: -1, success: false, message: '用户名或密码错误' };
    }
    
    return { code: -1, success: false, message: '接口不存在' };
    
  } catch (error) {
    console.error('API 错误:', error);
    return { code: -1, success: false, message: error.message };
  }
};
