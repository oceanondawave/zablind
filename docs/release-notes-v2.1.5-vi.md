# Điểm mới trong Zablind v2.1.5

Bản cập nhật v2.1.5 tập trung sửa triệt để các lỗi ảnh hưởng đến độ ổn định khi Zalo tự cập nhật và khi nghe gọi bằng bàn phím với trình đọc màn hình.

---

## 1. Tự động cài đặt Zalo tương thích & chặn tự cập nhật

* **Tự động tải và cài Zalo 26.11.12**: Khi cài Zablind, nếu máy chưa có Zalo hoặc đang cài bản Zalo mới từ `26.11.20` trở lên (đã bị khóa chỉnh sửa giao diện), bộ cài sẽ tự động tải về bản **Zalo 26.11.12** có chữ ký số chính thức để cài đặt.
* **Ngăn Zalo tự cập nhật lên bản bị khóa**: Zablind v2.1.5 tự động giữ Zalo ở phiên bản **26.11.12** tương thích, chặn kiểm tra và tải ngầm các bản cập nhật mới — vì nếu cập nhật lên bản Zalo mới hơn thì Zablind sẽ không hoạt động.
* **Lưu ý dành cho người dùng**: Hiện chưa có cách cài Zablind lên Zalo mới và tác giả vẫn đang nghiên cứu giải pháp, nên dùng **Zalo 26.11.12** hiện là cách duy nhất để sử dụng Zablind. Bản Zalo cũ này không có các tính năng mới hay bản vá bảo mật mới nhất từ Zalo; người dùng cân nhắc và tự chịu trách nhiệm khi sử dụng. Nếu muốn tự cài thủ công trước, bạn có thể tải tại https://download.com.vn/download/zalo-83959?linkid=88362.
* **Nhận biết an toàn & ổn định**: Bảo vệ không cài đè nhầm lên bản Zalo bị khóa, tự khôi phục bản gốc nếu gặp xung đột, và giữ tiến trình hỗ trợ xuyên suốt khi Zalo khởi động lại.

---

## 2. Nghe gọi gọn nhẹ, hết lỗi đọc nhầm

* **Khắc phục triệt để lỗi trình đọc màn hình đọc nhầm hoặc nhảy sai** khi bấm phím nhận (`A`, `Ctrl + A`, `Ctrl + Shift + A`) hay từ chối cuộc gọi (`D`).
* **Chỉ hoạt động đúng lúc**: Tất cả các phím tắt cuộc gọi (`A`, `Ctrl + A`, `Ctrl + Shift + A`, `D`, `C`, `M`, `E`) và phần đọc thông báo trạng thái cuộc gọi chỉ kích hoạt khi cửa sổ cuộc gọi Zalo đang mở trên màn hình, tránh bấm nhầm khi đang gõ tin nhắn hoặc dùng ứng dụng khác.

---

## 3. Gọn nhẹ hơn, dễ hiểu hơn

* **Loại bỏ tính năng thông báo đẩy tự chế (`Ctrl + Shift + J`)**: Vì các phiên bản Zalo máy tính mới đã hiển thị thông báo trên Windows rất ổn định, Zablind lược bỏ phần thông báo riêng để tránh đọc trùng lặp và nhẹ máy hơn.
* **Cập nhật lời hướng dẫn trong bảng phím tắt (`Ctrl + Shift + H`)**: Viết lại mô tả các phím tắt bằng câu chữ gần gũi, dễ hiểu hơn.
