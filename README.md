# Sổ tay kiến thức — README tổng quan

Ứng dụng ghi chú cá nhân dạng trang tĩnh (HTML/CSS/JS thuần, không
build tool, không framework). Chạy được trên bất kỳ hosting tĩnh
nào (GitHub Pages, Netlify, Cloudflare Pages, VPS...). Dữ liệu được
lưu qua một API riêng (không còn phụ thuộc trình duyệt/thiết bị).

## 1. Cấu trúc file

```
so-tay-kien-thuc/
├─ index.html              Khung giao diện (sidebar, toolbar, editor, các modal)
├─ style.css               Toàn bộ giao diện/định dạng
├─ app.js                  Toàn bộ logic: lưu trữ, soạn thảo, bảng, danh sách...
├─ worker.js                Code backend (Cloudflare Worker) — deploy riêng, KHÔNG upload lên host tĩnh
├─ so-tay-kien-thuc-backup.json   Bản xuất sao lưu mẫu (từ nút "Xuất sao lưu")
├─ index.json, notes/*.json      Dữ liệu mẫu cũ (không còn được app đọc trực tiếp — xem mục 2)
└─ README.md               File này
```

`worker.js` không phải một phần của trang web — đây là code bạn dán
vào Cloudflare Workers để tạo ra API riêng, xem mục 3.

## 2. Cơ chế lưu trữ dữ liệu

### 2.1. Trước đây vs hiện tại
Bản đầu tiên ưu tiên lưu theo thứ tự: GitHub (qua token) > thư mục
thật trên máy (File System Access API) > localStorage của trình
duyệt. Nhược điểm: mỗi thiết bị phải tự "kết nối" lại mới thấy đúng
dữ liệu, và nếu không kết nối gì thì dữ liệu chỉ nằm trong ĐÚNG một
trình duyệt của MỘT máy.

Hiện tại, **toàn bộ lưu trữ đi qua một API riêng** — không còn thư
mục trên máy, không còn token GitHub, không còn localStorage làm
nơi lưu chính. Mở đúng trang này ở bất kỳ thiết bị/trình duyệt nào
cũng thấy và sửa được cùng một dữ liệu.

### 2.2. "Không gian dữ liệu" (space id)
- Trong `app.js` có biến `DEFAULT_SPACE_ID` — một chuỗi cố định,
  đóng vai trò như "ngăn kéo" chứa toàn bộ ghi chú của bạn.
- Mở trang bằng **URL trơn** (không cần thêm gì phía sau, ví dụ
  `https://ntv4102.github.io`) → app luôn dùng `DEFAULT_SPACE_ID`
  → luôn thấy lại đúng dữ liệu cũ.
- Nếu muốn tạo thêm một "sổ tay" độc lập khác dùng chung code/host
  này (ví dụ cho người khác, không lẫn dữ liệu với sổ tay chính),
  mở kèm `?s=mot-ma-tuy-y` ở cuối URL — mỗi giá trị `s` khác nhau
  là một không gian dữ liệu hoàn toàn riêng biệt.
- **Không được đổi `DEFAULT_SPACE_ID` sau khi đã có dữ liệu** — đổi
  là coi như chuyển sang một sổ tay trống khác (dữ liệu cũ vẫn còn
  trong KV dưới mã cũ, chỉ là trang sẽ không tự trỏ tới nó nữa).

### 2.3. Luồng đọc/ghi
Mọi thao tác đọc/ghi trong `app.js` đi qua object `Api` (khoảng đầu
file), gọi các endpoint dạng:

| Việc | Gọi tới |
|---|---|
| Đọc danh mục chủ đề (hiện ở sidebar) | `GET {API_BASE}/{space}/index` |
| Ghi danh mục chủ đề | `PUT {API_BASE}/{space}/index` |
| Đọc nội dung 1 ghi chú | `GET {API_BASE}/{space}/notes/{id}` |
| Ghi nội dung 1 ghi chú | `PUT {API_BASE}/{space}/notes/{id}` |
| Xoá 1 ghi chú | `DELETE {API_BASE}/{space}/notes/{id}` |
| Đọc/ghi "ghi chú mở gần nhất" (để mở lại đúng note khi quay lại) | `GET`/`PUT {API_BASE}/{space}/last` |

`{space}` chính là `DEFAULT_SPACE_ID` (hoặc `?s=...` nếu có). Toàn
bộ ghi chú của một không gian dữ liệu đều hiện đủ trong sidebar bên
trái cùng lúc — không có khái niệm "link riêng cho từng note".

### 2.4. Backend (Worker)
`API_BASE` trong `app.js` trỏ tới một Cloudflare Worker (file
`worker.js`) dùng Workers KV để lưu key-value. **Không có xác thực**
— ai gọi đúng URL + đúng space id là đọc/ghi được, kể cả xoá. Đây
là đánh đổi có chủ đích: đơn giản, không cần đăng nhập, nhưng đồng
nghĩa ai có link là có toàn quyền.

Hướng dẫn deploy Worker + gắn KV namespace nằm trong comment đầu
file `worker.js` (đăng ký Cloudflare miễn phí → tạo Worker → dán
code → tạo KV namespace → gắn binding tên `NOTES_KV` → copy URL
worker dán vào `API_BASE`).

### 2.5. Lưu khi mất mạng / đóng trang đột ngột
- Ctrl+S / Cmd+S lưu ngay lập tức; tự động lưu định kỳ mỗi 1 phút
  nếu có thay đổi (xem `scheduleSave()` / `doSave()`).
- Khi đóng tab lúc đang có thay đổi chưa lưu, trang cố gắng gọi API
  lưu lần cuối bằng `fetch(..., { keepalive: true })` (xem sự kiện
  `beforeunload`) — không dùng localStorage làm bản dự phòng nữa.
- Nếu API lỗi/mất mạng, thanh trạng thái (góc dưới bên trái, id
  `storage-status-text`) báo rõ; nút "Xuất sao lưu" cho phép tải
  toàn bộ dữ liệu hiện có ra 1 file `.json` để giữ thủ công.

## 3. Sao lưu / khôi phục thủ công
- **Xuất sao lưu**: gom toàn bộ `index` + nội dung từng ghi chú
  thành 1 file `so-tay-kien-thuc-backup.json`, tải về máy.
- **Nhập lại**: đọc lại file `.json` đó (đúng định dạng `{ index,
  notes }`), ghi đè/thêm vào không gian dữ liệu hiện tại qua API.
- Đây là lớp an toàn thủ công duy nhất còn lại — nên thỉnh thoảng
  xuất 1 bản, đề phòng lỡ tay xoá hoặc backend gặp sự cố.

## 4. Tính năng soạn thảo (không liên quan lưu trữ)
- Toolbar: tiêu đề H1/H2/H3, in đậm/nghiêng/gạch chân, căn lề
  ngang/dọc, danh sách chấm/số/chữ cái, trích dẫn.
- Mục tự kiểm tra Đúng/Sai: cả dòng (`.kb-check`) hoặc icon nhỏ gắn
  bất kỳ đâu, bấm để chuyển trạng thái `? → ✓ → ✕`.
- Bảng: chèn nhanh, kéo đổi độ rộng cột/chiều cao hàng, căn lề từng
  ô/cột, hỗ trợ chọn nhiều ô (`getSelectedCells`).
- Dán nội dung từ Word/Google Docs/web/ChatGPT: tự làm sạch font/
  định dạng lạ, quy về kiểu chuẩn của trang (`cleanPastedHTML`,
  `convertPseudoListParagraphs`); dán ảnh từ clipboard tự chèn thành
  hình minh hoạ (`insertPastedImageFigure`).

## 5. Rủi ro cần biết
- Không có đăng nhập/mật khẩu — ai có URL (kèm `?s=` nếu dùng) đều
  sửa/xoá được, không có lịch sử phiên bản để khôi phục.
- KV là lưu trữ "eventually consistent" — hai người sửa gần như
  cùng lúc, bản sau có thể ghi đè bản trước mà không cảnh báo.
- Đừng đăng công khai link (mạng xã hội, nhóm chat công khai...)
  nếu không muốn người lạ chỉnh sửa nội dung.

## 6. Tuỳ biến nhanh
- Đổi tên/tiêu đề trang: sửa thẻ `<title>` và `.mark` trong
  `index.html`.
- Đổi giao diện: `style.css` (biến CSS ở đầu file, nếu có).
- Đổi nơi lưu trữ: chỉ cần sửa `API_BASE` — không đụng gì khác
  trong toàn bộ phần soạn thảo.
