// config.js —— 所有配置均在此硬编码，由 install.sh/deploy.sh 直接修改
module.exports = {
    BOT_TOKEN: "YOUR_BOT_TOKEN",
    CHAT_ID: "YOUR_CHAT_ID",
    EXPIRE_DAYS: 30,
    get EXPIRE_MS() { return this.EXPIRE_DAYS * 24 * 60 * 60 * 1000; },
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    RATE_LIMIT_COUNT: 20,
    RATE_LIMIT_BAN_HOURS: 48,
    MONITOR_TOPIC_ID: "YOUR_MONITOR_TOPIC_ID",
    WEBHOOK_SECRET: "YOUR_WEBHOOK_SECRET",
    DOMAIN: "",
    PORT: 3000,
    SESSION_STORAGE_LIMIT: 200 * 1024 * 1024,

    // ===== O Dog Cloud 修改 =====
    // Redis：单独使用一个库（默认第 5 号），不要和 V2Board（0、1 号库）混用
    REDIS_URL: "redis://127.0.0.1:6379/5",

    // 客服窗口显示内容（前端通过 /widget-config 读取）
    BRAND: {
        name: "O Dog Cloud 客服",
        subtitle: "有问题，随时联系我们",
        greetingTitle: "你好，很高兴为你服务",
        greetingText: "留下遇到的问题，我们一起解决。",
        footer: "O Dog Cloud · 每一条消息都认真对待",
        buttonOpen: "联系客服",
        buttonClose: "关闭客服"
    },

    // 工作时间（北京时间）。end 小于 start 表示跨到次日，例如 12:00—次日02:00
    WORK_HOURS: {
        timezone: "Asia/Shanghai",
        start: "12:00",
        end: "02:00",
        label: "北京时间 12:00—次日02:00"
    },

    // 自动回复（客服 30 秒未回复时发送）
    AUTO_REPLY: [
        "您好，当前是留言模式。客服暂时不在线，您的消息已成功传达，上线后会第一时间回复您，请稍候。",
        "如果有任何问题或需求可以先详细描述一下，方便客服上线后快速了解情况，为您高效处理。"
    ]
};
