# Điểm mới trong Zablind Phiên bản v2.1.1

Bản cập nhật v2.1.1 tập trung vào cải tiến vượt trội cho tính năng chia sẻ tin nhắn, khôi phục hệ thống thông báo hệ thống và vá lỗi hiển thị bộ cài đặt.

---

## 1. Tính năng Chia sẻ và Chuyển tiếp tin nhắn (Chi tiết cách sử dụng)

Tính năng chia sẻ tin nhắn hiện đã được tối ưu hóa khả năng truy cập toàn diện bằng bàn phím và phản hồi giọng nói (đọc trạng thái).

### Cách sử dụng chi tiết:
1. **Mở hộp thoại Chia sẻ**: Nhấp vào nút "Chia sẻ" (hoặc chọn từ menu ngữ cảnh của tin nhắn). Hộp thoại chia sẻ của Zalo sẽ hiển thị.
2. **Kích hoạt chế độ kiểm soát**: Zablind sẽ tự động khóa tiêu điểm bên trong hộp thoại (Context: `share_modal`) để tránh bấm nhầm phím ra bên ngoài. Trình đọc màn hình sẽ thông báo: *"Chia sẻ tin nhắn. Hộp thoại đang hiển thị."* và tiêu điểm được đặt ngay vào ô Tìm kiếm.
3. **Di chuyển giữa các thành phần (Tab / Shift + Tab)**:
   * **Nút Đóng**: Thoát hộp thoại.
   * **Ô Tìm kiếm**: Nhập tên bạn bè hoặc nhóm để lọc nhanh danh sách.
   * **Các thẻ (Tabs)**: Di chuyển giữa các danh mục bạn bè, nhóm hoặc liên hệ gần đây.
   * **Danh sách liên hệ**: Danh sách những người bạn muốn chia sẻ tin nhắn.
   * **Ô nhập nội dung gửi kèm**: Nhập tin nhắn văn bản đi kèm với tệp/tin nhắn được chia sẻ.
   * **Nút Hủy**: Hủy bỏ thao tác.
   * **Nút Chia sẻ**: Xác nhận gửi tin nhắn đến các liên hệ đã chọn.
4. **Điều hướng danh sách liên hệ (Arrow Down / Arrow Up)**: Khi tiêu điểm đang ở danh sách liên hệ, sử dụng phím **Mũi tên xuống** hoặc **Mũi tên lên** để duyệt qua từng người. Zablind sẽ tự động đọc tên liên hệ kèm theo trạng thái hiện tại (ví dụ: *"Nguyễn Văn A. Chưa chọn"*).
5. **Chọn/Bỏ chọn liên hệ (Space / Enter)**: Nhấn phím **Khoảng trắng (Space)** hoặc **Enter** để đánh dấu chọn hoặc bỏ chọn liên hệ đó. Zablind sẽ lập tức thông báo trạng thái cập nhật (ví dụ: *"Nguyễn Văn A. Đã chọn"* hoặc *"Nguyễn Văn A. Đã bỏ chọn"*). Bạn có thể chọn nhiều liên hệ cùng lúc.
6. **Đóng hộp thoại nhanh (Escape)**: Nhấn phím **Esc** bất kỳ lúc nào để đóng hộp thoại chia sẻ và tự động đưa tiêu điểm trở lại cửa sổ trò chuyện chính.

---

## 2. Hệ thống Thông báo Tin nhắn mới & Sửa lỗi Windows Toast Notification

Zablind cung cấp hệ thống thông báo âm thanh (TTS) và thông báo đẩy (Toast Notification) của Windows giúp bạn không bỏ lỡ tin nhắn ngay cả khi Zalo đang chạy dưới nền.

* **Thông báo giọng nói và thông báo đẩy**: Khi có tin nhắn mới, Zablind sẽ đọc thông tin người gửi và nội dung tin nhắn thông qua công cụ đọc màn hình, đồng thời đẩy một thông báo native của Windows (Windows Toast Notification) ở góc dưới màn hình.
* **Khắc phục lỗi mất thông báo hệ thống**: Trong phiên bản v2.1.0, việc Zablind tùy biến tiêu đề cửa sổ Zalo (`document.title`) đã vô tình làm mất liên kết giữa Zalo và hệ thống thông báo native của hệ điều hành Windows. Ở phiên bản v2.1.1 này, chúng tôi đã khôi phục tiêu đề cửa sổ tiêu chuẩn, giúp các thông báo native của hệ thống hoạt động chính xác và ổn định 100%.

---

## 3. Các sửa lỗi và cải tiến khác

* **Hiển thị thông tin phiên bản**: Thêm thông tin phiên bản rõ ràng trong Hộp thoại Trợ giúp Zablind (`Ctrl + H`) với tiêu đề `"Zablind Accessibility Suite - v2.1.1"`, tương thích hoàn toàn với trình đọc màn hình.
* **Sửa lỗi hiển thị chữ lỗi trên Bộ cài đặt**: Khắc phục hiện tượng hiển thị sai ký tự tiếng Việt và lỗi hiển thị biểu tượng bản quyền (`Minh Tri Nguyen © 2026`) trên giao diện bộ cài đặt Windows (`Segoe UI` ClearType).
