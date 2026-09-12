/**
 * Backend API cho "Sổ tay kiến thức".
 *
 * Đây là một Cloudflare Worker (chạy miễn phí ở gói Free) dùng
 * Workers KV để lưu dữ liệu. Không có đăng nhập / mật khẩu: bất kỳ
 * ai gọi đúng URL (biết "space id") đều đọc/ghi được — vì vậy chỉ
 * chia sẻ link app (có phần ?s=...) cho người bạn tin tưởng.
 *
 * Route dạng: /{space}/{...phần còn lại}
 *   GET    /{space}/index            -> đọc danh mục chủ đề (mảng JSON)
 *   PUT    /{space}/index            -> ghi danh mục chủ đề
 *   GET    /{space}/notes/{id}       -> đọc 1 ghi chú
 *   PUT    /{space}/notes/{id}       -> ghi 1 ghi chú
 *   DELETE /{space}/notes/{id}       -> xoá 1 ghi chú
 *   GET    /{space}/last             -> đọc ghi chú mở gần nhất
 *   PUT    /{space}/last             -> ghi ghi chú mở gần nhất
 *
 * ---------------------------------------------------------------
 * CÁCH DEPLOY (khoảng 5 phút, không cần thẻ tín dụng):
 * 1) Tạo tài khoản miễn phí tại https://dash.cloudflare.com
 * 2) Vào mục "Workers & Pages" -> "Create" -> "Create Worker".
 *    Đặt tên tuỳ ý, ví dụ: so-tay-kien-thuc-api. Bấm "Deploy".
 * 3) Vào Worker vừa tạo -> tab "Edit code" (hoặc "Quick edit"),
 *    xoá hết code mẫu, dán TOÀN BỘ nội dung file worker.js này vào,
 *    bấm "Save and deploy".
 * 4) Vào tab "Settings" -> "Variables" -> mục "KV Namespace
 *    Bindings" -> "Add binding":
 *      - Variable name: NOTES_KV   (phải gõ đúng chữ hoa/thường này)
 *      - KV namespace: bấm "Create a namespace", đặt tên tuỳ ý
 *        (vd: notes-kv), rồi chọn namespace đó.
 *    Bấm Save/Deploy lại.
 * 5) Copy URL của worker, dạng:
 *      https://so-tay-kien-thuc-api.<ten-tai-khoan>.workers.dev
 *    Dán URL đó vào biến API_BASE ở đầu file app.js.
 * 6) Upload lại index.html / app.js / style.css lên nơi bạn host
 *    (GitHub Pages, v.v...) và dùng như bình thường.
 * ---------------------------------------------------------------
 */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length < 2) {
      return new Response('Thiếu space id hoặc đường dẫn. Dùng dạng /{space}/index hoặc /{space}/notes/{id}.', {
        status: 400,
        headers: cors
      });
    }

    const space = parts[0];
    // Giới hạn định dạng space id để tránh key rác / quá dài
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(space)) {
      return new Response('Space id không hợp lệ.', { status: 400, headers: cors });
    }

    const key = space + ':' + parts.slice(1).join('/');

    try {
      if (request.method === 'GET') {
        const value = await env.NOTES_KV.get(key);
        if (value === null) {
          return new Response('Không tìm thấy.', { status: 404, headers: cors });
        }
        return new Response(value, {
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }

      if (request.method === 'PUT') {
        const body = await request.text();
        // Kiểm tra body là JSON hợp lệ trước khi lưu
        try { JSON.parse(body); } catch (e) {
          return new Response('Body phải là JSON hợp lệ.', { status: 400, headers: cors });
        }
        await env.NOTES_KV.put(key, body);
        return new Response('OK', { headers: cors });
      }

      if (request.method === 'DELETE') {
        await env.NOTES_KV.delete(key);
        return new Response('OK', { headers: cors });
      }

      return new Response('Method không được hỗ trợ.', { status: 405, headers: cors });
    } catch (e) {
      return new Response('Lỗi máy chủ: ' + (e && e.message ? e.message : String(e)), {
        status: 500,
        headers: cors
      });
    }
  }
};
