// 微信登录相关路由
app.get('/api/wechat/login', (req, res) => {
  const { code } = req.query;
  
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

// 初始化测试班次（仅用于测试）
app.post('/api/init-test-shifts', (req, res) => {
  const data = readData();
  const today = new Date();
  
  // 添加未来 7 天的班次
  const testDates = [];
  for (let i = 1; i <= 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    testDates.push(dateStr);
    
    // 检查是否已存在
    const exists = data.shifts.some(s => s.date === dateStr && s.optometristId === '2');
    if (!exists) {
      data.shifts.push({
        id: uuidv4(),
        date: dateStr,
        optometristId: '2' // 许晓龙
      });
    }
  }
  
  if (writeData(data)) {
    res.json({ 
      success: true, 
      message: '已初始化未来 7 天的测试班次',
      dates: testDates
    });
  } else {
    res.json({ success: false, message: '初始化失败' });
  }
});