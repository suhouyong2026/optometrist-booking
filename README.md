# 验光师预约系统 - 天津标准眼镜

## 📋 项目介绍

专为天津标准眼镜和平路总店定制的验光师预约系统，为许晓龙验光师提供专业的预约服务。

### ✅ 核心功能

- **顾客端**：微信登录、预约表单、二维码生成
- **验光师后台**：班次管理、扫码核销
- **员工后台**：预约查看、数据筛选
- **管理员后台**：统计报表、趋势分析

### 🔐 后台账号

| 角色 | 用户名 | 密码 | 功能 |
|------|--------|------|------|
| 员工 | `staff` | `staff123` | 查看预约情况 |
| 许晓龙 | `xuxiaolong` | `xxl2024` | 设置班次 + 核销预约 |
| 管理员 | `admin` | `admin2024` | 查看统计报表 |

## 🚀 快速开始

### 本地运行

1. **安装依赖**
   ```bash
   npm install
   ```

2. **启动服务器**
   ```bash
   npm start
   ```

3. **访问系统**
   - 顾客端：http://localhost:3000
   - 员工入口：http://localhost:3000/staff.html

### 部署到 Vercel（推荐）

1. **Fork 本项目**到你的 GitHub 账号

2. **登录 Vercel**
   - 访问 https://vercel.com
   - 使用 GitHub 账号登录

3. **导入项目**
   - 点击 "New Project"
   - 选择你的 GitHub 仓库
   - 点击 "Import"

4. **配置部署**
   - Framework Preset: `Node.js`
   - Build Command: `npm install`
   - Output Directory: `public`
   - Install Command: `npm install`

5. **部署完成**
   - 获得域名如：`your-app.vercel.app`
   - 访问域名即可使用

### 部署到阿里云（生产环境）

1. **购买服务器**
   - 阿里云轻量应用服务器（1核2G，约 ¥24/月）
   - 选择 Node.js 镜像

2. **部署步骤**
   ```bash
   # SSH 登录
   ssh root@your_server_ip
   
   # 克隆代码
   git clone your_repo.git
   
   # 安装依赖
   cd optometrist-booking
   npm install
   
   # 启动服务
   npm install -g pm2
   pm2 start server.js --name booking-system
   pm2 save
   pm2 startup
   ```

3. **配置域名**
   - 添加 A 记录指向服务器 IP
   - 配置 Nginx 反向代理

## 📱 微信公众号配置

1. **登录公众号后台**
   - https://mp.weixin.qq.com

2. **自定义菜单**
   - 进入 "内容与互动" → "自定义菜单"
   - 添加菜单项：
     - 菜单名称：预约验光
     - 菜单类型：跳转网页
     - 网页链接：填入你的系统 URL

3. **网页授权配置**（可选）
   - 进入 "开发" → "基本配置"
   - 获取 AppID 和 AppSecret
   - 进入 "接口权限" → "网页授权获取用户基本信息"
   - 设置授权回调域名

## 🎨 技术栈

- **前端**：HTML5 + CSS3 + JavaScript
- **后端**：Node.js + Express
- **数据库**：JSON 文件存储（可扩展到 MongoDB）
- **二维码**：qrcode.js
- **扫码**：jsQR

## 📁 项目结构

```
optometrist-booking/
├── public/              # 前端页面
│   ├── index.html       # 顾客端预约页面
│   ├── profile.html     # 个人中心
│   ├── staff.html       # 员工登录
│   ├── staff/           # 员工后台
│   ├── optometrist/     # 验光师后台
│   └── admin/           # 管理员后台
├── data/                # 数据存储
│   └── database.json    # 数据库文件
├── server.js            # 后端服务器
├── package.json         # 项目配置
├── vercel.json          # Vercel 配置
└── DEPLOY.md            # 部署文档
```

## 🔧 系统特性

- ✅ 响应式设计（支持手机/平板/电脑）
- ✅ 微信登录集成
- ✅ 实时班次管理
- ✅ 二维码生成与核销
- ✅ 完整的数据统计
- ✅ 多角色权限管理
- ✅ 轻量级部署

## 📊 数据安全

- **数据存储**：本地 JSON 文件
- **定期备份**：建议备份 `data/database.json`
- **访问控制**：后台账号密码保护

## 🎯 后续扩展

- [ ] 短信通知功能
- [ ] 顾客评价系统
- [ ] 多验光师支持
- [ ] 多分店支持
- [ ] 在线支付

## 📞 技术支持

如有问题或需要技术支持，请联系开发者。

---

**天津标准眼镜 · 验光师预约系统**  
版本：1.0.0  
更新日期：2026 年 3 月