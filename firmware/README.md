# HƯỚNG DẪN NAP FIRMWARE CHO ESP32-C3 SMART HOME

Tất cả mã nguồn Firmware đã được cập nhật và tối ưu hóa tối đa trong tệp tin `ESP32_SmartHome.ino`.

---

## 🛠️ Trình Tự Chuẩn Bị Trên Máy Tính

1. **Tải và Cài đặt Arduino IDE** phiên bản mới nhất từ trang chủ [arduino.cc](https://www.arduino.cc/en/software).
2. **Thêm gói phần cứng ESP32** vào Arduino IDE:
   - Mở cửa sổ cấu hình: `File` -> `Preferences`.
   - Tại mục **Additional boards manager URLs**, dán đường dẫn sau vào:
     ```text
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Đi đến `Tools` -> `Board` -> `Boards Manager...`, tìm từ khóa `esp32` và tiến hành nhấn **Install**.

---

## 📚 Cài Đặt Thư Viện Yêu Cầu

Mở trình quản lý thư viện (`Tools` -> `Manage Libraries...`) hoặc phím tắt `Ctrl + Shift + I` và tiến hành cài đặt chính xác các thư viện sau:

1. **Firebase ESP Client** (Nhà phát triển: *Mobizt*) - Phiên bản khuyến nghị `>= 4.4.x`
2. **WiFiManager** (Nhà phát triển: *tzapu*) - Phiên bản khuyến nghị `>= 2.0.x`
3. **ArduinoJson** (Nhà phát triển: *Benoit Blanchon*) - Phiên bản khuyến nghị `>= 6.x` hoặc `>= 7.x`

---

## 🔌 Sơ Đồ Đấu Nối Linh Kiện (ESP32-C3 Dev Module)

Mã nguồn thiết lập điều khiển logic **Kích mức Thấp (Active LOW)** - Tức là chân GPIO xuất ra mức `LOW` thiết bị Relay sẽ Đóng/Bật hành trình.

| Tên Thiết Bị | Chân GPIO Trên ESP32-C3 | Nhánh Firebase |
| :--- | :---: | :---: |
| **Đèn Phòng Khách** | **GPIO 1** | `/devices/den_phong_khach` |
| **Quạt Trần** | **GPIO 2** | `/devices/quat_tran` |
| **Điều Hòa** | **GPIO 3** | `/devices/dieu_hoa` |
| **Đèn Sân Vườn** | **GPIO 4** | `/devices/den_san_vuon` |
| **Nút Boot / Reset WiFi** | **GPIO 9** (Mặc định nút bấm trên mạch) | Coi hành trình nhấn giữ 3 giây |

---

## ⚙️ Cấu Hình Nạp Code Trong Arduino IDE

Khi tiến hành nạp code cho ESP32-C3 của bạn qua cổng USB-C trực tiếp, xin hãy chú ý thiết lập cấu hình bảng mạch như sau:

- **Board**: `ESP32C3 Dev Module`
- **USB CDC On Boot**: `Enabled` *(Bắt buộc bật đối với một số kit nạp trực tiếp bằng cáp USB qua chân Type-C để nhận được luồng debug Serial)*
- **Flash Size**: `4MB` (mặc định)
- **Partition Scheme**: `Minimal SPIFFS (Large APPS with OTA)` - Nếu bạn muốn tối ưu không gian lưu trữ cho mã ứng dụng Firebase Client nặng.

---

## 🌐 Cách Kết Nối Thiết Bị Vào Mạng WiFi

1. Sau khi nạp thành công, lần đầu tiên khởi chạy hoặc khi nhấn giữ nút **BOOT** trong **3 giây**, ESP32 sẽ phát ra tín hiệu WiFi riêng có tên: **`ESP32_SmartHome`**
2. Sử dụng điện thoại hoặc máy tính của bạn để kết nối vào luồng mạng WiFi **`ESP32_SmartHome`** với mật khẩu mặc định là **`12345678`**.
3. Một bảng cấu hình tự động hiện lên (Nếu không tự lên, hãy truy cập trình duyệt tại địa chỉ IP: `192.168.4.1`). Tại đây, nhấn **Configure WiFi**, chọn mạng WiFi nhà bạn, nhập mật khẩu mạng đó rồi nhấn **Save**.
4. Thiết bị lưu thông tin, tự động kết nối và bắt đầu đồng bộ thời gian thực mượt mà với Trang Quản Trị Web của bạn thông qua Firebase!
