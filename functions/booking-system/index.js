// 云函数 - 数据库版
const cloud = require('wx-server-sdk');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async function(event, context) {
  const path = event.path || '/';
  const method = event.httpMethod || 'GET';
  
  try {
    // 获取可预约日期
    if (path === '/api/available-dates' && method === 'GET') {
      const dates = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 获取所有班次
      const shiftsRes = await db.collection('shifts').get();
      const shiftDates = shiftsRes.data.map(s => s.date);
      
      for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().slice(0, 10);
        const hasShift = shiftDates.includes(dateStr);
        dates.push({ date: dateStr, available: hasShift, dayOfWeek: date.getDay() });
      }
      
      return { code: 0, success: true, dates: dates };
    }
    
    // 获取时间段
    if (path.startsWith('/api/time-slots/') && method === 'GET') {
      const date = path.split('/').pop();
      
      // 获取班次
      const shiftRes = await db.collection('shifts').where({ date }).get();
      if (shiftRes.data.length === 0) {
        return { code: 0, success: false, message: '该日期不可预约', slots: [] };
      }
      
      const shift = shiftRes.data[0];
      const totalSlots = shift.slots || 2;
      
      // 获取已预约数量
      const bookingsRes = await db.collection('bookings').where({
        date,
        status: 'confirmed'
      }).get();
      
      const slots = [];
      for (let hour = 9; hour < 18; hour++) {
        const time = `${hour}:00-${hour + 1}:00`;
        const booked = bookingsRes.data.filter(b => b.time === time).length;
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
      
      // 检查班次
      const shiftRes = await db.collection('shifts').where({ date }).get();
      if (shiftRes.data.length === 0) {
        return { code: -1, success: false, message: '该日期不可预约' };
      }
      
      const shift = shiftRes.data[0];
      const totalSlots = shift.slots || 2;
      
      // 检查是否已满
      const bookingsRes = await db.collection('bookings').where({
        date,
        time: timeSlot,
        status: 'confirmed'
      }).count();
      
      if (bookingsRes.total >= totalSlots) {
        return { code: -1, success: false, message: '该时间段已约满' };
      }
      
      const serialNumber = 'BK' + Date.now();
      
      // 创建预约
      await db.collection('bookings').add({
        data: {
          serialNumber,
          customerName,
          age: parseInt(age),
          phone,
          date,
          time: timeSlot,
          status: 'confirmed',
          verified: false,
          createdAt: new Date().toISOString()
        }
      });
      
      return { code: 0, success: true, booking: { serialNumber, date, time: timeSlot, timeSlot: timeSlot, verified: false } };
    }
    
    // 获取顾客预约记录
    if (path === '/api/customer/bookings' && method === 'GET') {
      const phone = event.queryStringParameters && event.queryStringParameters.phone;
      
      let query = db.collection('bookings').orderBy('createdAt', 'desc');
      if (phone) {
        query = query.where({ phone });
      }
      
      const bookingsRes = await query.get();
      
      const bookings = bookingsRes.data.map(b => ({
        ...b,
        statusText: b.status === 'cancelled' ? '已撤销' : (b.verified ? '已核销' : '已预约')
      }));
      
      return { code: 0, success: true, bookings: bookings };
    }
    
    // 设置班次
    if (path === '/api/shifts' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { optometristId, dates, slots } = body;
      
      // 删除旧班次
      const oldShifts = await db.collection('shifts').where({ optometristId }).get();
      for (const shift of oldShifts.data) {
        await db.collection('shifts').doc(shift._id).remove();
      }
      
      // 添加新班次
      for (const date of dates) {
        await db.collection('shifts').add({
          data: {
            optometristId,
            date,
            slots: slots || 2,
            createdAt: new Date().toISOString()
          }
        });
      }
      
      return { code: 0, success: true, message: '班次设置成功' };
    }
    
    // 获取班次
    if (path.startsWith('/api/shifts/') && method === 'GET') {
      const parts = path.split('/');
      const optometristId = parts[3];
      const month = parts[4];
      
      let query = db.collection('shifts').where({ optometristId });
      const shiftsRes = await query.get();
      
      let shifts = shiftsRes.data;
      if (month) {
        shifts = shifts.filter(s => s.date.startsWith(month));
      }
      
      return { code: 0, success: true, shifts: shifts };
    }
    
    // 获取预约列表
    if (path === '/api/bookings' && method === 'GET') {
      const bookingsRes = await db.collection('bookings').orderBy('createdAt', 'desc').get();
      
      const bookings = bookingsRes.data.map(b => ({
        ...b,
        statusText: b.status === 'cancelled' ? '已撤销' : (b.verified ? '已核销' : '已预约')
      }));
      
      return { code: 0, success: true, bookings: bookings };
    }
    
    // 核销预约
    if (path === '/api/verify/confirm' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { serialNumber } = body;
      
      const bookingRes = await db.collection('bookings').where({ serialNumber }).get();
      if (bookingRes.data.length === 0) {
        return { code: -1, success: false, message: '预约不存在' };
      }
      
      const booking = bookingRes.data[0];
      if (booking.verified) {
        return { code: 0, success: true, message: '已核销', alreadyUsed: true };
      }
      
      await db.collection('bookings').doc(booking._id).update({
        data: {
          verified: true,
          verifiedAt: new Date().toISOString(),
          status: 'completed'
        }
      });
      
      return { code: 0, success: true, message: '核销成功' };
    }
    
    // 撤销预约
    if (path === '/api/bookings/cancel' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { serialNumber } = body;
      
      const bookingRes = await db.collection('bookings').where({ serialNumber }).get();
      if (bookingRes.data.length === 0) {
        return { code: -1, success: false, message: '预约不存在' };
      }
      
      const booking = bookingRes.data[0];
      if (booking.verified) {
        return { code: -1, success: false, message: '已核销的预约无法撤销' };
      }
      if (booking.status === 'cancelled') {
        return { code: -1, success: false, message: '预约已撤销' };
      }
      
      await db.collection('bookings').doc(booking._id).update({
        data: {
          status: 'cancelled',
          cancelledAt: new Date().toISOString()
        }
      });
      
      return { code: 0, success: true, message: '撤销成功' };
    }
    
    // 用户登录
    if (path === '/api/login' && method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { username, password } = body;
      
      // 检查内置用户
      const users = [
        { username: 'xuxiaolong', password: 'xxl2024', role: 'optometrist', name: '许晓龙' },
        { username: 'admin', password: 'admin123', role: 'admin', name: '管理员' },
        { username: 'staff', password: 'staff123', role: 'staff', name: '员工' }
      ];
      
      const user = users.find(u => u.username === username && u.password === password);
      if (user) {
        return { code: 0, success: true, user: { id: username, username: username, role: user.role, name: user.name } };
      }
      
      return { code: -1, success: false, message: '用户名或密码错误' };
    }
    
    // 微信授权回调
    if (path === '/api/wechat/callback' && method === 'GET') {
      const code = event.queryStringParameters && event.queryStringParameters.code;
      
      if (!code) {
        return { code: -1, success: false, message: '授权失败' };
      }
      
      // 使用 code 换取 access_token 和 openid
      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=wx1429f448f5034214&secret=f376c0c3efaf0a72db626ace03a84681&code=${code}&grant_type=authorization_code`;
      
      try {
        const tokenRes = await cloud.openapi.request({
          method: 'GET',
          url: tokenUrl
        });
        
        const tokenData = JSON.parse(tokenRes.data);
        
        if (tokenData.errcode) {
          return { code: -1, success: false, message: tokenData.errmsg };
        }
        
        const { openid, access_token } = tokenData;
        
        // 获取用户信息
        const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
        const userRes = await cloud.openapi.request({
          method: 'GET',
          url: userInfoUrl
        });
        
        const userData = JSON.parse(userRes.data);
        
        if (userData.errcode) {
          return { code: -1, success: false, message: userData.errmsg };
        }
        
        // 保存或更新用户信息
        const userCollection = db.collection('users');
        const existingUser = await userCollection.where({ openid }).get();
        
        if (existingUser.data.length === 0) {
          await userCollection.add({
            data: {
              openid,
              nickname: userData.nickname,
              avatar: userData.headimgurl,
              createdAt: new Date().toISOString()
            }
          });
        }
        
        // 重定向回前端页面
        return {
          statusCode: 302,
          headers: {
            'Location': `https://suhouyong2026-5gq178it64857137-1404541376.tcloudbaseapp.com/?openid=${openid}&wechat_login=1`
          }
        };
        
      } catch (error) {
        return { code: -1, success: false, message: error.message };
      }
    }
    
    return { code: -1, success: false, message: '接口不存在' };
    
  } catch (error) {
    return { code: -1, success: false, message: error.message };
  }
};
