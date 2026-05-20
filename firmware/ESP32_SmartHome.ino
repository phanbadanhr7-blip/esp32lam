/*
 * =====================================================================================
 *  ESP32-C3 - Smart Home Firmware (UPDATED VERSION)
 *  Integrated with Firebase Realtime Database & WiFiManager AP Portal
 * =====================================================================================
 *  Sử dụng cho Đồ án / Thiết bị Smart Home với Dashboard Web hoàn chỉnh.
 *  
 *  Thư viện yêu cầu cài đặt trong Arduino IDE (Library Manager):
 *    - Firebase ESP Client  by Mobizt  (phiên bản >= 4.4.x)
 *    - WiFiManager          by tzapu   (phiên bản >= 2.0.x)
 *    - ArduinoJson          by Benoit Blanchon
 *
 *  Cấu hình Board trong Arduino IDE:
 *    - Board: ESP32C3 Dev Module
 *    - USB CDC On Boot: Enabled (nếu nạp qua cổng USB trực tiếp của chip)
 * =====================================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Firebase_ESP_Client.h>

// ── CẤU HÌNH FIREBASE REALTIME DATABASE ──────────────────────────────────────────────
#define DATABASE_URL     "https://esp32-f210f-default-rtdb.asia-southeast1.firebasedatabase.app"
#define DATABASE_API_KEY "AIzaSyAKR90UMhbD5ScOYEFMEQxqh60JjTa_4fo"

// ── CẤU HÌNH GPIO RELAY (Logic Kích mức THẤP - Active LOW: LOW=BẬT, HIGH=TẮT) ────────
#define RELAY_1   1   // Đèn Phòng Khách (den_phong_khach)
#define RELAY_2   2   // Quạt Trần (quat_tran)
#define RELAY_3   3   // Điều Hòa (dieu_hoa)
#define RELAY_4   4   // Đèn Sân Vườn (den_san_vuon)

// ── NÚT PHỤ TRỢ (Bấm giữ 3 giây để xóa cấu hình WiFi kết nối lại) ────────────────────
#define BTN_BOOT       9   // Chân nút nhấn BOOT mặc định trên ESP32-C3
#define BOOT_HOLD_MS   3000UL

// ── TIMING & HEARTBEAT ──────────────────────────────────────────────────────────────
#define HEARTBEAT_MS   10000UL   // Gửi tín hiệu online lên Firebase định kỳ mỗi 10 giây
#define AP_TIMEOUT_S   180       // Thời gian chờ ở trang cấu hình WiFi trước khi thoát (3 phút)

// ─────────────────────────────────────────────────────────────────────────────────────

FirebaseData   fbStream;
FirebaseData   fbSet;
FirebaseAuth   auth;
FirebaseConfig config;

WiFiManager wm;

const uint8_t RELAY_PINS[4] = { RELAY_1, RELAY_2, RELAY_3, RELAY_4 };
const char*   DEV_IDS[4]    = {
  "den_phong_khach", "quat_tran", "dieu_hoa", "den_san_vuon"
};
const char*   DEV_NAMES[4]  = {
  "Den Phong Khach", "Quat Tran", "Dieu Hoa", "Den San Vuon"
};

bool   deviceState[4]  = {false, false, false, false};
bool   fbReady         = false;
bool   streamActive    = false;
unsigned long lastHeartbeat = 0;
unsigned long bootTimer     = 0;

// ═════════════════════════════════════════════════════════════════════════════════════
//  ĐIỀU KHIỂN RELAY
// ═════════════════════════════════════════════════════════════════════════════════════
void setRelay(uint8_t idx, bool on) {
  deviceState[idx] = on;
  // Thiết bị sử dụng Relay kích mức Thấp: on=true -> LOW, on=false -> HIGH
  digitalWrite(RELAY_PINS[idx], on ? LOW : HIGH);
  Serial.printf("[RELAY] %s -> %s (chân %d = %s)\n",
    DEV_NAMES[idx], on ? "BAT" : "TAT",
    RELAY_PINS[idx], on ? "LOW (BAT)" : "HIGH (TAT)");
}

// ═════════════════════════════════════════════════════════════════════════════════════
//  FIREBASE STREAM CALLBACK (Lắng nghe dữ liệu thay đổi thời gian thực)
// ═════════════════════════════════════════════════════════════════════════════════════
void streamCallback(FirebaseStream data) {
  String path = data.dataPath();
  String type = data.dataType();

  Serial.printf("[STREAM UPDATE] Path: %s | Type: %s\n", path.c_str(), type.c_str());

  if (type == "boolean") {
    bool val = data.boolData();
    for (int i = 0; i < 4; i++) {
      String devPath = "/" + String(DEV_IDS[i]);
      if (path == devPath) {
        setRelay(i, val);
        return;
      }
    }
  }

  if (type == "json" || path == "/") {
    // Nhận cấu hình tất cả các thiết bị cùng lúc (lần đầu khởi chạy hoặc sync nguyên nhánh)
    FirebaseJsonData result;
    FirebaseJson& json = data.jsonObject();
    for (int i = 0; i < 4; i++) {
      if (json.get(result, DEV_IDS[i]) && result.type == "boolean") {
        setRelay(i, result.boolValue);
      }
    }
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("[STREAM] Stream bị hết thời gian (timeout) - Đang tự động kết nối lại...");
  }
  if (!fbStream.httpConnected()) {
    Serial.println("[STREAM] Mất kết nối HTTP Stream");
    streamActive = false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════
//  KHỞI TẠO VÀ CẤU HÌNH KHAI BÁO HOẠT ĐỘNG FIREBASE
// ═════════════════════════════════════════════════════════════════════════════════════
void initFirebase() {
  config.database_url = DATABASE_URL;
  config.api_key = DATABASE_API_KEY;

  Firebase.begin(&config, &auth);
  // Sử dụng reconnectWiFi để tăng độ tương thích với các Kit ESP32 cũ/mới
  Firebase.reconnectWiFi(true);

  Serial.println("[FB-CONNECT] Dang khoi tao Firebase...");
  delay(2000);

  // Bắt đầu đồng bộ dòng dữ liệu (Stream) ngay khi mạng đã có sẵn
  if (Firebase.RTDB.beginStream(&fbStream, "/devices")) {
    Firebase.RTDB.setStreamCallback(&fbStream, streamCallback, streamTimeoutCallback);
    streamActive = true;
    fbReady = true;
    Serial.println("[STREAM] Bat dau dong bo /devices THANH CONG");
  } else {
    fbReady = false;
    streamActive = false;
    Serial.printf("[STREAM] Loi beginStream: %s\n", fbStream.errorReason().c_str());
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════
//  SETUP (KHỞI CHẠY HỆ THỐNG MỘT LẦN)
// ═════════════════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=============================================");
  Serial.println("  ESP32-C3 SMART HOME PLATFORM STARTING...   ");
  Serial.println("=============================================");

  // Khởi tạo trạng thái các chân Relay (Ban đầu tắt hết - logic Mức Cao HIGH)
  for (int i = 0; i < 4; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], HIGH); 
  }
  pinMode(BTN_BOOT, INPUT_PULLUP);

  // ── KIỂM TRA NÚT BOOT ĐỂ XÓA THÔNG TIN WIFI CŨ (CẤU HÌNH LẠI) ───────────────────────
  Serial.println("[BOOT] Nhấn giữ nút BOOT trong 3 giây nếu muốn cấu hình WiFi mới...");
  unsigned long bootPressedStart = millis();
  bool triggerWiFiReset = true;
  while (millis() - bootPressedStart < BOOT_HOLD_MS) {
    if (digitalRead(BTN_BOOT) == HIGH) { 
      triggerWiFiReset = false; 
      break; 
    }
    delay(50);
  }
  if (triggerWiFiReset) {
    Serial.println("[BOOT] Da kich hoat xoa thong tin WiFi! Dang khoi dong lai...");
    wm.resetSettings();
    delay(1000);
    ESP.restart();
  }

  // ── GIẢI PHÁP WIFIMANAGER: TỰ ĐỘNG KẾT NỐI / PHÁT PORTAL ĐIỂM TRUY CẬP AP ──────────
  wm.setConfigPortalTimeout(AP_TIMEOUT_S);
  wm.setConnectTimeout(25);
  wm.setAPCallback([](WiFiManager* wm) {
    Serial.println("[AP-PORTAL] Khong tim thay mang cu hoac ket noi failure!");
    Serial.println("[AP-PORTAL] Da phat diem truy cap WiFi: ESP32_SmartHome");
    Serial.println("[AP-PORTAL] Hay ket noi vao 192.168.4.1 - mat khau: 12345678");
  });

  // Tên điểm phát sóng AP cấu hình WiFi mặc định: "ESP32_SmartHome" mật khẩu "12345678"
  if (!wm.autoConnect("ESP32_SmartHome", "12345678")) {
    Serial.println("[WIFI] That bai khi thiet lap ket noi - tiep tuc chay Offline...");
  } else {
    Serial.printf("[WIFI] Ket noi thanh cong! IP Thiet bi nhan: %s\n", WiFi.localIP().toString().c_str());
    initFirebase();
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════
//  LOOP (VÒNG LẶP TUẦN HOÀN XỬ LÝ SỰ KIỆN CHÍNH)
// ═════════════════════════════════════════════════════════════════════════════════════
void loop() {

  // ── NÚT BẤM RESET TRÊN THIẾT BỊ ───────────────────────────────────────────────────
  if (digitalRead(BTN_BOOT) == LOW) {
    if (bootTimer == 0) bootTimer = millis();
    if (millis() - bootTimer > BOOT_HOLD_MS) {
      Serial.println("[BOOT] Xoa bo nho WiFi va khoi dong lai!");
      wm.resetSettings();
      delay(500);
      ESP.restart();
    }
  } else {
    bootTimer = 0;
  }

  // ── NHỊP TIM ĐỒNG BỘ HEARTBEAT (Báo cáo thiết bị đang trực tuyến - status/online = true) ─────
  if (fbReady && WiFi.status() == WL_CONNECTED) {
    if (millis() - lastHeartbeat > HEARTBEAT_MS) {
      lastHeartbeat = millis();
      // Gửi tín hiệu báo ESP32 đang chạy
      if (Firebase.RTDB.setBool(&fbSet, "/status/online", true)) {
        Serial.println("[HEARTBEAT] status/online = true");
      } else {
        Serial.printf("[HEARTBEAT] Loi ghi status: %s\n", fbSet.errorReason().c_str());
      }
    }
  }

  // ── KHỞI ĐỘNG LẠI LUỒNG STEAM NẾU BỊ MẤT KẾT NỐI KHÁCH QUAN ───────────────────────
  if (fbReady && !streamActive && WiFi.status() == WL_CONNECTED) {
    Serial.println("[STREAM] Phat hien mat luong! Dang thu khoi phuc...");
    if (Firebase.RTDB.beginStream(&fbStream, "/devices")) {
      Firebase.RTDB.setStreamCallback(&fbStream, streamCallback, streamTimeoutCallback);
      streamActive = true;
      Serial.println("[STREAM] Khoi phuc luong thanh cong!");
    } else {
      Serial.printf("[STREAM] Khoi phuc that bai: %s\n", fbStream.errorReason().c_str());
    }
  }

  delay(20); // Tránh chiếm dụng hoàn toàn bộ xử lỹ rảnh, duy trì ổn định cho hệ thống RTOS
}
