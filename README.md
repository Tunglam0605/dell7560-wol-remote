# Dell Precision 7560 — Control Deck v4.6.1

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
