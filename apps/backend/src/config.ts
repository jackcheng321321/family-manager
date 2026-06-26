import { dirname, resolve } from "path";

const databasePath = process.env.DATABASE_PATH || "./data/caiwu.db";

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  databasePath,
  // 上传文件（体检 PDF、就诊图片）存放目录，默认放在数据库同级的 data 卷里，
  // 这样和现有 ./data 挂载卷一致，重建容器不丢文件。可用 HEALTH_FILES_DIR 覆盖。
  healthFilesDir:
    process.env.HEALTH_FILES_DIR || resolve(dirname(databasePath), "health"),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  hubUrl: process.env.HUB_URL || "http://localhost:9800",
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseUrl:
      process.env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    vlModel: process.env.DASHSCOPE_VL_MODEL || "qwen3-vl-flash",
  },
};
