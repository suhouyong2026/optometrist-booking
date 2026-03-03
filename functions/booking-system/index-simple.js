// 云函数 - 简化版
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const path = event.path || '/';
  const method = event.httpMethod || 'GET';
  
  try {
    // 微信授权回调
    if (path === '/api/wechat/callback' && method === 'GET') {
      const code = event.queryStringParameters?.code;
      if (!code) return { code: -1, success: false, message: '缺少code' };
      
      // 简化处理，直接返回成功
      return { 
        code: 0, 
        success: true, 
        user: { openid: 'test_openid', nickname: '测试用户', avatar: '' }
      };
    }
    
    // 获取门店列表
    if (path === '/api/stores' && method === 'GET') {
      return { 
        code: 0, 
        success: true, 
        stores: [{ _id: 'store_001', name: '和平路总店', address: '天津市和平区' }]
      };
    }
    
    // 获取验光师列表
    if (path === '/api/optometrists' && method === 'GET') {
      return { 
        code: 0, 
        success: true, 
        optometrists: [{ 
          _id: 'opt_001', 
          name: '许晓龙', 
          title: '专职验光师',
          bio: '和平路总店专职验光师，从事验光工作多年，经验丰富。'
        }]
      };
    }
    
    // 获取可预约日期
    if (path === '/api/available-dates' && method === 'GET') {
      const dates = [];
      const today = new Date();
      for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        dates.push({ 
          date: date.toISOString().slice(0, 10), 
          available: i === 1, 
          dayOfWeek: date.getDay() 
        });
      }
      return { code: 0, success: true, dates };
    }
    
    // 获取时间段
    if (path.startsWith('/api/time-slots/') && method === 'GET') {
      const slots = [];
      for (let hour = 9; hour < 18; hour++) {
        slots.push({ time: `${hour}:00-${hour + 1}:00`, available: true, total: 2, booked: 0 });
      }
      return { code: 0, success: true, slots };
    }
    
    // 创建预约
    if (path === '/api/bookings' && method === 'POST') {
      return { code: 0, success: true, booking: { serialNumber: 'BZ123456', date: '2026-03-04', time: '09:00-10:00' } };
    }
    
    // 获取预约列表
    if (path === '/api/bookings' && method === 'GET') {
      return { code: 0, success: true, bookings: [] };
    }
    
    // 用户登录
    if (path === '/api/login' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { username, password } = body;
      
      const users = [
        { username: 'xuxiaolong', password: 'xxl2024', role: 'optometrist', name: '许晓龙' },
        { username: 'admin', password: 'admin123', role: 'admin', name: '管理员' },
        { username: 'staff', password: 'staff123', role: 'staff', name: '员工' }
      ];
      
      const user = users.find(u => u.username === username && u.password === password);
      if (user) {
        return { code: 0, success: true, user: { id: username, username, role: user.role, name: user.name } };
      }
      return { code: -1, success: false, message: '用户名或密码错误' };
    }
    
    // 获取统计数据
    if (path.startsWith('/api/statistics') && method === 'GET') {
      return { 
        code: 0, 
        success: true,
        summary: { total: 0, completed: 0, pending: 0, cancelled: 0 },
        dailyStats: []
      };
    }
    
    return { code: -1, success: false, message: '接口不存在: ' + path };
    
  } catch (error) {
    console.error('云函数错误:', error);
    return { code: -1, success: false, message: error.message };
  }
};
