# 家庭管理系统 · family-manager

> 一个**自托管 / 数据私有化**的家庭管理系统：把家里的财务、资产、健康记录统一管起来，
> 并打通微信，用一句话 + AI 自动录入。所有数据只存在你自己的服务器 / NAS 上。

<p align="center">
  <img alt="stack" src="https://img.shields.io/badge/React-19-61dafb">
  <img alt="stack" src="https://img.shields.io/badge/Fastify-5-black">
  <img alt="stack" src="https://img.shields.io/badge/SQLite-WAL-003b57">
  <img alt="license" src="https://img.shields.io/badge/License-MIT-green">
</p>

## ✨ 特性

- **🏠 家庭全方位管理**，不止于记账：
  - 记账收支、资产管理（工资 / 投资 / 保险等）
  - 健康档案：体检报告按成员归档、自动解析结论与异常项；就诊记录（主诉 / 检查 / 诊断 / 医嘱 / 用药）
  - 分类、账户、家庭成员统一管理
- **💬 打通微信，AI 一句话录入**：在微信里发「午饭花了 35」「收到工资 15000」，
  经 [OpenILink Hub](https://github.com/openilink/openilink-hub) 转发，AI 自动解析金额、类型、分类并入账。
  支持图片小票 / 截图识别（OCR + 视觉模型）。
- **🔒 数据私有化 / 自托管**：SQLite 单文件存储，跑在你自己的服务器或 NAS（飞牛 / 群晖 / 任意 Docker 主机）上，
  数据不经过任何第三方云。
- **🤖 月度 AI 分析**：每月自动聚合并生成家庭财务分析报告，可推送回微信。
- **📱 响应式后台**：桌面 + 手机端都可用的管理界面。

## 🧱 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 · React Router 7 · Vite · Tailwind CSS |
| 后端 | Fastify 5 · Drizzle ORM · SQLite (better-sqlite3) |
| AI | DeepSeek（文本解析 / 分析）· 阿里云百炼 DashScope（图片识别，可选） |
| 微信网关 | [OpenILink Hub](https://github.com/openilink/openilink-hub) |
| 部署 | Docker / docker-compose |

monorepo（pnpm）结构：`apps/backend`、`apps/frontend`、`packages/shared`。

## 🚀 快速开始

### 本地开发

```bash
pnpm install
cp .env.example .env        # 按需填写，至少改掉 JWT_SECRET / ADMIN_PASSWORD
pnpm dev                    # 前端 :5173（代理 API 到后端 :3000）
```

### Docker 自托管部署

```bash
cp .env.example .env
# 生成强随机密钥与管理员密码
#   JWT_SECRET=$(openssl rand -hex 32)
#   ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | head -c 16)
docker compose up -d --build
```

启动后访问 `http://<服务器IP>:3000`，用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录。
数据库持久化在挂载卷 `./data` 中，重建容器不丢数据。

> ⚠️ **备份提醒**：SQLite 启用了 WAL 模式，请务必把 `caiwu.db`、`caiwu.db-wal`、`caiwu.db-shm`
> 三个文件**一起**备份，只复制主文件会丢失最新数据。

## ⚙️ 配置

运行时配置来自两处：

1. **环境变量**（`.env`，见 [`.env.example`](.env.example)）——端口、数据库路径、JWT 密钥、管理员账号、AI 默认值、Hub 地址。
2. **系统设置表**（SQLite，后台「系统设置」页面）——AI 配置、提示词、月报计划。设置项会覆盖对应的环境变量。

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | **务必改成随机字符串** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 后台管理员账号，**务必修改默认值** |
| `DEEPSEEK_API_KEY` | DeepSeek API Key，用于文本解析与 AI 分析 |
| `DASHSCOPE_API_KEY` | （可选）阿里云百炼，用于图片小票识别 |
| `HUB_URL` / `BASE_URL` | OpenILink Hub 地址与本服务回调地址 |

## 💬 接入微信录入（可选）

1. 部署 [OpenILink Hub](https://github.com/openilink/openilink-hub)（本仓库 `deploy/openilink-hub/` 提供了一份 docker-compose 模板）。
2. 在 Hub 创建机器人应用，拿到 App / Bot / Secret 信息。
3. 把 Webhook 回调设为 `https://<你的域名>/hub/webhook`（微信回调需 HTTPS）。
4. 在后台「系统设置」填入 Hub 地址即可。

之后在微信里直接对机器人说话即可记账，内置 `/help`、`/recent`、`/balance` 命令。

## 🙏 致谢

- **[OpenILink Hub](https://github.com/openilink/openilink-hub)** —— 本项目的微信消息录入能力依赖它作为消息网关，
  在此特别致谢。
- [DeepSeek](https://platform.deepseek.com) 提供语义解析与分析能力。
- 阿里云百炼 DashScope 提供图片识别能力。

## 📄 许可证

[MIT](LICENSE)

---

> 本仓库为开源版本，**不包含任何真实家庭数据、密钥或私有部署信息**。
> 请自行准备 `.env` 与数据库，所有敏感数据保存在你自己的部署环境中。
