# Dell Precision 7560 — Control Deck v4.6

Trang điều khiển: https://tunglam0605.github.io/dell7560-wol-remote/

**Trạng thái ngày 25/10/2026:** Giao diện v4.6 đã được xuất bản. Firmware ESP32 v4.6 **không còn chức năng CSI / giám sát người**; bản application cuối đã được build và nạp OTA qua LAN, kiểm tra sau reboot thành công. Windows Agent và các tính năng nguồn được giữ nguyên. Số client Wi-Fi từ router **chưa có API được xác thực**, vì vậy bảng Wi-Fi phải hiển thị **`--`**, không phải số đếm giả.

## Chức năng hiện tại

- **Wake-on-LAN:** Trang HTTPS gửi lệnh có hạn dùng qua MQTT/TLS; ESP32 phát Magic Packet cho Dell. Xác nhận `wol_sent` là **đã gửi packet**, không phải chứng cứ Dell khởi động thành công.
- **Windows Agent:** Tắt máy sau thời gian xác nhận 45 giây, đặt/hủy lịch tắt, ping và trạng thái online. Lệnh tắt do Windows Agent thực hiện, không bởi ESP32.
- **Giám sát Dell:** CPU, RAM, pin/nguồn, Ethernet, uptime do Windows Agent xuất bản. Chỉ số cũ tự ẩn.
- **GPIO4 buzzer:** Bíp xác nhận ngắn, bật báo thức hằng ngày, dừng báo thức, tắt lịch; giới hạn chu kỳ báo tối đa 45 giây. Lịch được lưu bằng NVS trên ESP32, giờ Việt Nam UTC+7.
- **Wi-Fi clients:** Bảng có sẵn để hiển thị dữ liệu từ router khi có nguồn tin đáng tin cậy. Không có API router thì số liệu để trống. **Không suy đoán số máy từ Wi-Fi station, ARP hay kết quả ping LAN.**

## Kiến trúc

```text
Browser HTTPS (GitHub Pages)
   | WSS / MQTT v5, tài khoản đã cấu hình tại trình duyệt
EMQX Cloud (MQTT/TLS)
   |-- ESP32: command allowlist, Wake packet, buzzer, NVS alarm,
   |          Wi-Fi reconnect, SNTP, local LAN-only A/B OTA
   `-- Windows Agent: presence/aggregate monitor,
                      shutdown 45-second grace, timer/cancel

Wi-Fi client count (optional, currently NOT available)
Router associated-station API (read-only, authenticated)
   -> future verified adapter -> MQTT ack -> dashboard
```

## Hợp đồng telemetry Wi-Fi

Dashboard chỉ nhận bản tin JSON trên topic `home/dell7560/ack`, có ID `NNNNNNNNNNNNNNNN`, `result="wifi_clients"`, timestamp UNIX hợp lệ và `count` nguyên từ 0 đến 4096.

Ví dụ **cấu trúc, không phải dữ liệu đo được**:

```json
{"id":"NNNNNNNNNNNNNNNN","result":"wifi_clients","ts":1792900000,"count":5,"source":"router_ap","scope":"wifi_associated","complete":true}
```

- `source=router_ap`, `scope=wifi_associated`, `complete=true`: xác nhận router cung cấp danh sách station Wi-Fi đang liên kết.
- `source=lan_discovery`, `scope=lan_visible`, `complete=false`: chỉ được mô tả là số thiết bị *nhìn thấy trên LAN*, **không** phải tổng thiết bị Wi-Fi.
- Timestamp vượt tương lai 15 giây, dữ liệu trên 120 giây, sai schema hoặc không được chứng thực về scope đều bị loại. Dữ liệu đã hết hạn sẽ bị ẩn.
- Không đưa mật khẩu quản trị router vào web tĩnh, ESP firmware, GitHub hoặc MQTT payload. Không mở port quản trị router ra WAN.
- API router/chính sách cấp quyền chưa xác minh: **adapter sẽ không được kích hoạt** cho đến khi xác định đúng model, API đọc danh sách associated clients và quyền đọc.

## Firmware v4.6 và rollback

- ESP-IDF: v6.1-dev hiện đang được cài trên máy phát triển; bản này đã được build/OTA thành công, chưa phải cơ sở khẳng định đã kiểm thử trên ESP-IDF stable.
- App image cuối: `private/build-v46-no-csi-final/esp32_dell_wol.bin` (chỉ trên máy Dell, **không có trong repository public**).
- SHA-256: `9C8FD36050E5FE3BE01F35390274538B48469C60A22D4C38246DBA53D42D88D2`.
- Partition table không thay đổi. Firmware backup trước lần cập nhật cuối lưu **riêng tư** tại `private/release/v46_before_final_cleanup.bin`.
- Nhật ký build/OTA riêng tư: `private/v46-final-build-report.txt`, `private/v46-final-ota-acceptance.log`.
- Chỉ cập nhật **application qua A/B OTA**, không flash bootloader/partition table. Nếu OTA mất liên lạc hoàn toàn, có thể cần can thiệp vật lý.
- Không có API `/api/csi`, không có worker xử lý RF/person detection, và driver CSI bị tắt trong cấu hình build cuối.

## Kiểm thử

- Build ESP-IDF: PASS; app 1.021.440 byte; OTA partition còn khoảng 48%.
- OTA: PASS; phản hồi sau reboot với Wi-Fi/MQTT online, buzzer hoạt động về mặt phần mềm, đồng hồ báo thức đã đồng bộ, CSI endpoint không tồn tại.
- Frontend mock test: PASS tại 320/390/1440 px; kiểm tra đúng dữ liệu router, dữ liệu LAN không đầy đủ, giới hạn timestamp và giá trị không hợp lệ; không tràn ngang.
- Buzzer/alarm dashboard mock regression: PASS ba kích cỡ màn hình; không phát lệnh đến thiết bị thật.
- **Chưa chứng nhận:** kết quả đếm thiết bị Wi-Fi thật từ router, kiểm tra âm thanh còi bằng quan sát vật lý, WOL từ trạng thái Dell S5, luồng Wake/Shutdown thực từ điện thoại ngoài mạng. Những mục này không được báo là PASS.

## Bảo mật và giới hạn phần cứng

- Repository public **không** lưu Wi-Fi password, MQTT credentials, binary chứa credentials hoặc khóa quản trị router.
- MQTT/TLS dùng broker ACL, expiry và anti-replay; không chèn shell command vào request.
- ESP32 local HTTP/OTA chỉ dành cho **LAN đáng tin cậy** và không có xác thực mạnh từng người dùng: không port-forward HTTP hoặc UDP 9 lên Internet.
- GPIO4 là strapping pin. Còi gắn trực tiếp GPIO4 cần kiểm tra dòng tiêu thụ thực tế: nếu vượt giới hạn chân MCU, cần transistor/driver + diode khi tải cảm, không dựa vào giới hạn phần mềm để bảo vệ phần cứng.
- Không dùng còi làm thiết bị cảnh báo an toàn quan trọng.

Mã nguồn firmware và bản backup chứa cấu hình vận hành nằm trên máy chủ phát triển riêng tư, không nằm trong repo GitHub Pages.
