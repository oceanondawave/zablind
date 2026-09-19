# Điểm mới trong Zablind v2.1.3

Bản cập nhật v2.1.3 mang đến bước đột phá về tính ổn định của hệ thống gọi thoại/video, bổ sung chế độ điều hướng tự do cho NVDA, quản lý thông báo linh hoạt và tối ưu hóa trải nghiệm đọc tin nhắn không làm gián đoạn việc gõ phím.

---

## 1. Trình xử lý cuộc gọi nâng cao (Enhanced Call Handler)

Hệ thống xử lý cuộc gọi thoại và video trên Zalo PC được nâng cấp toàn diện:

* **Triệt tiêu âm thanh "No next" của NVDA**: Khi có cuộc gọi đến hoặc trong khi đang gọi, các phím tắt cuộc gọi (**A** nhận cuộc gọi, **Ctrl + A** nhận không camera, **D** từ chối cuộc gọi, **C** bật/tắt camera, **M** bật/tắt mic, **E** kết thúc cuộc gọi) được xử lý trực tiếp ở tầng hệ điều hành. NVDA không còn phát ra thông báo *"no next"* khó chịu. Khi không có cuộc gọi, các phím chữ cái này hoạt động hoàn toàn bình thường để soạn thảo tin nhắn.
* **Thông báo nổi ưu tiên cao (Native Toast Notification)**: Banner thông báo cuộc gọi và tin nhắn của Windows dạng thẻ nổi (`scenario="reminder"`) luôn xuất hiện trên màn hình ngay cả khi Zalo đang chạy ngầm, bị thu nhỏ hoặc bạn đang làm việc trên ứng dụng khác.
* **Kiến trúc giám sát tự phục hồi (Never-Fail Architecture)**: Bộ xử lý cuộc gọi tích hợp chu kỳ kiểm tra thích ứng (1 giây khi nhàn rỗi, 150 mili-giây khi có tương tác), tự động phát hiện và khởi động lại dịch vụ nếu Zalo khởi động lại, tiết kiệm tối đa CPU và pin máy tính.

---

## 2. Chế độ điều hướng tự do bằng phím mũi tên (Phím tắt Ctrl + Shift + X)

* **Điều hướng như khi chưa cài Zablind**: Nhấn **Ctrl + Shift + X** để bật hoặc tắt chế độ duyệt tự do (Browse mode) bằng các phím mũi tên dành riêng cho trình đọc màn hình NVDA.
* **Kích hoạt tức thì**: Không cần phải bấm chuyển cửa sổ (`Ctrl + Tab` hay `Alt + Tab`), NVDA sẽ nhận diện và chuyển đổi sang Virtual Buffer ngay khi bạn nhấn phím tắt.
* **An toàn tuyệt đối**:
  - Khi đang ở chế độ điều hướng tự do, các hộp thoại chức năng (chia sẻ, kết bạn, trợ giúp, đồng bộ) vẫn được bảo vệ để điều hướng chuẩn xác.
  - Sửa lỗi kẹt phím Enter vào nút Trợ giúp: Khi tắt chế độ tự do, tiêu điểm sẽ quay trở lại ô nhập tin nhắn hoặc danh sách hội thoại một cách tự nhiên.
  - **Tự động tắt an toàn**: Mỗi khi khởi động lại Zalo, chế độ tự do sẽ tự động chuyển về Tắt để đảm bảo bạn luôn ở trong trạng thái điều hướng Zablind an toàn, dễ dùng nhất.

---

## 3. Bật/Tắt thông báo Windows linh hoạt (Phím tắt Ctrl + Shift + J)

* Nhấn **Ctrl + Shift + J** bất cứ lúc nào trong Zalo để bật hoặc tắt nhanh toàn bộ thông báo Windows Toast của Zablind tùy theo nhu cầu làm việc hay nghỉ ngơi. Zablind sẽ phát thông báo bằng giọng đọc trạng thái đã Bật hoặc Tắt.

---

## 4. Đọc tin nhắn mới không cướp tiêu điểm

* Khi đang nhắn tin trong một cuộc trò chuyện, nếu bạn bè gửi tin nhắn mới đến, NVDA vẫn sẽ tự động đọc to nội dung tin nhắn, nhưng con trỏ chuột và tiêu điểm bàn phím **vẫn giữ nguyên ở ô nhập tin nhắn**. Bạn có thể tiếp tục gõ văn bản liền mạch mà không bị gián đoạn hay mất chữ.
* Bất cứ lúc nào bạn muốn xem lại tin nhắn mới nhất, chỉ cần nhấn **Ctrl + Shift + R** hoặc nhấn **Mũi tên xuống** từ danh sách tin nhắn.

---

## 5. Quản lý và Tự động cập nhật

* Nhấn **Ctrl + Shift + U** để mở cửa sổ kiểm tra và quản lý cập nhật. Hệ thống tự động kiểm tra phiên bản mới nhất từ GitHub và thông báo bằng giọng đọc rõ ràng.
