# Dell Precision 7560 — Control Deck v4.9 (Remote Screen Lock)

**One official website:** https://tunglam0605.github.io/dell7560-wol-remote/

This is an additive Windows Agent feature on the existing v4.8 multi-tab dashboard. No ESP32 firmware update is required.

## Lock action (LOCK)

- Control Deck > **Điều khiển nguồn** adds **Khóa màn hình Dell**, enabled only when the authenticated Windows Agent advertises `lock_v1`.
- The browser publishes `LOCK|<expiry>|<nonce>` on the existing authenticated MQTT command topic. No passwords/PINs or user input are transmitted.
- Windows Agent rejects retained, expired, malformed, future and replayed commands; it dispatches `DellRemoteLockScreen` scheduled task under the active user's **InteractiveToken**, not the Session-0 SYSTEM desktop.
- The interactive task invokes the documented Windows `LockWorkStation()` API. ACK `lock_dispatched` means Task Scheduler accepted the request, **not** independent proof that the screen is locked.
- Unlocking requires authentication through the user's existing remote-control application or the Windows sign-in screen. **No web-based Windows unlock, password storage, automatic sign-in or login bypass.**
- Existing WOL, Windows shutdown/schedule/cancel, multi-alarm buzzer, telemetry, MQTT TLS and audit controls remain unchanged.

## Verification and release gate

- Windows 11 Pro build 26200 confirmed; agent task runs as SYSTEM, interactive console session is 1.
- An on-demand InteractiveToken task was created and executed in **session 1** without changing the lock state.
- Updated Windows Agent `--self-test` passed all 34 cases; frontend syntax and DOM continuity must pass before publishing.
- During initial deployment no live lock was triggered. A subsequent MQTT LOCK request was **actually dispatched at 2026-10-26 14:17:50 ICT**: Task Scheduler reported `DellRemoteLockScreen` last result `0`, and the existing `LockScreenDisplayOffKeepAwake` session-lock trigger ran at 14:17:51 with result `0`. This corroborates real Windows locking; the sender of that MQTT request was not identified by this audit.
- Windows Agent was restarted successfully at 2026-10-26 14:09 ICT; its log confirms `MQTT connected` and `MQTT commands subscription active` after restart. The web lock button requires `lock_v1` telemetry.

---

# Dell Precision 7560 — Control Deck v4.8 (Multi-tab UI)

**Website chính thức duy nhất:** https://tunglam0605.github.io/dell7560-wol-remote/

v4.8 thay đổi **chỉ giao diện website**, không tạo trang/repository mới và không nạp lại ESP32. Firmware đã triển khai và xác minh lần gần nhất là `4.7.0-rc1`. Chức năng phát âm thanh thực tế chưa được nghiệm thu; không khẳng định rằng việc nhấn "Thử" luôn làm còi phát tiếng.

## Kiến trúc giao diện

- **Tổng quan:** Trạng thái MQTT, ESP32, Windows Agent, lịch tắt máy; các thẻ điều hướng nhanh thay vì dồn tất cả widget vào cùng trang.
- **Điều khiển nguồn:** Wake-on-LAN, tắt máy an toàn, hủy lệnh đang chờ.
- **Hẹn giờ:** Lựa chọn thời gian/tần suất và hủy lịch đã đặt trên Windows Agent.
- **Đồng hồ báo thức:** Danh sách tối đa 8 lịch ở ESP32; bấm "Thêm báo thức" mới hiện form, bấm "Sửa" mở form đã điền; âm thử có bộ chọn giai điệu riêng luôn nhìn thấy.
- **Giám sát:** CPU, RAM, pin/nguồn, Ethernet, uptime.
- **Nhật ký:** Thông báo kết nối, phản hồi lệnh và nhật ký phiên trình duyệt.

Desktop dùng sidebar sáu mục. Mobile dùng thanh điều hướng năm nút (Tổng quan, Nguồn, Hẹn giờ, Báo thức, Thêm); trong **Thêm** có Giám sát và Nhật ký.

Hash routes `#dashboard`, `#power`, `#schedule`, `#buzzer`, `#monitor`, `#events` hoạt động trong **cùng một HTML**. Chuyển tab chỉ đặt `hidden` trên các vùng nội dung: không dựng lại MQTT client, không mất trạng thái, không gửi lệnh nhầm và không xóa lịch ở ESP32. Hashchange hỗ trợ nút Quay lại/Tiến tới trình duyệt.

## Kiểm thử

- Kiểm tra cú pháp JavaScript, 110 ID không trùng, đầy đủ 6 route và nút điều khiển cũ: **PASS**.
- Thực thi chính hàm điều hướng với DOM mô phỏng: đổi 6 tab, chỉ một trang đang hiển thị, trạng thái active/aria-current, route lỗi quay về Tổng quan, menu Thêm và Escape: **PASS**.
- Thực thi logic form báo thức với DOM mô phỏng: mở form thêm, hủy/đóng, sửa giờ/giai điệu, reset khi lưu: **PASS**.
- Cần người dùng kiểm tra tiếp âm thanh GPIO4 và thao tác thực tế trên trình duyệt kết nối EMQX; các bài kiểm tra mô phỏng không thay thế nghiệm thu phần cứng.

## Nguồn và phạm vi

- Source frontend: `index.html`, `app.js`, `ui.css`, `icons.js`, `mqtt.min.js`.
- Không thay đổi lệnh, thời hạn lệnh, định dạng ACK, thông tin đăng nhập hoặc firmware qua bản v4.8 giao diện này.
- Không có credential trong repository; mật khẩu MQTT nhập trong giao diện người dùng.
- Không phục hồi chức năng dò tìm thiết bị Wi-Fi đã gỡ.
- Lịch sử v4.6.1 bên dưới được giữ lại cho mục đích truy vết, **không phản ánh phiên bản đang phát hành**.

---


## Lịch sử triển khai: Control Deck v4.6.1

Trang điều khiển HTTPS: https://tunglam0605.github.io/dell7560-wol-remote/

**Trạng thái 25/10/2026:** Bản **v4.6.1** đã loại bỏ hoàn toàn mục đếm/nhận diện thiết bị Wi-Fi khỏi dashboard: không còn thẻ, menu, nút điều hướng, kiểu CSS, bộ xử lý dữ liệu hoặc thống kê client của router. Theo yêu cầu, dự án **không tiếp tục phát triển tính năng phát hiện thiết bị trong mạng**. Firmware ESP32 v4.6 đã loại bỏ CSI trước đó nên không cần nạp lại chỉ để cập nhật website.

## Chức năng giữ nguyên

- **Wake-on-LAN:** Gửi lệnh có hạn sử dụng qua MQTT/TLS tới ESP32 để phát Magic Packet cho Dell Precision 7560. Trạng thái `wol_sent` chỉ xác nhận gói tin được gửi, không xác nhận Windows đã khởi động.
- **Windows Agent:** Gửi và xác nhận lệnh tắt máy an toàn, chờ 45 giây để hủy, đặt/hủy lịch tắt máy, ping máy đang online.
- **Giám sát Dell:** CPU, RAM, pin/nguồn, Ethernet và uptime qua telemetry tổng hợp của Windows Agent; dữ liệu quá hạn tự động ẩn.
- **Còi GPIO4:** Lệnh bíp ngắn và báo thức hằng ngày qua MQTT; báo thức quản lý trên ESP32 bằng NVS, theo giờ Việt Nam UTC+7; giới hạn tiếng báo tối đa 45 giây.
- **Trạng thái hệ thống:** MQTT Cloud, ESP32 WOL gateway, Windows Agent và lịch tắt máy.

## Sơ đồ kết nối

```text
Điện thoại / trình duyệt HTTPS (GitHub Pages)
        | WSS / MQTT v5, kết nối xác thực
        v
     EMQX Cloud
        |-- ESP32 -> Wake-on-LAN UDP -> Dell Ethernet
        |        \-> GPIO4 buzzer + NVS daily alarm
        \-- Windows Agent -> trạng thái/CPU/RAM/pin + lịch/tắt máy
```

**Không có** mô-đun phát hiện thiết bị Wi-Fi, người, chuyển động, CSI hoặc dò tìm client của router.

## Triển khai và kiểm thử

- Frontend: `index.html`, `app.js`, `ui.css`, `icons.js`, `mqtt.min.js`; static HTTPS, không có backend công khai.
- Version frontend: **v4.6.1**. Mã kiểm thử chuyên biệt: `remote-ui/test-control-deck-no-device-detection.js` trong workspace firmware riêng tư.
- Playwright mock test: **PASS** ở 320, 390, 768 và 1440 px; xác nhận không còn thành phần nhận diện thiết bị, không tràn ngang, trạng thái WOL/còi vẫn hoạt động trong mock MQTT, không có lỗi JavaScript.
- Buzzer/alarm regression: **PASS** ở 320, 390, 1440 px.
- Giám sát Windows Agent và hẹn giờ/hủy lịch mock regression: **PASS**.
- Firmware ESP32 v4.6 đã OTA trước đó; bản app cuối SHA-256 `9C8FD36050E5FE3BE01F35390274538B48469C60A22D4C38246DBA53D42D88D2`. Không flash lại ESP32 cho lần thay đổi giao diện này.

## Bảo mật và giới hạn

- Không commit mật khẩu Wi-Fi, MQTT, thông tin đăng nhập Windows, bộ nhớ NVS hoặc ảnh firmware vào repository public.
- Firmware có cơ chế chống lặp lệnh/giới hạn thời gian, nhưng vẫn cần MQTT broker ACL đúng nguyên tắc đặc quyền tối thiểu.
- ESP32 web HTTP/OTA chỉ sử dụng ở LAN tin cậy; không mở port forward lên Internet.
- Bíp xác nhận đã gửi Magic Packet không phải xác nhận Dell bật thành công. Bài kiểm tra khởi động S5 vẫn phải xác minh thực tế.
- Còi trực tiếp GPIO4 cần xác nhận dòng điện phần cứng trước khi sử dụng lâu dài.

**Lưu ý:** Bản v4.6.1 chỉ thay đổi dashboard và tài liệu. Không thay đổi logic firmware WOL/MQTT/buzzer hoặc Windows Agent.
