(function () {
    // =========================
    // 1. 初始化 & 配置
    // =========================
    const script = document.querySelector("script[data-chat-widget]");
    if (!script) return;
    const API = new URL(script.src).origin;

    // =========================
    // 2. 全局状态管理
    // =========================
     function getCookie(name) {
     const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
     return match ? decodeURIComponent(match[2]) : null;
    }
    let sid = getCookie("cw_sid") || localStorage.getItem("cw_sid");
    let token = getCookie("cw_token") || localStorage.getItem("cw_token");
    if (sid && !localStorage.getItem("cw_sid")) localStorage.setItem("cw_sid", sid);
    if (token && !localStorage.getItem("cw_token")) localStorage.setItem("cw_token", token);
    let lastTime = 0;
    let open = false;

    // ★★★ 新增：消息状态映射表 ★★★
    const msgStatusMap = new Map(); // key: clientMsgId, value: { status, timer, element, msgData }

    // 去重池（最多 500 条 ID）
    const MAX_SEEN = 500;
    const seen = new Set();
    function addSeen(id) {
        if (seen.size >= MAX_SEEN) {
            const arr = Array.from(seen).slice(-250);
            seen.clear();
            arr.forEach(v => seen.add(v));
        }
        seen.add(id);
    }
    function hasSeen(id) { return seen.has(id); }

    // 文件上传状态
    let uploadingFile = null;
    let isUploading = false;

    // 历史加载状态
    let loadingMore = false;
    let hasMoreHistory = true;
    let oldestTime = null;

    // 轮询退避参数
    const POLL_FAST = 1000;          // 快速期 1 秒
    const POLL_MEDIUM = 2000;        // 中速期 2 秒
    const FAST_DURATION = 30000;     // 快速期持续时间
    const MEDIUM_DURATION = 30000;   // 中速期持续时间
    const BACKOFF_INIT = 2000;       // 退避起始间隔
    const BACKOFF_INCREMENT = 500;   // 每次增加 0.5 秒
    const BACKOFF_MAX = 15000;       // 退避上限 15 秒
    let lastMessageTime = Date.now();
    let backoffInterval = BACKOFF_INIT;
    let pollTimer = null;

    // =========================
    // 3. DOM 构建（Shadow DOM）
    // =========================
    const host = document.createElement("div");
    host.id = "cw-root";
    host.style.position = "fixed";
    host.style.zIndex = "999999";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
    <style>
        * { box-sizing: border-box; }
        :host {
            --accent: #7851da; --soft: #f6f2ff; --message: #7953d9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        }
        button { font-family: inherit; cursor: pointer; }

        /* 悬浮按钮 */
        .cw-btn {
            position: fixed; right: 24px; bottom: max(22px, env(safe-area-inset-bottom)); z-index: 2147483000;
            display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 50px; padding: 12px 20px;
            border: 0; border-radius: 28px; background: #7851da; color: #fff; font-size: 14px; font-weight: 400;
            box-shadow: 0 6px 22px rgba(85, 52, 160, .22); user-select: none; transition: filter .15s, transform .15s;
        }
        .cw-btn:hover { filter: brightness(.96); transform: translateY(-1px); }
        .cw-btn .cw-spark { font-size: 21px; line-height: 1; }

        /* 面板 */
        .cw-panel {
            position: fixed; right: 24px; bottom: 86px; z-index: 2147483001;
            width: min(400px, calc(100vw - 32px)); height: min(700px, calc(100dvh - 110px));
            border-radius: 22px; background: #fff; box-shadow: 0 16px 64px #3420502b;
            display: none; color: #28243a; font-size: 14px;
        }
        .cw-chat {
            position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden;
            border: 1px solid #e9e5ef; border-radius: 22px; background: #fff; box-shadow: 0 16px 38px rgba(52, 32, 80, .043);
        }

        /* 头部 */
        .cw-header { display: flex; align-items: center; gap: 10px; padding: 20px 17px 18px; border-bottom: 1px solid #f0edf6; flex-shrink: 0; }
        .cw-logo {
            display: grid; place-items: center; width: 40px; height: 40px; border-radius: 13px; flex: none;
            background: linear-gradient(135deg, #9465ff, #7055e6); color: #fff; font-size: 23px; box-shadow: 0 5px 12px #8358e327;
        }
        .cw-title { flex: 1; min-width: 0; }
        .cw-name { font-size: 16px; font-weight: 650; margin: 0 0 4px; color: #28243a; line-height: 24px; height: 24px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cw-status {
            display: inline-flex; vertical-align: middle; align-items: center; gap: 4px; margin-left: 5px; padding: 2px 7px;
            border-radius: 12px; font-size: 11px; font-weight: 500; line-height: 16px; color: #667085; background: #f2f4f7; border: 1px solid #e4e7ec;
        }
        .cw-status::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
        .cw-status.online { color: #07805c; background: #ecfdf3; border-color: #abefc6; }
        .cw-sub { font-size: 12px; color: #7b7087; margin: 0; }
        .cw-icon-btn {
            width: 24px; height: 34px; padding: 2px; border: 0; background: transparent; color: #9b90a8;
            display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; flex: none;
        }
        .cw-icon-btn svg { width: 20px; height: 20px; display: block; }
        .cw-icon-btn:hover { color: var(--accent); }

        /* 工作时间条 */
        .cw-hours {
            display: flex; align-items: center; gap: 6px; margin: 0; padding: 10px 18px; font-size: 11px; line-height: 1.6;
            color: #755893; background: #fbf9fe; flex: none;
        }
        .cw-hours .cw-clock { font-size: 16px; line-height: 1; }
        .cw-hours strong { font-weight: 500; font-size: 11px; color: #755893; }
        .cw-hours-tail { margin-left: auto; white-space: nowrap; }

        /* 消息区 */
        .cw-msgs {
            padding: 22px 18px 14px; overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column;
            scrollbar-width: thin; scrollbar-color: #eee7f5 transparent; overscroll-behavior: contain;
        }
        .cw-empty { text-align: center; padding: 4px 0 24px; flex: none; order: -1; }
        .cw-empty.hide { display: none; }
        .cw-empty-title { font-size: 13px; font-weight: 550; color: #675975; margin: 0 0 7px; }
        .cw-empty-text { font-size: 12px; color: #7b7087; margin: 0; line-height: 1.6; }

        .cw-msg-row { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 18px; gap: 6px; }
        .cw-msg-row.user { align-items: flex-end; }
        .cw-avatar {
            width: 17px; height: 17px; border-radius: 6px; background: #eee6fb; display: grid; place-items: center;
            color: var(--accent); font-size: 0; flex: none;
        }
        .cw-avatar.agent::after { content: "✦"; font-size: 11px; }
        .cw-avatar.user { display: none; }
        .cw-bubble {
            max-width: 93%; padding: 11px 13px; background: #f4f2f7; color: #51475f; border-radius: 4px 15px 15px 15px;
            font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap;
        }
        .cw-bubble.user { background: var(--message); color: #fff; border-radius: 15px 4px 15px 15px; }
        .cw-bubble.agent { background: #f4f2f7; color: #51475f; }

        .cw-file-msg { width: 220px; max-width: 88%; }
        .cw-file-card { padding: 5px; background: #f4f2f7; border-radius: 15px; overflow: hidden; }
        .cw-msg-row.user .cw-file-card { background: var(--message); }
        .cw-file-image { display: block; width: 100%; max-height: 220px; object-fit: contain; border-radius: 10px; cursor: zoom-in; min-width: 80px; }
        .cw-file-video { display: block; width: 100%; max-height: 220px; border-radius: 10px; }
        .cw-file-doc { display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; background: #fff; border-radius: 10px; }
        .cw-file-doc-icon { font-size: 28px; }
        .cw-file-doc-info { flex: 1; min-width: 0; }
        .cw-file-doc-name { font-size: 12px; font-weight: 500; color: #51475f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cw-file-doc-size { font-size: 11px; color: #887a95; margin-top: 2px; }
        .cw-file-doc-action { color: var(--accent); font-size: 11px; }

        .cw-load-more { width: 100%; text-align: center; padding: 0 0 10px; flex-shrink: 0; order: -2; }
        .cw-load-more button { background: var(--soft); border: 0; border-radius: 10px; padding: 5px 14px; font-size: 11px; color: var(--accent); }
        .cw-load-more button:disabled { opacity: .5; cursor: default; }

        /* 输入区 */
        .cw-input-area { position: relative; flex: none; }
        .cw-composer {
            margin: 0 14px; padding: 11px 10px 8px; border: 1px solid #e8e0f2; border-radius: 14px; background: #fff;
            box-shadow: 0 3px 12px #744c8d04;
        }
        .cw-composer textarea {
            display: block; width: 100%; height: 36px; border: 0; outline: none; resize: none; background: transparent;
            color: #4d405c; font-size: 13px; padding: 2px 3px; font-family: inherit; line-height: 1.5; margin: 0 0 2px;
        }
        .cw-composer textarea::placeholder { color: #afa4ba; }
        .cw-composer textarea:disabled { opacity: .5; }
        .cw-tools { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .cw-tools > div { display: flex; align-items: center; min-width: 0; gap: 5px; }
        .cw-attach-btn {
            width: 30px; height: 34px; border: 0; background: transparent; color: #9b90a8; display: inline-flex;
            align-items: center; justify-content: center; border-radius: 8px; padding: 5px; flex: none;
        }
        .cw-attach-btn svg { width: 20px; height: 20px; display: block; }
        .cw-attach-btn:hover { color: var(--accent); }
        .cw-hint { font-size: 10px; color: #b2a6ba; white-space: nowrap; }
        .cw-send-btn {
            border: 0; display: flex; gap: 6px; align-items: center; justify-content: center; padding: 8px 11px;
            border-radius: 10px; background: var(--accent); color: #fff; font-size: 11px; flex: none; min-width: 66px;
        }
        .cw-send-btn:hover { filter: brightness(.95); }
        .cw-send-btn svg { width: 16px; height: 16px; }
        .cw-send-btn:disabled { opacity: .45; cursor: not-allowed; }
        .cw-footer { text-align: center; font-size: 10px; color: #91839f; padding: 12px 8px 15px; flex: none; }

        .cw-file-preview { display: none; margin: 0 14px 8px; padding: 6px 10px; background: var(--soft); border-radius: 10px; align-items: center; gap: 6px; font-size: 12px; color: #51475f; }
        .cw-file-preview.show { display: flex; }
        .cw-file-preview-remove { color: #9b90a8; background: none; border: none; margin-left: auto; }

        .cw-upload-progress { position: absolute; bottom: 0; left: 14px; right: 14px; height: 3px; border-radius: 2px; background: var(--accent); display: none; }
        .cw-upload-progress.show { display: block; }
        .cw-drop-overlay {
            display: none; position: absolute; inset: 0; background: rgba(60, 36, 120, .86); z-index: 10; border-radius: inherit;
            align-items: center; justify-content: center; flex-direction: column; gap: 12px; color: #fff; font-size: 14px;
        }
        .cw-drop-overlay.show { display: flex; }
        .cw-uploading-overlay { display: none; position: absolute; inset: 0; background: rgba(255,255,255,.7); z-index: 11; align-items: center; justify-content: center; }
        .cw-uploading-overlay.show { display: flex; }
        .cw-spinner { width: 30px; height: 30px; border: 3px solid #eee6fb; border-top-color: var(--accent); border-radius: 50%; animation: cw-spin 1s linear infinite; }
        @keyframes cw-spin { to { transform: rotate(360deg); } }
        .cw-error-toast {
            position: fixed; top: 20px; right: 20px; background: #b25739; color: #fff; padding: 10px 16px;
            border-radius: 10px; font-size: 13px; z-index: 2147483002; box-shadow: 0 4px 12px rgba(0,0,0,.2);
        }

        /* 手机：按钮靠边，面板全屏 */
        @media (max-width: 600px) {
            .cw-btn { right: 16px; bottom: max(16px, env(safe-area-inset-bottom)); }
            .cw-panel { inset: 0; width: 100%; height: 100%; height: 100dvh; border-radius: 0; }
            .cw-chat { border-radius: 0; border: 0; padding-top: env(safe-area-inset-top); }
            .cw-header { padding-left: 15px; padding-right: 15px; }
            .cw-footer { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
        }
        @media (prefers-reduced-motion: reduce) { .cw-btn { transition: none; } }
    </style>

    <button class="cw-btn" type="button"><span class="cw-spark" aria-hidden="true">✦</span><span class="cw-btn-text">在线客服</span></button>
    <div class="cw-panel" role="dialog" aria-label="在线客服">
        <div class="cw-chat">
            <div class="cw-header">
                <div class="cw-logo">✦</div>
                <div class="cw-title">
                    <div class="cw-name"><span class="cw-name-text">在线客服</span><span class="cw-status">离线</span></div>
                    <p class="cw-sub"></p>
                </div>
                <button class="cw-icon-btn cw-info" type="button" title="">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>
                </button>
                <button class="cw-icon-btn cw-close" type="button" title="收起">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 5 5-5"/></svg>
                </button>
            </div>
            <div class="cw-hours"><span class="cw-clock">◷</span><span class="cw-hours-pre"></span><strong class="cw-hours-text"></strong><span class="cw-hours-tail">人工客服</span></div>
            <div class="cw-msgs">
                <div class="cw-load-more">
                    <button class="cw-load-more-btn" type="button">加载更早消息</button>
                </div>
                <div class="cw-empty"><div class="cw-empty-title"></div><div class="cw-empty-text"></div></div>
            </div>
            <div class="cw-input-area">
                <div class="cw-file-preview">
                    <span class="cw-file-preview-icon">📎</span>
                    <div class="cw-file-preview-info">
                        <div class="cw-file-preview-name"></div>
                        <div class="cw-file-preview-size"></div>
                    </div>
                    <button class="cw-file-preview-remove" type="button">✕</button>
                </div>
                <div class="cw-composer">
                    <textarea class="cw-textarea" rows="2" placeholder="输入消息..."></textarea>
                    <div class="cw-tools">
                        <div>
                            <button class="cw-attach-btn" type="button" title="发送图片或文件">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="M20.5 15.5l-4.5-4.5-9.5 9.5"/></svg>
                            </button>
                            <span class="cw-hint">支持文字和图片</span>
                        </div>
                        <button class="cw-send-btn" type="button"><span>发送</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7z"/></svg>
                        </button>
                    </div>
                </div>
                <div class="cw-upload-progress"></div>
            </div>
            <div class="cw-footer"></div>
            <div class="cw-drop-overlay">
                <span class="cw-drop-overlay-icon">📤</span><span>释放文件以上传</span>
            </div>
            <div class="cw-uploading-overlay"><div class="cw-spinner"></div></div>
        </div>
        <input type="file" style="display: none;" accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.webm,.ogg,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z" />
    </div>
    `;

    // =========================
    // 4. DOM 引用获取
    // =========================
    const btn = shadow.querySelector(".cw-btn");
    const panel = shadow.querySelector(".cw-panel");
    const msgsContainer = shadow.querySelector(".cw-msgs");
    const loadMoreBtn = shadow.querySelector(".cw-load-more-btn");
    const input = shadow.querySelector(".cw-textarea");
    const sendBtn = shadow.querySelector(".cw-send-btn");
    const attachBtn = shadow.querySelector(".cw-attach-btn");
    const fileInput = shadow.querySelector("input[type='file']");
    const filePreview = shadow.querySelector(".cw-file-preview");
    const filePreviewName = shadow.querySelector(".cw-file-preview-name");
    const filePreviewSize = shadow.querySelector(".cw-file-preview-size");
    const filePreviewRemove = shadow.querySelector(".cw-file-preview-remove");
    const uploadProgress = shadow.querySelector(".cw-upload-progress");
    const dropOverlay = shadow.querySelector(".cw-drop-overlay");
    const uploadingOverlay = shadow.querySelector(".cw-uploading-overlay");
    // O Dog Cloud 修改：新界面元素
    const btnText = shadow.querySelector(".cw-btn-text");
    const emptyState = shadow.querySelector(".cw-empty");
    let BRAND = { buttonOpen: "在线客服", buttonClose: "关闭客服" };

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // 有消息时隐藏欢迎语
    function updateEmptyState() {
        emptyState.classList.toggle("hide", !!msgsContainer.querySelector(".cw-msg-row"));
    }
    new MutationObserver(updateEmptyState).observe(msgsContainer, { childList: true });

    // 读取品牌、工作时间、在线状态
    async function loadWidgetConfig() {
        try {
            const r = await fetch(API + "/widget-config", { cache: "no-store" });
            const c = await r.json();
            BRAND = Object.assign(BRAND, c.brand || {});
            shadow.querySelector(".cw-name-text").textContent = BRAND.name || "在线客服";
            shadow.querySelector(".cw-sub").textContent = BRAND.subtitle || "";
            shadow.querySelector(".cw-empty-title").textContent = BRAND.greetingTitle || "";
            shadow.querySelector(".cw-empty-text").textContent = BRAND.greetingText || "";
            shadow.querySelector(".cw-footer").textContent = BRAND.footer || "";
            const hrs = String(c.hours || "");
            const sp = hrs.indexOf(" ");
            shadow.querySelector(".cw-hours-pre").textContent = sp > 0 ? hrs.slice(0, sp) : "";
            shadow.querySelector(".cw-hours-text").textContent = sp > 0 ? hrs.slice(sp + 1) : hrs;
            shadow.querySelector(".cw-info").title = c.hours ? ("工作时间：" + c.hours) : "";
            const st = shadow.querySelector(".cw-status");
            st.textContent = c.online ? "在线" : "离线";
            st.classList.toggle("online", !!c.online);
            btnText.textContent = open ? BRAND.buttonClose : BRAND.buttonOpen;
        } catch (e) { /* 保持默认文字 */ }
    }

    // =========================
    // 5. 工具函数
    // =========================
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
    function getFileCategory(mimeType) {
        if (!mimeType) return "document";
        if (mimeType.startsWith("image/")) return "image";
        if (mimeType.startsWith("video/")) return "video";
        return "document";
    }
    function showErrorToast(message) {
        const toast = document.createElement("div");
        toast.className = "cw-error-toast";
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    function isMobileDevice() {
        return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
               (navigator.maxTouchPoints > 1 && window.innerWidth < 768);
    }

    // =========================
    // 6. 消息渲染模块
    // =========================
    function addMessage(m, prepend = false) {
        const key = m.clientMsgId || m.id;
        if (!key) { console.warn('消息缺少id，无法去重', m); return; }
        if (hasSeen(key)) return;
        addSeen(key);

        const isUser = m.role === "user";
        const row = document.createElement("div");
        row.className = "cw-msg-row " + (isUser ? "user" : "agent");
        // ★ 设置 data-msg-id
        row.dataset.msgId = key;

        const avatar = document.createElement("div");
        avatar.className = "cw-avatar " + (isUser ? "user" : "agent");
        avatar.innerText = isUser ? "你" : "客服";
        row.appendChild(avatar);

        const hasFile = m.type && m.type !== "text";
        const hasText = m.text && m.text.trim();

        if (hasFile) {
            const fileWrapper = document.createElement("div");
            fileWrapper.className = "cw-file-msg";
            const fileCard = document.createElement("div");
            fileCard.className = "cw-file-card";

            const category = m.type || getFileCategory(m.mimeType);
            const fileUrl = m.fileUrl || m.url || "";

            if (category === "image" && fileUrl) {
                const img = document.createElement("img");
                img.className = "cw-file-image";
                img.src = fileUrl;
                img.alt = m.fileName || "图片";
                img.onclick = () => window.open(fileUrl, "_blank");
                fileCard.appendChild(img);
            } else if (category === "video" && fileUrl) {
                const video = document.createElement("video");
                video.className = "cw-file-video";
                video.src = fileUrl;
                video.controls = true;
                video.preload = "metadata";
                fileCard.appendChild(video);
            } else if (fileUrl) {
                const docBtn = document.createElement("div");
                docBtn.className = "cw-file-doc";
                docBtn.onclick = () => window.open(fileUrl, "_blank");
                const ext = (m.fileName || "").split(".").pop()?.toLowerCase();
                const iconMap = {jpg:"🖼️",jpeg:"🖼️",png:"🖼️",gif:"🖼️",webp:"🖼️",bmp:"🖼️",svg:"🖼️",mp4:"🎬",webm:"🎬",ogg:"🎬",mov:"🎬",pdf:"📕",doc:"📘",docx:"📘",xls:"📗",xlsx:"📗",ppt:"📙",pptx:"📙",txt:"📄",csv:"📊",zip:"📦",rar:"📦","7z":"📦"};
                const icon = iconMap[ext] || "📄";
                // O Dog Cloud 修改：文件名转义，防止 XSS
                docBtn.innerHTML = `<span class="cw-file-doc-icon">${icon}</span><div class="cw-file-doc-info"><div class="cw-file-doc-name">${escapeHtml(m.fileName||"文件")}</div><div class="cw-file-doc-size">${m.fileSize?formatFileSize(m.fileSize):""}</div></div><span class="cw-file-doc-action">查看</span>`;
                fileCard.appendChild(docBtn);
            }
            fileWrapper.appendChild(fileCard);
            row.appendChild(fileWrapper);
            if (hasText) {
                const textBubble = document.createElement("div");
                textBubble.className = "cw-bubble " + (isUser?"user":"agent");
                textBubble.style.marginTop = "4px";
                textBubble.innerText = m.text;
                row.appendChild(textBubble);
            }
        } else if (m.type === "sticker" && (m.fileUrl || m.url)) {
            const img = document.createElement("img");
            img.src = m.fileUrl || m.url;
            img.style.maxWidth = "120px";
            img.style.maxHeight = "120px";
            if (m.emoji) img.alt = m.emoji;
            row.appendChild(img);
        } else if (m.type === "voice" && (m.fileUrl || m.url)) {
            const audio = document.createElement("audio");
            audio.src = m.fileUrl || m.url;
            audio.controls = true;
            audio.style.maxWidth = "200px";
            row.appendChild(audio);
        } else {
            const bubble = document.createElement("div");
            bubble.className = "cw-bubble " + (isUser?"user":"agent");
            bubble.innerText = m.text || "";
            row.appendChild(bubble);
        }

        // ★ 如果消息是用户消息且有 clientMsgId，检查是否需要显示重发按钮
        if (isUser && m.clientMsgId) {
            const entry = msgStatusMap.get(m.clientMsgId);
            if (entry) {
                entry.element = row;
                if (entry.status === 'failed') {
                    showRetryButton(m.clientMsgId);
                }
            }
        }

        if (prepend) {
            msgsContainer.insertBefore(row, msgsContainer.children[1]);
        } else {
            msgsContainer.appendChild(row);
            row.scrollIntoView({ block: 'end', behavior: 'instant' });
        }
    }

    // =========================
    // 7. 历史加载模块
    // =========================
    async function loadHistory(params = {}) {
        if (!sid || !token) {
            console.warn('[CW] loadHistory: 缺少 sid 或 token');
            return;
        }

        try {
            loadingMore = true;
            loadMoreBtn.disabled = true;

            const url = new URL(`${API}/history`);
            url.searchParams.set("sid", sid);
            url.searchParams.set("token", token);
            url.searchParams.set("limit", 50);
            if (params.after !== undefined) url.searchParams.set("after", params.after);
            if (params.before) url.searchParams.set("before", params.before);

            const r = await fetch(url.toString());
            if (r.status === 403) {
                console.warn('[CW] Token 无效，尝试重新初始化会话...');
                await initSession();
                if (sid && token) {
                    return loadHistory(params);
                } else {
                    return;
                }
            }
            if (!r.ok) {
                throw new Error(`HTTP ${r.status}`);
            }
            const json = await r.json();

            const list = json.data || [];
            list.reverse();

            if (list.length > 0) {
                if (params.before) {
                    oldestTime = list[0].time;
                    hasMoreHistory = json.hasMore !== false;
                } else {
                    oldestTime = list[0].time;
                    hasMoreHistory = json.hasMore !== false;
                }

                list.forEach(m => {
                    // 更新状态
                    if (m.role === 'user' && m.clientMsgId) {
                        const entry = msgStatusMap.get(m.clientMsgId);
                        if (entry) {
                            const newStatus = m.tgStatus;
                            if (newStatus && newStatus !== entry.status) {
                                entry.status = newStatus;
                                if (newStatus === 'sent') {
                                    clearTimeout(entry.timer);
                                    const btn = entry.element?.querySelector('.cw-retry-btn');
                                    if (btn) btn.remove();
                                } else if (newStatus === 'failed') {
                                    clearTimeout(entry.timer);
                                    showRetryButton(m.clientMsgId);
                                }
                            }
                        } else {
                            // 可能是历史消息，如果状态为failed，在addMessage中处理
                        }
                    }
                    addMessage(m, !!params.before);
                    lastTime = Math.max(lastTime, m.time || 0);
                });

                if (!params.before && open) {
                    const last = msgsContainer.lastElementChild;
                    if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
                }
            } else {
                hasMoreHistory = false;
            }

            loadMoreBtn.parentElement.style.display = hasMoreHistory ? "block" : "none";
        } catch (e) {
            console.error('[CW] loadHistory 失败:', e);
        } finally {
            loadingMore = false;
            loadMoreBtn.disabled = false;
        }
    }

    // =========================
    // 8. 消息发送模块
    // =========================
    function clearFileSelection() {
        uploadingFile = null;
        filePreview.classList.remove("show");
        filePreviewName.textContent = filePreviewSize.textContent = "";
        input.placeholder = "输入消息...";
    }

    // ★ 显示重发按钮
    function showRetryButton(clientMsgId) {
        const entry = msgStatusMap.get(clientMsgId);
        if (!entry) return;
        const element = entry.element;
        if (!element) return;
        if (element.querySelector('.cw-retry-btn')) return;

        const btn = document.createElement('span');
        btn.className = 'cw-retry-btn';
        btn.textContent = '⟳';
        btn.style.cssText = 'color: red; cursor: pointer; margin-left: 12px; font-weight: bold; font-size: 22px; align-self: center;';
        btn.title = '点击重发';
        btn.onclick = () => retrySend(clientMsgId);
        element.appendChild(btn);
    }

    // ★ 重发逻辑
    async function retrySend(clientMsgId) {
        const entry = msgStatusMap.get(clientMsgId);
        if (!entry) return;
        const { msgData } = entry;
        if (!msgData) {
            showErrorToast('消息数据丢失，无法重发');
            return;
        }

        // 隐藏重发按钮
        const btn = entry.element?.querySelector('.cw-retry-btn');
        if (btn) btn.remove();

        entry.status = 'pending';
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
            const e = msgStatusMap.get(clientMsgId);
            if (e && e.status !== 'sent') {
                showRetryButton(clientMsgId);
            }
        }, 10000);

        try {
            const formData = new FormData();
            formData.append('sid', sid);
            formData.append('token', token);
            formData.append('clientMsgId', clientMsgId);
            if (msgData.text) formData.append('msg', msgData.text);
            if (msgData.file) formData.append('file', msgData.file);

            const response = await fetch(API + '/send', {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                // 请求成功，乐观更新状态为 sent，立即移除按钮并清除定时器
                entry.status = 'sent';
                clearTimeout(entry.timer);
                const btn2 = entry.element?.querySelector('.cw-retry-btn');
                if (btn2) btn2.remove();
        } else {
            throw new Error('重发请求失败');
        }
        } catch (e) {
            console.error('重发失败', e);
            showRetryButton(clientMsgId);
            showErrorToast('重发失败，请稍后重试');
        }
    }

    async function send() {
        const msg = input.value.trim();
        if (isUploading) return;
        if (!msg && !uploadingFile) return;

        isUploading = true;
        sendBtn.disabled = true;
        input.disabled = true;
        attachBtn.disabled = true;
        uploadingOverlay.classList.add("show");

        // ★ 生成 clientMsgId
        const clientMsgId = crypto.randomUUID();
        const now = Date.now();

        try {
            let localMsg = {
                clientMsgId: clientMsgId,
                role: "user",
                time: now,
            };

            if (uploadingFile) {
                const formData = new FormData();
                formData.append("sid", sid);
                formData.append("token", token);
                formData.append("file", uploadingFile);
                if (msg) formData.append("msg", msg);
                formData.append("clientMsgId", clientMsgId);

                const response = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.upload.addEventListener("progress", (e) => {
                        if (e.lengthComputable) {
                            const percent = (e.loaded / e.total) * 100;
                            uploadProgress.style.width = percent + "%";
                            uploadProgress.classList.add("show");
                        }
                    });
                    xhr.addEventListener("load", () => {
                        try { resolve(JSON.parse(xhr.responseText)); } catch(e) { reject(new Error("解析失败")); }
                    });
                    xhr.addEventListener("error", () => reject(new Error("上传失败")));
                    xhr.open("POST", API + "/send");
                    xhr.send(formData);
                });

                localMsg.type = getFileCategory(uploadingFile.type);
                localMsg.fileName = uploadingFile.name;
                localMsg.fileSize = uploadingFile.size;
                localMsg.mimeType = uploadingFile.type;
                localMsg.fileUrl = response.msgData?.fileUrl;
                if (msg) localMsg.text = msg;
                localMsg.id = response.msgId || clientMsgId;
            } else {
                localMsg.type = "text";
                localMsg.text = msg;
                localMsg.id = clientMsgId;

                await fetch(API + "/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sid, token, msg, clientMsgId })
                });
            }

            addMessage(localMsg);

            // ★ 记录状态
            const msgElement = msgsContainer.querySelector(`[data-msg-id="${clientMsgId}"]`);
            const entry = {
                status: 'pending',
                timer: setTimeout(() => {
                    const e = msgStatusMap.get(clientMsgId);
                    if (e && e.status !== 'sent') {
                        showRetryButton(clientMsgId);
                    }
                }, 10000),
                element: msgElement,
                msgData: { text: msg, file: uploadingFile }
            };
            msgStatusMap.set(clientMsgId, entry);

            clearFileSelection();
            input.value = "";
            setTimeout(() => {
                uploadProgress.classList.remove("show");
                uploadProgress.style.width = "0%";
            }, 500);
        } catch (e) {
            showErrorToast(e.message || "发送失败");
            const entry = msgStatusMap.get(clientMsgId);
            if (entry) {
                entry.status = 'failed';
                clearTimeout(entry.timer);
                showRetryButton(clientMsgId);
            }
        } finally {
            isUploading = false;
            sendBtn.disabled = false;
            input.disabled = false;
            attachBtn.disabled = false;
            uploadingOverlay.classList.remove("show");
            input.focus();

            lastMessageTime = Date.now();
            backoffInterval = BACKOFF_INIT;
            clearTimeout(pollTimer);
            pollTimer = setTimeout(poll, POLL_FAST);
        }
    }

    sendBtn.onclick = send;
    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });

    // =========================
    // 9. 文件上传处理模块
    // =========================
    attachBtn.onclick = () => { if (!isUploading) fileInput.click(); };
    fileInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 50 * 1024 * 1024) { showErrorToast("文件大小不能超过50MB"); return; }
            uploadingFile = file;
            filePreviewName.textContent = file.name;
            filePreviewSize.textContent = formatFileSize(file.size);
            filePreview.classList.add("show");
            input.placeholder = "添加说明文字（可选）...";
        }
        fileInput.value = "";
    });
    filePreviewRemove.onclick = clearFileSelection;

    let dragCounter = 0;
    let hideDropTimeout = null;
    panel.addEventListener("dragenter", e => {
        e.preventDefault(); e.stopPropagation();
        if (hideDropTimeout) { clearTimeout(hideDropTimeout); hideDropTimeout = null; }
        dragCounter++;
        if (!isUploading) dropOverlay.classList.add("show");
    });
    panel.addEventListener("dragleave", e => {
        e.preventDefault(); e.stopPropagation();
        dragCounter--;
        if (dragCounter === 0 && !isUploading) {
            hideDropTimeout = setTimeout(() => dropOverlay.classList.remove("show"), 100);
        }
    });
    panel.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); });
    panel.addEventListener("drop", e => {
        e.preventDefault(); e.stopPropagation();
        dragCounter = 0;
        dropOverlay.classList.remove("show");
        if (hideDropTimeout) { clearTimeout(hideDropTimeout); hideDropTimeout = null; }
        if (isUploading) { showErrorToast("正在上传中，请等待完成"); return; }
        const files = e.dataTransfer.files;
        if (files.length === 0) return;
        if (files.length > 1) { showErrorToast("一次只能上传一个文件"); return; }
        const file = files[0];
        if (file.size > 50 * 1024 * 1024) { showErrorToast("文件大小不能超过50MB"); return; }
        uploadingFile = file;
        filePreviewName.textContent = file.name;
        filePreviewSize.textContent = formatFileSize(file.size);
        filePreview.classList.add("show");
        input.placeholder = "添加说明文字（可选）...";
    });

    // =========================
    // 10. 轮询模块（退避策略）
    // =========================
    const poll = async () => {
        if (!sid || !token) return;

        try {
            const url = new URL(`${API}/history`);
            url.searchParams.set("sid", sid);
            url.searchParams.set("token", token);
            url.searchParams.set("after", lastTime);
            url.searchParams.set("limit", 20);
            const r = await fetch(url.toString());
            const json = await r.json();
            const list = json.data || [];
            list.reverse();

            let newMsgs = 0;
            list.forEach(m => {
                // 处理用户消息状态
                if (m.role === 'user' && m.clientMsgId) {
                    const entry = msgStatusMap.get(m.clientMsgId);
                    if (entry) {
                        const newStatus = m.tgStatus;
                        if (newStatus && newStatus !== entry.status) {
                            entry.status = newStatus;
                            if (newStatus === 'sent') {
                                clearTimeout(entry.timer);
                                const btn = entry.element?.querySelector('.cw-retry-btn');
                                if (btn) btn.remove();
                            } else if (newStatus === 'failed') {
                                clearTimeout(entry.timer);
                                showRetryButton(m.clientMsgId);
                            }
                        }
                    } else {
                        // 历史消息，如果失败则处理
                        if (m.tgStatus === 'failed') {
                            const existingRow = msgsContainer.querySelector(`[data-msg-id="${m.clientMsgId}"]`);
                            if (existingRow) {
                                const entry = {
                                    status: 'failed',
                                    timer: null,
                                    element: existingRow,
                                    msgData: { text: m.text }
                                };
                                msgStatusMap.set(m.clientMsgId, entry);
                                showRetryButton(m.clientMsgId);
                            } else {
                                // 尚未渲染，addMessage会处理
                            }
                        }
                    }
                }

                // 只添加客服消息（用户已乐观添加）
                if (m.role === 'agent') {
                    addMessage(m);
                    lastTime = Math.max(lastTime, m.time || 0);
                    newMsgs++;
                } else {
                    lastTime = Math.max(lastTime, m.time || 0);
                }
            });

            if (newMsgs > 0) {
                lastMessageTime = Date.now();
                backoffInterval = BACKOFF_INIT;
            }
        } catch (e) { /* 静默 */ }

        const now = Date.now();
        const idle = now - lastMessageTime;
        let nextInterval;

        if (idle < FAST_DURATION) {
            nextInterval = POLL_FAST;
            backoffInterval = BACKOFF_INIT;
        } else if (idle < FAST_DURATION + MEDIUM_DURATION) {
            nextInterval = POLL_MEDIUM;
            backoffInterval = BACKOFF_INIT;
        } else {
            nextInterval = backoffInterval;
            backoffInterval = Math.min(backoffInterval + BACKOFF_INCREMENT, BACKOFF_MAX);
        }

        pollTimer = setTimeout(poll, nextInterval);
    };

    function startPolling() {
        clearTimeout(pollTimer);
        poll();
    }

    function stopPolling() {
        clearTimeout(pollTimer);
        pollTimer = null;
    }

    // =========================
    // 11. 会话初始化
    // =========================
    async function initSession() {
        try {
            const savedSid = localStorage.getItem("cw_sid");
            let url = API + "/init";
            if (savedSid) {
                url += "?sid=" + encodeURIComponent(savedSid);
            }

            const r = await fetch(url);
            const d = await r.json();

            sid = d.sid;
            token = d.token;
            localStorage.setItem("cw_sid", sid);
            localStorage.setItem("cw_token", token);
            document.cookie = `cw_sid=${sid}; path=/; max-age=${15552000}; SameSite=Lax; secure`;
        } catch (e) {
            console.error('[CW] initSession 失败:', e);
            showErrorToast("连接失败，请刷新页面");
        }
    }

    // =========================
    // 12. UI 交互逻辑
    // =========================
    // O Dog Cloud 修改：胶囊按钮常驻，点击切换「联系客服 / 关闭客服」
    function scheduleShrink() { /* 新界面不再收缩按钮 */ }

    function setOpen(next) {
        open = next;
        panel.style.display = open ? "flex" : "none";
        btnText.textContent = open ? BRAND.buttonClose : BRAND.buttonOpen;
        if (open) {
            loadWidgetConfig();
            input.focus();
            const last = msgsContainer.lastElementChild;
            if (last) last.scrollIntoView({ block: "end", behavior: "instant" });
            if (sid && token && !pollTimer) startPolling();
        } else {
            stopPolling();
        }
    }

    btn.onclick = () => {
        setOpen(!open);
    };

    shadow.querySelector(".cw-close").onclick = (e) => {
        e.stopPropagation();
        setOpen(false);
    };

    // =========================
    // 14. 启动流程
    // =========================
    (async () => {
        loadWidgetConfig();
        await initSession();

        if (sid && token) {
            await loadHistory({ after: 0 });
            startPolling();
        }
        scheduleShrink();
    })();
})();
