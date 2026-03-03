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
      const { customerName, age, phone, date, timeSlot, nickname, openid } = body;
      
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
      
      // 生成流水号：BZ + 年月日 + 6位随机数
      const now = new Date();
      const dateStr = now.getFullYear().toString() +
                     String(now.getMonth() + 1).padStart(2, '0') +
                     String(now.getDate()).padStart(2, '0');
      const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      const serialNumber = 'BZ' + dateStr + randomNum;
      
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
          nickname: nickname || '',
          openid: openid || '',
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

      // 获取所有用户的头像信息
      const usersRes = await db.collection('users').get();
      const userMap = {};
      usersRes.data.forEach(u => {
        userMap[u.openid] = u.avatar || '';
      });

      const bookings = bookingsRes.data.map(b => ({
        ...b,
        avatar: userMap[b.openid] || '',
        statusText: b.status === 'cancelled' ? '已撤销' : (b.verified ? '已核销' : '已预约')
      }));

      return { code: 0, success: true, bookings: bookings };
    }
    
    // 获取统计数据（admin后台用）
    if (path.startsWith('/api/statistics') && method === 'GET') {
      const month = event.queryStringParameters && event.queryStringParameters.month;
      
      let query = db.collection('bookings').orderBy('createdAt', 'desc');
      if (month) {
        query = query.where({
          date: db.RegExp({
            regexp: '^' + month,
            options: 'i'
          })
        });
      }
      
      const bookingsRes = await query.get();
      const bookings = bookingsRes.data;
      
      // 计算统计数据
      const total = bookings.length;
      const completed = bookings.filter(b => b.verified).length;
      const cancelled = bookings.filter(b => b.status === 'cancelled').length;
      const pending = total - completed - cancelled;
      
      // 按日期统计
      const dailyStats = {};
      bookings.forEach(b => {
        const date = b.date;
        if (!dailyStats[date]) {
          dailyStats[date] = { date, count: 0, completed: 0, cancelled: 0 };
        }
        dailyStats[date].count++;
        if (b.verified) dailyStats[date].completed++;
        if (b.status === 'cancelled') dailyStats[date].cancelled++;
      });
      
      return { 
        code: 0, 
        success: true,
        summary: {
          total,
          completed,
          pending,
          cancelled
        },
        dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))
      };
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
    
    // 微信授权回调 - 完整版，调用微信API获取用户信息
    if (path === '/api/wechat/callback' && method === 'GET') {
      const code = event.queryStringParameters && event.queryStringParameters.code;

      if (!code) {
        return { code: -1, success: false, message: '授权失败：缺少code参数' };
      }

      try {
        // 1. 使用 code 换取 access_token 和 openid
        const appid = 'wx1429f448f5034214';
        const secret = process.env.WECHAT_APPSECRET || 'f376c0c3efaf0a72db626ace03a84681';
        
        console.log('AppSecret来源:', process.env.WECHAT_APPSECRET ? '环境变量' : '硬编码');

        const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appid}&secret=${secret}&code=${code}&grant_type=authorization_code`;
        
        console.log('正在换取access_token，code:', code.substring(0, 10) + '...');

        const tokenRes = await new Promise((resolve, reject) => {
          const https = require('https');
          https.get(tokenUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              console.log('token响应:', data);
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            });
          }).on('error', (err) => {
            console.error('请求token失败:', err);
            reject(err);
          });
        });

        if (tokenRes.errcode) {
          console.error('微信授权失败:', tokenRes);
          return { code: -1, success: false, message: '微信授权失败: ' + tokenRes.errmsg };
        }

        const { access_token, openid } = tokenRes;
        console.log('获取到openid:', openid);

        // 2. 使用 access_token 获取用户信息
        const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;

        const userInfo = await new Promise((resolve, reject) => {
          const https = require('https');
          https.get(userInfoUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              console.log('userinfo响应:', data);
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            });
          }).on('error', (err) => {
            console.error('请求userinfo失败:', err);
            reject(err);
          });
        });

        if (userInfo.errcode) {
          console.error('获取用户信息失败:', userInfo);
          return { code: -1, success: false, message: '获取用户信息失败: ' + userInfo.errmsg };
        }

        console.log('微信用户信息:', JSON.stringify(userInfo));

        // 处理头像URL
        let avatarUrl = userInfo.headimgurl || '';
        if (avatarUrl) {
          // 微信头像URL直接使用，不去掉尺寸参数
          avatarUrl = avatarUrl;
        }

        // 3. 保存用户信息到数据库
        const userCollection = db.collection('users');
        const existingUser = await userCollection.where({ openid }).get();

        const userData = {
          openid,
          nickname: userInfo.nickname || '微信用户',
          avatar: avatarUrl,
          sex: userInfo.sex || 0,
          province: userInfo.province || '',
          city: userInfo.city || '',
          country: userInfo.country || '',
          updatedAt: new Date().toISOString()
        };

        console.log('保存用户数据:', JSON.stringify(userData));

        if (existingUser.data.length === 0) {
          await userCollection.add({
            data: {
              ...userData,
              createdAt: new Date().toISOString()
            }
          });
        } else {
          await userCollection.doc(existingUser.data[0]._id).update({
            data: userData
          });
        }

        // 4. 返回用户信息
        return {
          code: 0,
          success: true,
          user: {
            openid,
            nickname: userInfo.nickname || '微信用户',
            avatar: avatarUrl
          }
        };

      } catch (error) {
        console.error('微信登录错误:', error);
        return { code: -1, success: false, message: '微信登录失败: ' + error.message };
      }
    }
    
    // 获取门店列表
    if (path === '/api/stores' && method === 'GET') {
      const storesRes = await db.collection('stores').get();
      
      // 如果没有门店数据，初始化默认门店
      if (storesRes.data.length === 0) {
        await db.collection('stores').add({
          data: {
            id: 'store_001',
            name: '和平路总店',
            address: '天津市和平区和平路XXX号',
            phone: '022-XXXXXXXX',
            status: 'active',
            createdAt: new Date().toISOString()
          }
        });
        const newStoresRes = await db.collection('stores').get();
        return { code: 0, success: true, stores: newStoresRes.data };
      }
      
      return { code: 0, success: true, stores: storesRes.data };
    }
    
    // 获取验光师列表
    if (path === '/api/optometrists' && method === 'GET') {
      const { storeId } = event.queryStringParameters || {};
      
      let query = db.collection('optometrists');
      if (storeId) {
        query = query.where({ storeId });
      }
      
      const optometristsRes = await query.get();
      
      // 如果没有验光师数据，初始化默认验光师
      if (optometristsRes.data.length === 0) {
        await db.collection('optometrists').add({
          data: {
            id: 'opt_001',
            name: '许晓龙',
            storeId: 'store_001',
            title: '专职验光师',
            bio: '和平路总店专职验光师，从事验光工作多年，经验丰富，专业细致，为您提供优质的验光服务。擅长各类视力问题的检查与矫正，包括近视、远视、散光等常见视力问题。',
            avatar: '',
            status: 'active',
            createdAt: new Date().toISOString()
          }
        });
        const newOptometristsRes = await db.collection('optometrists').get();
        return { code: 0, success: true, optometrists: newOptometristsRes.data };
      }
      
      return { code: 0, success: true, optometrists: optometristsRes.data };
    }
    
    return { code: -1, success: false, message: '接口不存在' };

  } catch (error) {
    return { code: -1, success: false, message: error.message };
  }
};
