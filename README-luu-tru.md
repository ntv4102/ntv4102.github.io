# Đã đổi sang lưu trữ 100% qua API (tự host)

## Vì sao phải đổi
Bản trước lưu ưu tiên GitHub token > thư mục trên máy > trình duyệt
(localStorage). Nhược điểm: mỗi thiết bị phải "kết nối" lại (chọn
thư mục, hoặc nhập token GitHub) mới thấy được đúng dữ liệu, và nếu
không kết nối gì thì dữ liệu chỉ nằm trong trình duyệt của MÁY ĐÓ —
mở trên máy khác sẽ thấy trống.

## Cách hoạt động bây giờ
- Không còn thư mục trên máy, không còn token GitHub, không còn
  localStorage làm nơi lưu chính.
- Mọi thao tác đọc/ghi đều gọi thẳng tới một **API riêng** (`app.js`
  gọi `API_BASE`).
- Lần đầu mở trang, app tự sinh một mã ngẫu nhiên gắn vào địa chỉ
  dạng `...index.html?s=abcxyz123`. Đây gọi là **space id**.
- Bạn mở đúng URL đó (có phần `?s=...`) trên bất kỳ thiết bị nào
  → thấy và sửa được **ngay lập tức**, không cần đăng nhập, không
  cần bấm "kết nối" gì cả.
- Bấm nút **"🔗 Sao chép link chia sẻ"** ở cuối danh sách bên trái
  để lấy đúng URL này gửi cho thiết bị khác / người khác.

## Lưu ý quan trọng về quyền truy cập
Vì không có đăng nhập, **ai cầm được URL đầy đủ (có `?s=...`) đều
có toàn quyền xem VÀ sửa/xoá dữ liệu** — đúng như bạn yêu cầu. Hệ
quả:
- Chỉ chia sẻ link cho người bạn thực sự tin tưởng.
- Đừng đăng công khai link đó (Facebook, nhóm chat công khai, v.v.)
  nếu không muốn người lạ sửa/xoá ghi chú của bạn.
- Ai đoán được (hoặc lấy được) mã `s=...` cũng vào được, dù không
  có "mật khẩu" nào khác chặn lại.

## Bạn cần tự deploy 1 backend nhỏ (miễn phí, ~5 phút)
Vì đây là các file tĩnh (HTML/CSS/JS, ví dụ host trên GitHub Pages),
bản thân chúng không thể "tự lưu" — cần một API thật ở đâu đó để
nhận request đọc/ghi. File **`worker.js`** đi kèm là code sẵn sàng
dán vào Cloudflare Workers (gói Free, không cần thẻ tín dụng).
Hướng dẫn từng bước nằm ngay trong phần comment ở đầu `worker.js`.

Sau khi deploy xong, mở `app.js`, tìm dòng:

```js
var API_BASE = 'https://REPLACE-WITH-YOUR-WORKER-URL.workers.dev';
```

và thay bằng URL worker thật của bạn, rồi upload lại `index.html`,
`app.js`, `style.css` lên nơi bạn host.

## Việc gì vẫn giữ nguyên
- Nút "Xuất sao lưu" / "Nhập lại" vẫn còn — dùng để tải một bản
  `.json` về máy làm bản sao lưu thủ công, phòng khi cần khôi phục.
- Toàn bộ trình soạn thảo, bảng, mục Đúng/Sai... không đổi gì.
