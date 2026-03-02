# 腾讯云云开发部署指南

## 快速部署步骤

### 1. 登录腾讯云
```bash
tcb login
```
扫码登录确认

### 2. 查看环境列表
```bash
tcb env list
```
找到你创建的环境 ID（类似 `booking-xxx`）

### 3. 配置环境 ID
编辑 `cloudbaserc.json`，将 `{{envId}}` 替换为你的实际环境 ID

或者使用命令：
```bash
tcb env set <你的环境 ID>
```

### 4. 初始化数据库集合
在腾讯云云开发控制台：
1. 进入"数据库"
2. 创建以下集合：
   - `users`（用户信息）
   - `shifts`（班次信息）
   - `bookings`（预约记录）

### 5. 部署应用
```bash
# 部署云函数和静态资源
tcb framework deploy
```

### 6. 查看部署状态
```bash
tcb hosting list
```

### 7. 获取访问域名
部署成功后，会显示访问域名，格式类似：
`https://<env-id>.service.tcloudbase.com`

## 数据初始化

由于云开发使用云数据库，需要初始化一些基础数据。

在腾讯云云开发控制台 -> 数据库 -> users 集合，添加以下数据：

```json
{
  "_id": "1",
  "username": "staff",
  "password": "staff123",
  "role": "staff",
  "name": "和平路总店员工"
}
```

```json
{
  "_id": "2",
  "username": "xuxiaolong",
  "password": "xxl2024",
  "role": "optometrist",
  "name": "许晓龙"
}
```

```json
{
  "_id": "3",
  "username": "admin",
  "password": "admin2024",
  "role": "admin",
  "name": "管理员"
}
```

## 微信公众号配置

1. 登录公众号后台：https://mp.weixin.qq.com
2. 进入"内容与互动" → "自定义菜单"
3. 添加菜单项：
   - 菜单名称：预约验光
   - 菜单类型：跳转网页
   - 网页链接：填入云开发域名

## 费用说明

- **免费版**：每月 10GB 流量，适合小规模使用
- **按量付费**：超出后约 ¥0.01/GB
- **云数据库**：免费版包含 2GB 存储
- **云函数**：每月免费调用 1000 万次

预计月费用：¥0-20 元（根据使用量）

## 常见问题

### Q: 部署失败怎么办？
A: 检查以下几点：
1. 是否已登录：`tcb login`
2. 环境 ID 是否正确
3. 网络连接是否正常
4. 查看错误日志

### Q: 如何更新代码？
A: 修改代码后，重新执行：
```bash
tcb framework deploy
```

### Q: 如何查看日志？
A: 
```bash
tcb fn logs booking-system
```

### Q: 如何删除部署？
A:
```bash
tcb framework delete
```

## 技术支持

- 云开发文档：https://docs.cloudbase.net/
- CLI 文档：https://docs.cloudbase.net/cli-v1/
- 腾讯云工单：https://console.cloud.tencent.com/workorder
