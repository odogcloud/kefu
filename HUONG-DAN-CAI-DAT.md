# Hướng dẫn cài khung chat hỗ trợ (客服) cho odogcloud.com

Khách chat ở góc trang `odogcloud.com`. Mỗi khách thành **một topic** trong **nhóm Telegram** của bạn. Bạn **trả lời ngay trên Telegram**, tin nhắn hiện lại cho khách.

Bản này sửa từ **[lisi-123/Simplechat-system](https://github.com/lisi-123/Simplechat-system)** (MIT). Toàn bộ lịch sử commit của tác giả vẫn còn trong repo này. Thư mục làm việc trên máy tính: `D:\O Dog Cloud\feku` (remote `origin` là `odogcloud/kefu`, `upstream` là repo gốc).

> 🔒 Không commit `config.js` có **Bot Token**, **Chat ID** hay **Webhook Secret** thật lên GitHub. Các giá trị đó chỉ điền **trên VPS**.

---

## Mục lục
0. [Đã sửa gì so với bản gốc](#0-đã-sửa-gì-so-với-bản-gốc)
1. [Chuẩn bị Telegram](#1-chuẩn-bị-telegram)
2. [Cài Node.js trên VPS](#2-cài-nodejs-trên-vps)
3. [Tải code và cài thư viện](#3-tải-code-và-cài-thư-viện)
4. [Sửa `config.js`](#4-sửa-configjs)
5. [Chạy bằng Supervisor](#5-chạy-bằng-supervisor)
6. [Tên miền, Cloudflare, aaPanel](#6-tên-miền-cloudflare-aapanel)
7. [Nối webhook Telegram](#7-nối-webhook-telegram)
8. [Gắn khung chat vào odogcloud.com](#8-gắn-khung-chat-vào-odogcloudcom)
9. [Kiểm tra](#9-kiểm-tra)
10. [Vận hành, cập nhật](#10-vận-hành-cập-nhật)
11. [Bảng tra lỗi](#11-bảng-tra-lỗi)

---

## 0. Đã sửa gì so với bản gốc

| Phần | Sửa |
|---|---|
| Giao diện (`public/chat-widget.js`) | **Giống bygcloud.com** (đã được bên đó đồng ý): màu `#7851da`, nút nổi 50px "✦ 在线客服 / 关闭客服" cách phải 24px dưới 22px, khung 400×700 bo 22px, logo ✦, nhãn **在线 / 离线**, thanh **giờ Bắc Kinh**, lời chào, ô nhập có nút ảnh và nút "发送", dòng chữ cuối. Kích thước đã đo và khớp từng pixel. **Tên, logo chữ và dòng cuối là của O Dog Cloud** |
| Điện thoại | Màn hình ≤ 600px: khung chat mở **toàn màn hình ngay trên trang** (giống bygcloud). `public/chat.html` vẫn giữ để mở trực tiếp bằng link |
| Cấu hình (`config.js`) | Thêm `BRAND` (tên, câu chữ), `WORK_HOURS` (giờ làm việc), `AUTO_REPLY` (tin tự trả lời), `REDIS_URL` |
| `server.js` | Thêm `/widget-config` (trả tên, giờ làm việc, trạng thái online theo giờ Bắc Kinh). Chỉ nghe ở `127.0.0.1` (đi qua Nginx) |
| Bảo mật | Bỏ cho phép tải **SVG** (có thể chứa mã độc). File tải lên được trả kèm header chống chạy mã, file không phải ảnh hay video thì luôn **tải về**, không mở trên trình duyệt. Sửa lỗi **XSS** ở tên file trên bản máy tính |
| Redis | Dùng **database số 5** riêng, không đè dữ liệu V2Board |
| Xuống dòng | Đổi CRLF sang LF (bản gốc lưu CRLF, script `.sh` dễ lỗi trên Linux) |

---

## 1. Chuẩn bị Telegram

**1.1. Tạo bot:** @BotFather → `/newbot` → lấy **Bot Token**. Có thể dùng bot riêng, không dùng chung bot cảnh báo SePay.

**1.2. Tạo nhóm có topic:**
1. Tạo **nhóm riêng tư** mới, ví dụ `ODC 客服`.
2. Cài đặt nhóm → bật **Topics** (话题 / Chủ đề).
3. Thêm bot vào nhóm → đặt làm **Admin** → bật quyền **Manage Topics**.

⚠️ Không bật Topics, hoặc bot thiếu quyền **Manage Topics**, thì hệ thống **không chạy được**.

**1.3. Lấy Chat ID của nhóm:**
1. Gửi một tin bất kỳ trong nhóm.
2. Mở `https://api.telegram.org/botTOKEN/getUpdates` (thay `TOKEN` bằng token thật, viết liền).
3. Tìm `"chat":{"id":-100xxxxxxxxxx` → số **âm**, bắt đầu bằng `-100`, chính là **CHAT_ID**.

**1.4. Tạo topic giám sát** (nhận cảnh báo khi có IP spam):
1. Trong nhóm tạo topic tên `监控`, gửi một tin trong topic đó.
2. Tải lại trang `getUpdates`, tìm `"message_thread_id": 123` → đó là **MONITOR_TOPIC_ID**.

---

## 2. Cài Node.js trên VPS

Cài trên **VPS website** (VPS có V2Board): khung chat rất nhẹ và cần Redis có sẵn ở đó.
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs && node -v
```
Đúng là ra `v20.x.x`.

---

## 3. Tải code và cài thư viện

```bash
cd /www/wwwroot && git clone https://github.com/odogcloud/kefu.git kefu && cd kefu && npm install --omit=dev
```

---

## 4. Sửa `config.js`

```bash
nano /www/wwwroot/kefu/config.js
```

| Dòng | Điền |
|---|---|
| `BOT_TOKEN` | Bot Token (bước 1.1) |
| `CHAT_ID` | Chat ID nhóm, dạng `-100...` (bước 1.3) |
| `MONITOR_TOPIC_ID` | ID topic `监控` (bước 1.4) |
| `WEBHOOK_SECRET` | Chuỗi ngẫu nhiên, tạo bằng lệnh `openssl rand -hex 24` |
| `DOMAIN` | `kf.odogcloud.com` (không có `https://`) |
| `PORT` | `3000` (đổi nếu cổng này đã có chương trình khác dùng) |
| `REDIS_URL` | Giữ `redis://127.0.0.1:6379/5`. Redis có mật khẩu thì dùng `redis://:MATKHAU@127.0.0.1:6379/5` |
| `BRAND` | Tên hiển thị, câu chào, dòng chữ cuối, chữ trên nút |
| `WORK_HOURS` | Giờ làm việc **theo giờ Bắc Kinh**: `start`, `end` (đến giờ nhỏ hơn bắt đầu nghĩa là sang ngày hôm sau), `label` là chữ hiển thị |
| `AUTO_REPLY` | Tin tự gửi khi 30 giây chưa có ai trả lời |

Lưu: **Ctrl+O → Enter → Ctrl+X**. Đặt quyền:
```bash
chown -R www:www /www/wwwroot/kefu
```

---

## 5. Chạy bằng Supervisor

aaPanel → **App Store → Supervisor → Add Daemon**:

| Ô | Điền |
|---|---|
| Name | `kefu` |
| Run User | `www` |
| Run Dir | `/www/wwwroot/kefu` |
| Start Command | `/usr/bin/node server.js` |
| Processes | `1` |

Kiểm tra:
```bash
/www/server/panel/pyenv/bin/supervisorctl -c /etc/supervisor/supervisord.conf status kefu:*; curl -s http://127.0.0.1:3000/widget-config
```
Đúng là thấy `RUNNING`, và một đoạn JSON có `"brand"`.

---

## 6. Tên miền, Cloudflare, aaPanel

**6.1. Cloudflare** (zone `odogcloud.com`): **DNS → Add record** → `A`, Name `kf`, IP VPS website, **DNS only** (tạm thời, để xin SSL).

**6.2. aaPanel:** **Website → Add site** → domain `kf.odogcloud.com`, PHP **Static** → **SSL → Let's Encrypt** → **Apply** → bật **Force HTTPS**.

**6.3. URL rewrite** của site `kf.odogcloud.com`, xóa hết rồi dán:
```nginx
client_max_body_size 50m;

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 60s;
}
```
`client_max_body_size 50m` cho phép khách gửi file tới 50MB. Nếu aaPanel báo lỗi trùng dòng này, xóa dòng đó đi, vào **Config** của site rồi sửa `client_max_body_size` ở đó.

**6.4.** Quay lại Cloudflare → bật **Proxied** (đám mây cam) cho `kf`. SSL/TLS của zone vẫn là **Full (Strict)**.

**Không làm theo** hướng dẫn gốc (đặt SSL **Flexible** và Origin Rule tới cổng 3000), vì zone của bạn đang chạy Full (Strict).

---

## 7. Nối webhook Telegram

Chạy trên VPS (thay `TOKEN` và `SECRET` bằng giá trị trong `config.js`):
```bash
curl -s -X POST "https://api.telegram.org/botTOKEN/setWebhook" -d "url=https://kf.odogcloud.com/telegram-webhook" -d "secret_token=SECRET"
```
Đúng là ra `{"ok":true,"result":true,"description":"Webhook was set"}`.

Kiểm tra:
```bash
curl -s "https://api.telegram.org/botTOKEN/getWebhookInfo"
```
Thấy `"url":"https://kf.odogcloud.com/telegram-webhook"` và **không có** `last_error_message` là được.

⚠️ Một bot chỉ nhận được **một webhook**. Không dùng chung bot này với chương trình khác cũng đặt webhook.

---

## 8. Gắn khung chat vào odogcloud.com

**Đã tích hợp sẵn trong giao diện DK_Theme** (repo [odogcloud/home](https://github.com/odogcloud/home), từ 20/11/2026). Chỉ cần trong file `.env` của theme có dòng:
```env
VITE_CHAT_WIDGET_URL=https://kf.odogcloud.com/chat-widget.js
```
rồi build và tải theme lên như bình thường (hướng dẫn theme mục 4 và mục 6). Không cần sửa `index.html` hay cấu hình Nginx. Để trống dòng này thì không có khung chat.

Trang khác (không dùng DK_Theme) muốn có khung chat thì thêm dòng này trước `</body>`:
```html
<script src="https://kf.odogcloud.com/chat-widget.js" data-chat-widget defer></script>
```

- **Máy tính:** bấm nút mở khung chat 400×700 ở góc phải.
- **Điện thoại:** bấm nút mở khung chat **toàn màn hình ngay trên trang**, bấm ⌄ để thu lại.

---

## 9. Kiểm tra

1. Mở `odogcloud.com` (cửa sổ ẩn danh) → **在线客服** → gửi `test`.
2. Trong nhóm Telegram có **topic mới** (ví dụ `Win电脑-001`), có tin `test`, kèm IP và quốc gia.
3. **Trả lời trong topic đó** → khoảng 1–2 giây sau, tin hiện trong khung chat của khách.
4. Gửi thử một **ảnh** hai chiều (khách sang Telegram và ngược lại).
5. Thử trên **điện thoại**.
6. Nhãn **在线 / 离线** phải đúng theo giờ Bắc Kinh trong `WORK_HOURS`.

---

## 10. Vận hành, cập nhật

- **Trả lời khách:** trả lời **trong đúng topic** của khách. Tin nhắn ngoài topic thì khách không nhận được.
- **Khởi động lại** sau khi sửa `config.js`:
  ```bash
  /www/server/panel/pyenv/bin/supervisorctl -c /etc/supervisor/supervisord.conf restart kefu:*
  ```
- **Xem log:** aaPanel → Supervisor → `kefu` → **Log**.
- **Hội thoại cũ** tự xóa sau `EXPIRE_DAYS` ngày (mặc định 30), topic trên Telegram cũng bị xóa theo.
- **Spam:** một IP gửi quá `RATE_LIMIT_COUNT` tin/phút sẽ bị chặn `RATE_LIMIT_BAN_HOURS` giờ, và topic `监控` nhận cảnh báo.
- **Cập nhật code** từ repo `odogcloud/kefu` (giữ nguyên `config.js` trên VPS):
  ```bash
  cd /www/wwwroot/kefu && cp config.js /root/kefu-config.js.bak && git stash && git pull && git stash pop && npm install --omit=dev && chown -R www:www . && /www/server/panel/pyenv/bin/supervisorctl -c /etc/supervisor/supervisord.conf restart kefu:*
  ```
  Nếu `git stash pop` báo xung đột ở `config.js`, chép lại file cấu hình đã lưu: `cp /root/kefu-config.js.bak config.js`.
- **Sao lưu:** `config.js` (chứa token) và thư mục `public/uploads/` (ảnh và file khách gửi). **Không đưa lên GitHub.**

---

## 11. Bảng tra lỗi

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Supervisor báo `FATAL`, log có `Redis 启动失败` | Redis chưa chạy, hoặc sai `REDIS_URL` / mật khẩu | Kiểm tra `redis-cli ping`. Sửa `REDIS_URL` |
| Log có `EADDRINUSE` | Cổng 3000 đã có chương trình dùng | Đổi `PORT` trong `config.js` **và** `proxy_pass` trong URL rewrite |
| Khách gửi tin nhưng Telegram không có topic | Nhóm chưa bật Topics, bot chưa là admin hoặc thiếu quyền Manage Topics, sai `CHAT_ID` | Mục 1.2 và 1.3 |
| Trả lời trên Telegram mà khách không nhận | Webhook chưa đặt hoặc sai secret, trả lời ngoài topic | Mục 7, `getWebhookInfo` |
| `getWebhookInfo` báo lỗi 403 hoặc 5xx | Cloudflare chặn (Bot Fight Mode), hoặc dịch vụ không chạy | Tắt Bot Fight Mode. Kiểm tra Supervisor |
| Không thấy nút chat trên odogcloud.com | Theme build khi `.env` thiếu `VITE_CHAT_WIDGET_URL` | Mục 8, build lại theme |
| Gửi file lớn bị lỗi 413 | Nginx giới hạn dung lượng | `client_max_body_size 50m` (mục 6.3) |
| Gửi file SVG bị từ chối | Đã chặn có chủ ý (SVG có thể chứa mã độc) | Gửi PNG hoặc JPG |
| Nhãn online sai giờ | Sai `WORK_HOURS` | Giờ trong `config.js` là **giờ Bắc Kinh**, không phải giờ Việt Nam |
