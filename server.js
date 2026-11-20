// server.js —— 入口文件
const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");
const lib = require("./lib");
const setupRoutes = require("./routes");

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ===== O Dog Cloud 修改：上传文件的安全响应头 =====
// 图片/视频允许在页面内显示；其他文件一律以附件下载，且禁止浏览器猜测类型、禁止执行脚本
const INLINE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".mp4", ".webm", ".ogg", ".mov"]);
app.use("/uploads", (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
    const ext = path.extname(req.path).toLowerCase();
    if (!INLINE_EXT.has(ext)) res.setHeader("Content-Disposition", "attachment");
    next();
});

app.use(express.static("public"));

// ===== O Dog Cloud 修改：客服窗口配置（品牌、工作时间、在线状态） =====
function minutesOf(hhmm) {
    const [h, m] = String(hhmm || "0:0").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
}
function isWorkingNow(wh) {
    if (!wh || !wh.start || !wh.end) return true;
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: wh.timezone || "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date());
    const h = Number(parts.find(p => p.type === "hour").value) % 24;
    const m = Number(parts.find(p => p.type === "minute").value);
    const now = h * 60 + m, s = minutesOf(wh.start), e = minutesOf(wh.end);
    return s <= e ? (now >= s && now < e) : (now >= s || now < e); // 跨天
}
app.get("/widget-config", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
        brand: config.BRAND || {},
        hours: (config.WORK_HOURS && config.WORK_HOURS.label) || "",
        online: isWorkingNow(config.WORK_HOURS)
    });
});

// 连接 Redis 并启动
(async () => {
    try {
        await lib.connectRedis();
    } catch (e) {
        console.error("Redis 启动失败:", e);
        process.exit(1);
    }

    // 挂载路由
    setupRoutes(app, lib, config);

    // 定时清理过期会话（每12小时）
    setInterval(() => lib.cleanupInactiveUsers(lib.redisClient), 12 * 60 * 60 * 1000);
    lib.cleanupInactiveUsers(lib.redisClient);  // 启动时执行一次

    app.listen(config.PORT, "127.0.0.1", () => {
        console.log(`server running on 127.0.0.1:${config.PORT}`);
    });
})();
