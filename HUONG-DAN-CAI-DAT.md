# Hướng dẫn cài khung chat hỗ trợ (客服) cho odogcloud.com

Khách chat ở góc trang `odogcloud.com`. Mỗi khách thành **một topic** trong **nhóm Telegram** của bạn. Bạn **trả lời ngay trên Telegram**, tin nhắn hiện lại cho khách.

Bản này sửa từ **[lisi-123/Simplechat-system](https://github.com/lisi-123/Simplechat-system)** (MIT). Toàn bộ lịch sử commit của tác giả vẫn còn trong repo này. Thư mục làm việc trên máy tính: `D:\O Dog Cloud\feku` (remote `origin` là `odogcloud/kefu`, `upstream` là repo gốc).

> ✅ **Đã cài và chạy thử thành công ngày 20/11/2026**: khách gửi chữ và ảnh tới Telegram, trả lời trên Telegram hiện lại cho khách.
>
> 🔒 Không commit `config.js` có **Bot Token**, **Chat ID** hay **Webhook Secret** thật lên GitHub. Các giá trị đó chỉ điền **trên VPS**.

---

## Mục lục
0. [Đã sửa gì so với bản gốc](#0-đã-sửa-gì-so-với-bản-gốc)
1. [Chuẩn bị Telegram](#1-chuẩn-bị-telegram)
2. [Cài Node.js bằng aaPanel](#2-cài-nodejs-bằng-aapanel)
3. [Tải code và cài thư viện](#3-tải-code-và-cài-thư-viện)
4. [Sửa `config.js`](#4-sửa-configjs)
5. [Tạo Node.js Project trên aaPanel](#5-tạo-nodejs-project-trên-aapanel)
6. [SSL và Cloudflare](#6-ssl-và-cloudflare)
7. [Nối webhook Telegram](#7-nối-webhook-telegram)
8. [Gắn khung chat vào odogcloud.com](#8-gắn-khung-chat-vào-odogcloudcom)
9. [Kiểm tra](#9-kiểm-tra)
10. [Vận hành, cập nhật](#10-vận-hành-cập-nhật)
11. [Bảng tra lỗi](#11-bảng-tra-lỗi)
12. [Cách 2: cài bằng lệnh + Supervisor (không dùng Node.js Project của aaPanel)](#12-cách-2-cài-bằng-lệnh--supervisor)

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

**1.4. Tạo topic giám sát** (nhận cảnh báo khi có IP spam). Cách dễ nhất là **cho bot tự tạo**, mở link sau trên trình duyệt (thay `TOKEN` và `CHATID`):
```
https://api.telegram.org/botTOKEN/createForumTopic?chat_id=CHATID&name=监控
```
Kết quả `{"ok":true,"result":{"message_thread_id":35,...}}` → số đó là **MONITOR_TOPIC_ID**. Báo `not enough rights` nghĩa là bot chưa có quyền **Manage Topics**.

**Quyền admin của bot nên đặt:**

| Quyền | Để |
|---|---|
| Manage topics | **Bật** (bắt buộc) |
| Delete Messages | **Bật** (để xóa topic cũ) |
| Add New Admins, Remain Anonymous | Tắt |

Đang dùng: nhóm **O DOG CLOUD SUPPORT**, bot **@ODOGCLOUD_BOT**, topic `监控` id **35**.

---

## 2. Cài Node.js bằng aaPanel

> Có **2 cách** chạy khung chat. Mục 2, 5, 6 dưới đây là **Cách 1: aaPanel Node.js Project** (đang dùng, có giao diện quản lý). **Cách 2: lệnh + Supervisor** (giống Webman và Horizon) nằm ở **mục 12**. Các mục 1, 3, 4, 7–11 dùng chung cho cả hai cách.

Cài trên **VPS website** (VPS có V2Board): khung chat rất nhẹ và dùng Redis có sẵn ở đó.

1. aaPanel → **Website → Node.js Project** → bấm **Install** (Node version manager).
2. **Node version manager** → cài bản **v24** mới nhất (đang dùng **v24.22.3**). **Không dùng v20**: đã hết hỗ trợ từ 30/04/2026.
3. Ô **Command line ver** → chọn v24.22.3.

aaPanel cài Node ở `/www/server/nodejs/v24.22.3/bin/`. Nếu Terminal vẫn báo `node: command not found` thì tạo đường dẫn:
```bash
ln -sf /www/server/nodejs/v24.22.3/bin/node /usr/local/bin/node && ln -sf /www/server/nodejs/v24.22.3/bin/npm /usr/local/bin/npm && ln -sf /www/server/nodejs/v24.22.3/bin/npx /usr/local/bin/npx && hash -r && node -v
```

---

## 3. Tải code và cài thư viện

Repo `odogcloud/kefu` để **Public** (không chứa bí mật), nên clone không cần đăng nhập:
```bash
cd /www/wwwroot && git clone https://github.com/odogcloud/kefu.git kefu && cd kefu && npm install --omit=dev && npm ls multer
```
Dòng cuối phải ra `multer@2.x`. Các dòng `npm warn ... --init.module` là cảnh báo cấu hình npm của aaPanel, bỏ qua.

---

## 4. Điền `config.js`

**4.1. Chat ID, topic, tên miền, Webhook Secret** (thay Chat ID và topic nếu khác):
```bash
cd /www/wwwroot/kefu && sed -i 's|"YOUR_CHAT_ID"|"-1004396709585"|; s|"YOUR_MONITOR_TOPIC_ID"|"35"|; s|DOMAIN: ""|DOMAIN: "kf.odogcloud.com"|' config.js && SECRET=$(openssl rand -hex 24) && sed -i "s|\"YOUR_WEBHOOK_SECRET\"|\"$SECRET\"|" config.js && echo "Da tao WEBHOOK_SECRET"
```

**4.2. Bot Token** (dán token rồi Enter, màn hình không hiện token). Lệnh ghi đè cả khi token đang trống hoặc sai:
```bash
cd /www/wwwroot/kefu && read -rsp "Dan Bot Token roi Enter: " T && echo && sed -i "s|BOT_TOKEN: \"[^\"]*\"|BOT_TOKEN: \"$T\"|" config.js && unset T && echo "Da dien token"
```

**4.3. Kiểm tra** (không in token ra):
```bash
cd /www/wwwroot/kefu && grep -nE 'CHAT_ID|MONITOR_TOPIC_ID|DOMAIN|REDIS_URL|PORT' config.js && echo "Con thieu: $(grep -c 'YOUR_' config.js)" && echo "Do dai token: $(grep -oP 'BOT_TOKEN: "\K[^"]*' config.js | tr -d '\n' | wc -c)" && curl -s "https://api.telegram.org/bot$(grep -oP 'BOT_TOKEN: "\K[^"]+' config.js)/getMe" | grep -oE '"(ok|username)":[^,}]*'; chown -R www:www /www/wwwroot/kefu
```
Đúng là: `Con thieu: 0`, độ dài token khoảng 46, `"ok":true` và đúng username bot.

Các mục khác trong `config.js` (sửa bằng `nano config.js` khi cần):

| Dòng | Ý nghĩa |
|---|---|
| `PORT` | `3000`. Đổi thì phải đổi cả cổng trong Node.js Project |
| `REDIS_URL` | `redis://127.0.0.1:6379/5`. Redis có mật khẩu thì `redis://:MATKHAU@127.0.0.1:6379/5` |
| `BRAND` | Tên hiển thị, câu chào, dòng chữ cuối, chữ trên nút |
| `WORK_HOURS` | Giờ làm việc **theo giờ Bắc Kinh**: `start`, `end` (giờ kết thúc nhỏ hơn giờ bắt đầu nghĩa là sang ngày hôm sau), `label` là chữ hiển thị |
| `AUTO_REPLY` | Tin tự gửi khi 30 giây chưa có ai trả lời |

**4.4. Chạy thử 6 giây:**
```bash
cd /www/wwwroot/kefu && chown -R www:www . && (timeout 6 sudo -u www node server.js &) ; sleep 3; curl -s http://127.0.0.1:3000/widget-config; echo
```
Đúng là có `Redis 已连接`, `server running on 127.0.0.1:3000`, và JSON có `"brand"`.

---

## 5. Tạo Node.js Project trên aaPanel

*(Cách 1. Dùng cách 2 thì xem mục 12.)*

**Cloudflare trước** (zone `odogcloud.com`): **DNS → Add record** → `A`, Name `kf`, IP VPS website, **DNS only** (tạm thời, để xin SSL).

aaPanel → **Website → Node.js Project → Add Project → Default Project**:

| Ô | Điền |
|---|---|
| Path | `/www/wwwroot/kefu` |
| Project Name | `kefu` |
| Run User | `www` |
| Node.js runtime | `v24.22.3` |
| Pkg Manager | **npm** |
| Install dependencies | **Tắt** (đã cài ở mục 3) |
| Start command | **From package.json** → `start [node server.js]` |
| Project Port | `3000` |
| More settings → Project Remark | `kefu` |
| More settings → Domain name | `kf.odogcloud.com` |

**Confirm**. Dòng `kefu` phải ở trạng thái **Running**. aaPanel tự tạo site và reverse proxy cho `kf.odogcloud.com`, không cần viết URL rewrite.

---

## 6. SSL và Cloudflare

1. Dòng `kefu` → **Modify** (hoặc bấm **Not Set** ở cột SSL) → **SSL → Let's Encrypt** → tích `kf.odogcloud.com` → **Apply** → bật **Force HTTPS**.
2. Kiểm tra:
   ```bash
   curl -s https://kf.odogcloud.com/widget-config | head -c 80; echo
   ```
3. Cloudflare → bản ghi `kf` → bật **Proxied** (đám mây cam). SSL/TLS của zone vẫn là **Full (Strict)**.
4. Giới hạn dung lượng file của Nginx (mặc định aaPanel là 50m):
   ```bash
   grep -rh "client_max_body_size" /www/server/nginx/conf/nginx.conf /www/server/panel/vhost/nginx/*kf.odogcloud.com* 2>/dev/null
   ```

**Không làm theo** hướng dẫn gốc (đặt SSL **Flexible** và Origin Rule tới cổng 3000), vì zone đang chạy Full (Strict).

---

## 7. Nối webhook Telegram

Lệnh tự đọc token và secret từ `config.js`, không in ra màn hình:
```bash
cd /www/wwwroot/kefu && T=$(grep -oP 'BOT_TOKEN: "\K[^"]+' config.js) && S=$(grep -oP 'WEBHOOK_SECRET: "\K[^"]+' config.js) && curl -s -X POST "https://api.telegram.org/bot$T/setWebhook" -d "url=https://kf.odogcloud.com/telegram-webhook" -d "secret_token=$S" -d 'allowed_updates=["message"]'; echo; curl -s "https://api.telegram.org/bot$T/getWebhookInfo"; echo; unset T S
```
Đúng là `"Webhook was set"`, rồi `"url":"https://kf.odogcloud.com/telegram-webhook"`, `"pending_update_count":0`, **không có** `last_error_message`.

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
- **Khởi động lại** sau khi sửa `config.js`: aaPanel → **Website → Node.js Project** → dòng `kefu` → nút **Restart** (hoặc Stop rồi Start).
- **Xem log, CPU, RAM:** aaPanel → Node.js Project → `kefu` → **Modify** → **Log**.
- **Hội thoại cũ** tự xóa sau `EXPIRE_DAYS` ngày (mặc định 30), topic trên Telegram cũng bị xóa theo.
- **Spam:** một IP gửi quá `RATE_LIMIT_COUNT` tin/phút sẽ bị chặn `RATE_LIMIT_BAN_HOURS` giờ, và topic `监控` nhận cảnh báo.
- **Cập nhật code** từ repo `odogcloud/kefu` (giữ nguyên `config.js` trên VPS):
  ```bash
  git config --global --add safe.directory /www/wwwroot/kefu; cd /www/wwwroot/kefu && cp config.js /root/kefu-config.js.bak && git stash && git pull && git stash pop && npm install --omit=dev && chown -R www:www .
  ```
  Rồi bấm **Restart** project `kefu` trong aaPanel (chỉ sửa file trong `public/` thì không cần Restart).
- **Sau khi cập nhật giao diện** (`public/chat-widget.js`, `public/chat.html`): Cloudflare → **Caching → Purge Cache → Custom Purge** hai địa chỉ `https://kf.odogcloud.com/chat-widget.js` và `https://kf.odogcloud.com/chat.html`. Nếu `git stash pop` báo xung đột ở `config.js`, chép lại file cấu hình đã lưu: `cp /root/kefu-config.js.bak config.js`.
- **Sao lưu:** `config.js` (chứa token) và thư mục `public/uploads/` (ảnh và file khách gửi). **Không đưa lên GitHub.**

---

## 11. Bảng tra lỗi

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Project không lên **Running**, log có `Redis 启动失败` | Redis chưa chạy, hoặc sai `REDIS_URL` / mật khẩu | Kiểm tra `redis-cli ping`. Sửa `REDIS_URL` |
| Log có `EADDRINUSE` | Cổng 3000 đã có chương trình dùng (ví dụ còn bản chạy thử ở mục 4.4) | Đợi bản chạy thử tự tắt, hoặc đổi `PORT` trong `config.js` **và** cổng của project |
| Khách gửi tin nhưng Telegram không có topic | Nhóm chưa bật Topics, bot chưa là admin hoặc thiếu quyền Manage Topics, sai `CHAT_ID` | Mục 1.2 và 1.3 |
| Trả lời trên Telegram mà khách không nhận | Webhook chưa đặt hoặc sai secret, trả lời ngoài topic | Mục 7, `getWebhookInfo` |
| `getWebhookInfo` báo lỗi 403 hoặc 5xx | Cloudflare chặn (Bot Fight Mode), hoặc dịch vụ không chạy | Tắt Bot Fight Mode. Kiểm tra project `kefu` đang Running |
| Không thấy nút chat trên odogcloud.com | Theme build khi `.env` thiếu `VITE_CHAT_WIDGET_URL` | Mục 8, build lại theme |
| Gửi file lớn bị lỗi 413 | Nginx giới hạn dung lượng | `client_max_body_size 50m` (mục 6) |
| Gửi file SVG bị từ chối | Đã chặn có chủ ý (SVG có thể chứa mã độc) | Gửi PNG hoặc JPG |
| `fatal: detected dubious ownership` khi `git pull` | Thư mục thuộc user `www`, đang chạy git bằng root | `git config --global --add safe.directory /www/wwwroot/kefu` (chỉ cần một lần) |
| `git clone` hỏi Username / Password | Repo đang Private | Chuyển repo sang Public (Settings → Danger Zone → Change visibility). Không nhập mật khẩu |
| `node: command not found` | Node cài qua aaPanel chưa có trong đường dẫn | Lệnh `ln -sf` ở mục 2 |
| `npm warn deprecated multer@1.x` | Bản code cũ | `git pull` lấy bản dùng multer 2.x |
| Nhãn online sai giờ | Sai `WORK_HOURS` | Giờ trong `config.js` là **giờ Bắc Kinh**, không phải giờ Việt Nam |

---

## 12. Cách 2: cài bằng lệnh + Supervisor

Dùng khi **không muốn** quản lý bằng trang Node.js Project của aaPanel. Chạy giống Webman và Horizon: quản lý ở **aaPanel → Supervisor**, Node.js cài chuẩn ở `/usr/bin/node`. Chọn **một trong hai cách**, không chạy cả hai cùng lúc (sẽ tranh cổng 3000).

**12.1. Cài Node.js 24** (thay cho mục 2):
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt install -y nodejs && node -v && which node
```
Đúng là ra `v24.x.x` và `/usr/bin/node`. Không dùng `apt install nodejs` có sẵn của Ubuntu, vì bản đó cũ và thiếu `npm`.

**12.2. Tải code, điền `config.js`, chạy thử:** làm giống **mục 3 và 4**.

**12.3. Chạy bằng Supervisor** (thay cho mục 5). aaPanel → **App Store → Supervisor → Add Daemon**:

| Ô | Điền |
|---|---|
| Name | `kefu` |
| Run User | `www` |
| Run Dir | `/www/wwwroot/kefu` |
| Start Command | `/usr/bin/node server.js` |
| Processes | `1` |

Kiểm tra:
```bash
/www/server/panel/pyenv/bin/supervisorctl -c /etc/supervisor/supervisord.conf status kefu:*; curl -s http://127.0.0.1:3000/widget-config | head -c 80; echo
```
Đúng là thấy `RUNNING` và đoạn JSON có `"brand"`.

**12.4. Tên miền và SSL** (thay cho mục 6):
1. Cloudflare: bản ghi **A `kf`** → IP VPS website, **DNS only** (tạm thời).
2. aaPanel → **Website → Add site** → domain `kf.odogcloud.com`, PHP **Static** → **SSL → Let's Encrypt** → **Apply** → bật **Force HTTPS**.
3. **URL rewrite** của site `kf.odogcloud.com`, xóa hết rồi dán:
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
   Nếu aaPanel báo trùng `client_max_body_size` thì xóa dòng đó (aaPanel mặc định đã là 50m).
4. Cloudflare → bật **Proxied** cho `kf`. SSL/TLS vẫn **Full (Strict)**.

**12.5. Webhook:** làm giống **mục 7**.

**12.6. Vận hành theo cách 2:**
- Khởi động lại sau khi sửa `config.js`:
  ```bash
  /www/server/panel/pyenv/bin/supervisorctl -c /etc/supervisor/supervisord.conf restart kefu:*
  ```
- Xem log: aaPanel → **Supervisor** → `kefu` → **Log**.
- Cập nhật code:
  ```bash
  git config --global --add safe.directory /www/wwwroot/kefu; cd /www/wwwroot/kefu && cp config.js /root/kefu-config.js.bak && git stash && git pull && git stash pop && npm install --omit=dev && chown -R www:www . && /www/server/panel/pyenv/bin/supervisorctl -c /etc/supervisor/supervisord.conf restart kefu:*
  ```

**12.7. Chuyển từ cách 1 sang cách 2** (hoặc ngược lại):
1. Dừng và xóa cách đang chạy. Với cách 1: Node.js Project → `kefu` → **Stop** → **Delete**, **không** tích xóa thư mục code. Với cách 2: Supervisor → `kefu` → **Delete**.
2. Làm theo cách mới. Thư mục `/www/wwwroot/kefu` và `config.js` **giữ nguyên**, không cần điền lại.
3. Webhook Telegram **không cần đặt lại**, vì tên miền không đổi.
