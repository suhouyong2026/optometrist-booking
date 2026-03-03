// 简化版云函数 - 不需要额外依赖
exports.main = async function(event, context) {
  const path = event.path || '/';
  const method = event.httpMethod || 'GET';
  
  try {
    // 获取可预约日期
    if (path === '/api/available-dates' && method === 'GET') {
      const dates = [];
      const today = new Date();
      
      for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dayOfWeek = date.getDay();
        
        // 周末不可预约
        const available = dayOfWeek !== 0 && dayOfWeek !== 6;
        
        dates.push({
          date: date.toISOString().slice(0, 10),
          available: available,
          dayOfWeek: dayOfWeek
        });
      }
      
      return { code: 0, success: true, dates: dates };
    }
    
    // 获取时间段
    if (path.startsWith('/api/time-slots/') && method === 'GET') {
      const slots = [];
      for (let hour = 9; hour < 18; hour++) {
        slots.push({
          time: `${hour}:00-${hour + 1}:00`,
          available: true,
          total: 2,
          booked: 0
        });
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
      
      const serialNumber = 'BK' + Date.now();
      
      // 简单的二维码生成（Base64）
      const qrData = JSON.stringify({ serialNumber, customerName, date, timeSlot });
      const qrCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
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
      return { code: 0, success: true, message: '核销成功' };
    }
    
    // 获取预约列表
    if (path === '/api/bookings' && method === 'GET') {
      return { code: 0, success: true, bookings: [] };
    }
    
    // 获取统计数据
    if (path === '/api/statistics' && method === 'GET') {
      return {
        code: 0,
        success: true,
        summary: { total: 0, completed: 0, pending: 0 }
      };
    }
    
    // 设置班次
    if (path === '/api/shifts' && method === 'POST') {
      return { code: 0, success: true, message: '班次设置成功' };
    }
    
    // 用户登录
    if (path === '/api/login' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { username, password } = body;
      
      // 测试账号
      if (username === '13800138001' && password === '123456') {
        return {
          code: 0,
          success: true,
          user: { id: '1', username: username, role: 'staff', name: '员工账号' }
        };
      }
      if (username === '13800138002' && password === '123456') {
        return {
          code: 0,
          success: true,
          user: { id: '2', username: username, role: 'optometrist', name: '许晓龙' }
        };
      }
      if (username === '13800138003' && password === '123456') {
        return {
          code: 0,
          success: true,
          user: { id: '3', username: username, role: 'admin', name: '管理员' }
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
