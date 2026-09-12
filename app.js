(function(){
  "use strict";

  var els = {
    app: document.getElementById('app'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    list: document.getElementById('note-list'),
    search: document.getElementById('search'),
    newBtn: document.getElementById('new-note-btn'),
    noNote: document.getElementById('no-note'),
    noNoteCreate: document.getElementById('no-note-create'),
    noteView: document.getElementById('note-view'),
    main: document.getElementById('main'),
    title: document.getElementById('title-input'),
    updatedAt: document.getElementById('updated-at'),
    saveState: document.getElementById('save-state'),
    editor: document.getElementById('editor'),
    toolbar: document.getElementById('toolbar'),
    btnCheck: document.getElementById('btn-check'),
    btnIcon: document.getElementById('btn-icon'),
    btnTable: document.getElementById('btn-table'),
    btnClearFormat: document.getElementById('btn-clear-format'),
    btnListAlpha: document.getElementById('btn-list-alpha'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importInput: document.getElementById('import-input'),
    modalBg: document.getElementById('modal-bg'),
    modalText: document.getElementById('modal-text'),
    modalOk: document.getElementById('modal-ok'),
    modalCancel: document.getElementById('modal-cancel'),
    storageStatusText: document.getElementById('storage-status-text'),
    copyLinkBtn: document.getElementById('copy-link-btn')
  };

  var state = { index: [], currentId: null, saveTimer: null, dirty: false, isSaving: false, lastTableCell: null, selectedCells: [] };

  function setSidebarOpen(open){
    els.app.classList.toggle('sidebar-open', open);
    els.sidebarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    els.sidebarToggle.setAttribute('aria-label', open ? 'Đóng danh sách chủ đề' : 'Mở danh sách chủ đề');
  }

  function uid(){ return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function fmtTime(ts){
    var d = new Date(ts);
    return d.toLocaleString('vi-VN', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
  }

  /* =========================================================
     LƯU TRỮ — 100% qua một API riêng do bạn tự host (không còn
     lưu ra thư mục trên máy, không dùng token GitHub, không dùng
     localStorage làm nơi lưu chính).

     Cách hoạt động:
     - Có một "không gian dữ liệu" MẶC ĐỊNH, cố định (DEFAULT_SPACE_ID
       bên dưới) — mở đúng trang này (URL trơn, không cần gắn thêm
       gì) là luôn thấy lại toàn bộ ghi chú cũ, trên bất kỳ thiết bị
       nào. Không còn sinh mã ngẫu nhiên mỗi lần mở nữa.
     - Nếu muốn tách riêng một "sổ tay" khác dùng chung code/host
       này (ví dụ cho người khác dùng độc lập), mở kèm ?s=mot-ma-tuy-y
       ở cuối URL — không gắn ?s thì luôn dùng không gian mặc định.
     - Ai có URL (kèm hoặc không kèm ?s=...) đều đọc/ghi được ngay —
       không cần đăng nhập. Đừng đăng công khai link nếu không muốn
       người lạ sửa nội dung.
     - Bạn cần tự deploy một backend nhỏ (miễn phí) để nhận các
       lệnh đọc/ghi này — xem file worker.js đi kèm và hướng dẫn
       deploy Cloudflare Worker + KV. Sau khi deploy xong, dán URL
       worker vào API_BASE bên dưới.
     ========================================================= */

  var API_BASE = 'https://so-tay-kien-thuc-ap.ntv-4102.workers.dev';

  // Mã không gian dữ liệu mặc định — cố định, không đổi mỗi lần mở.
  // Có thể đổi thành chuỗi khác nếu muốn, nhưng chỉ đổi 1 LẦN DUY NHẤT
  // rồi giữ nguyên mãi mãi, vì đổi lại sẽ như "mở sổ tay trống mới".
  var DEFAULT_SPACE_ID = 'mty0axhm2wolzh9y';

  function getOrCreateSpaceId(){
    var params = new URLSearchParams(location.search);
    var s = params.get('s');
    if(s && /^[A-Za-z0-9_-]{6,64}$/.test(s)) return s;
    return DEFAULT_SPACE_ID;
  }
  var SPACE_ID = getOrCreateSpaceId();
  var apiBroken = false; // true nếu không gọi được API (sai API_BASE, mất mạng, worker lỗi...)

  function apiUrl(path){
    return API_BASE.replace(/\/+$/, '') + '/' + encodeURIComponent(SPACE_ID) + '/' + path;
  }

  async function apiFetch(path, options){
    try{
      var res = await fetch(apiUrl(path), options);
      if(!res.ok){
        apiBroken = true;
        throw new Error('API ' + res.status + ' ' + res.statusText);
      }
      apiBroken = false;
      return res;
    }catch(e){
      apiBroken = true;
      if(e instanceof TypeError){
        throw new Error('Không kết nối được API. Kiểm tra API_BASE, HTTPS và CORS.');
      }
      throw e;
    }
  }

  function shareLink(){ return location.href; }

  var Api = {
    async getIndex(){
      try{
        var res = await fetch(apiUrl('index'));
        if(res.status === 404){ apiBroken = false; return []; }
        if(!res.ok) throw new Error('index ' + res.status);
        apiBroken = false;
        return await res.json();
      }catch(e){ apiBroken = true; return []; }
    },
    async putIndex(arr){
      await apiFetch('index', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(arr)
      });
    },
    async getNote(id){
      try{
        var res = await fetch(apiUrl('notes/' + encodeURIComponent(id)));
        if(res.status === 404){ apiBroken = false; return null; }
        if(!res.ok) throw new Error('note ' + res.status);
        apiBroken = false;
        return await res.json();
      }catch(e){ apiBroken = true; return null; }
    },
    async putNote(id, data){
      await apiFetch('notes/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    },
    async deleteNote(id){
      try{
        await fetch(apiUrl('notes/' + encodeURIComponent(id)), { method: 'DELETE' });
      }catch(e){}
    },
    async getLast(){
      try{
        var res = await fetch(apiUrl('last'));
        if(!res.ok) return null;
        var j = await res.json();
        return j && j.id ? j.id : null;
      }catch(e){ return null; }
    },
    async setLast(id){
      try{
        await fetch(apiUrl('last'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id })
        });
      }catch(e){}
    }
  };

  async function loadIndex(){
    state.index = await Api.getIndex();
  }
  async function saveIndex(){
    await Api.putIndex(state.index);
    updateStorageStatusUI();
  }
  async function loadNote(id){
    return await Api.getNote(id);
  }
  async function saveNote(id, data){
    await Api.putNote(id, data);
    updateStorageStatusUI();
  }
  async function deleteNoteStorage(id){
    await Api.deleteNote(id);
  }

  function updateStorageStatusUI(){
    var t = els.storageStatusText;
    if(API_BASE.indexOf('REPLACE-WITH-YOUR-WORKER-URL') !== -1){
      t.textContent = 'Chưa cấu hình API_BASE trong app.js — mở file worker.js đi kèm để deploy backend rồi dán URL vào đó.';
    } else if(apiBroken){
      t.textContent = 'Không gọi được API lưu trữ ngay lúc này (kiểm tra mạng, hoặc API_BASE trong app.js). Thay đổi có thể chưa được lưu.';
    } else {
      t.textContent = 'Đang lưu trực tiếp qua API — mở đúng trang này (URL trơn, không cần thêm gì) ở bất kỳ thiết bị nào cũng thấy và sửa được cùng dữ liệu.';
    }
  }

  els.copyLinkBtn.addEventListener('click', async function(){
    try{
      await navigator.clipboard.writeText(shareLink());
      els.copyLinkBtn.textContent = 'Đã sao chép!';
    }catch(e){
      prompt('Sao chép link chia sẻ:', shareLink());
    }
    setTimeout(function(){ els.copyLinkBtn.textContent = '🔗 Sao chép link chia sẻ'; }, 1500);
  });


  /* ---------------- rendering sidebar ---------------- */
  function renderList(){
    var q = els.search.value.trim().toLowerCase();
    var items = state.index.slice().sort(function(a,b){ return b.updatedAt - a.updatedAt; });
    if(q) items = items.filter(function(n){ return n.title.toLowerCase().indexOf(q) !== -1; });

    els.list.innerHTML = '';
    if(items.length === 0){
      var empty = document.createElement('div');
      empty.id = 'empty-list';
      empty.textContent = q ? 'Không tìm thấy chủ đề phù hợp.' : 'Chưa có chủ đề nào. Hãy tạo chủ đề đầu tiên.';
      els.list.appendChild(empty);
      return;
    }
    items.forEach(function(n){
      var row = document.createElement('div');
      row.className = 'note-item' + (n.id === state.currentId ? ' active' : '');
      row.dataset.id = n.id;

      var main = document.createElement('div');
      main.className = 'ni-main';
      var t = document.createElement('div'); t.className = 'ni-title'; t.textContent = n.title || 'Chưa có tiêu đề';
      var m = document.createElement('div'); m.className = 'ni-meta'; m.textContent = fmtTime(n.updatedAt);
      main.appendChild(t); main.appendChild(m);

      var del = document.createElement('button');
      del.className = 'ni-del'; del.textContent = '✕'; del.title = 'Xoá chủ đề';
      del.addEventListener('click', function(ev){ ev.stopPropagation(); confirmDeleteNote(n.id, n.title); });

      row.appendChild(main); row.appendChild(del);
      row.addEventListener('click', function(){ openNote(n.id); });
      els.list.appendChild(row);
    });
  }

  /* ---------------- open / create / delete ---------------- */
  async function openNote(id){
    if(state.currentId && state.dirty && state.currentId !== id){
      await doSave();
    }
    var data = await loadNote(id);
    if(!data) return;
    state.currentId = id;
    state.dirty = false;
    if(state.saveTimer){
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    els.title.value = data.title || '';
    els.editor.innerHTML = data.html || '';
    upgradeTables(els.editor);
    var meta = state.index.find(function(n){ return n.id === id; });
    els.updatedAt.textContent = meta ? ('Cập nhật ' + fmtTime(meta.updatedAt)) : '';
    els.saveState.textContent = '';
    els.saveState.title = '';
    els.saveState.classList.remove('saving', 'dirty');
    els.noNote.style.display = 'none';
    els.noteView.style.display = 'flex';
    Api.setLast(id);
    renderList();
    updateToolbarState();
    setSidebarOpen(false);
  }

  async function createNote(prefill){
    if(state.currentId && state.dirty){
      await doSave();
    }
    var id = uid();
    var now = Date.now();
    var title = (prefill && prefill.title) || '';
    var html = (prefill && prefill.html) || '';
    state.index.push({ id: id, title: title, updatedAt: now });
    await saveIndex();
    await saveNote(id, { title: title, html: html });
    await openNote(id);
    if(!prefill) els.title.focus();
  }

  function confirmDeleteNote(id, title){
    els.modalText.textContent = 'Xoá chủ đề "' + (title || 'Chưa có tiêu đề') + '"? Không thể hoàn tác.';
    els.modalBg.classList.add('show');
    els.modalOk.onclick = async function(){
      els.modalBg.classList.remove('show');
      if(state.currentId === id){
        state.dirty = false;
        if(state.saveTimer){
          clearTimeout(state.saveTimer);
          state.saveTimer = null;
        }
      }
      state.index = state.index.filter(function(n){ return n.id !== id; });
      await saveIndex();
      await deleteNoteStorage(id);
      if(state.currentId === id){
        state.currentId = null;
        els.noteView.style.display = 'none';
        els.noNote.style.display = 'flex';
      }
      renderList();
    };
  }
  els.modalCancel.addEventListener('click', function(){ els.modalBg.classList.remove('show'); });

  /* ---------------- autosave / manual save ---------------- */
  var AUTOSAVE_DELAY_MS = 60000; // Tự động lưu sau 1 phút nếu có thay đổi

  function isMacPlatform(){
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  }

  function scheduleSave(){
    if(!state.currentId) return;
    state.dirty = true;
    var saveShortcut = isMacPlatform() ? '⌘S' : 'Ctrl+S';
    els.saveState.textContent = 'Chưa lưu (' + saveShortcut + ')';
    els.saveState.title = 'Nhấn ' + saveShortcut + ' hoặc bấm vào đây để lưu';
    els.saveState.classList.remove('saving');
    els.saveState.classList.add('dirty');

    if(!state.saveTimer){
      state.saveTimer = setTimeout(function(){
        doSave();
      }, AUTOSAVE_DELAY_MS);
    }
  }

  async function doSave(){
    if(!state.currentId || state.isSaving) return;
    if(state.saveTimer){
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    state.isSaving = true;
    els.saveState.textContent = 'Đang lưu…';
    els.saveState.classList.remove('dirty');
    els.saveState.classList.add('saving');
    try{
      var now = Date.now();
      var title = els.title.value.trim();
      var html = els.editor.innerHTML;
      await saveNote(state.currentId, { title: title, html: html });
      var meta = state.index.find(function(n){ return n.id === state.currentId; });
      if(meta){ meta.title = title; meta.updatedAt = now; }
      await saveIndex();
      state.dirty = false;
      els.updatedAt.textContent = 'Cập nhật ' + fmtTime(now);
      els.saveState.textContent = apiBroken ? 'Không lưu được qua API — hãy dùng "Xuất sao lưu"' : 'Đã lưu';
      els.saveState.title = '';
      els.saveState.classList.remove('saving');
      renderList();
    }catch(e){
      els.saveState.textContent = 'Lỗi lưu trữ!';
      els.saveState.classList.remove('saving');
      els.saveState.classList.add('dirty');
    }finally{
      state.isSaving = false;
    }
  }

  // Cho phép bấm trực tiếp vào nhãn trạng thái "Chưa lưu" để lưu
  els.saveState.addEventListener('click', function(){
    if(state.currentId && state.dirty){
      doSave();
    }
  });

  // Phím tắt Ctrl + S hoặc Command + S
  window.addEventListener('keydown', function(ev){
    if((ev.ctrlKey || ev.metaKey) && (ev.key === 's' || ev.key === 'S')){
      ev.preventDefault();
      if(state.currentId){
        doSave();
      }
    }
  });

  // Cảnh báo / cố gắng lưu qua API nếu người dùng đóng trang khi chưa lưu
  // (không dùng localStorage — vẫn cố gọi API lần cuối bằng keepalive)
  window.addEventListener('beforeunload', function(ev){
    if(state.dirty && state.currentId){
      try{
        var title = els.title.value.trim();
        var html = els.editor.innerHTML;
        fetch(apiUrl('notes/' + encodeURIComponent(state.currentId)), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title, html: html }),
          keepalive: true
        });
      }catch(e){}
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  els.title.addEventListener('input', scheduleSave);
  els.editor.addEventListener('input', function(){
    scheduleSave();
    updateToolbarState();
  });

  function getEditableBlock(node){
    if(!node) return null;
    if(node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if(!node || !node.closest) return null;
    var block = node.closest('h1, h2, h3, p, blockquote, li, div');
    return block && block !== els.editor && els.editor.contains(block) ? block : null;
  }

  function resetBlockAlignment(block){
    if(!block) return;
    block.style.textAlign = '';
    block.removeAttribute('align');
  }

  function selectAllEditorContent(){
    var selection = window.getSelection();
    if(!selection) return;

    var range = document.createRange();
    range.selectNodeContents(els.editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  els.editor.addEventListener('keydown', function(ev){
    // Native Ctrl+A can stop at the current empty editing line. Select the
    // whole editor explicitly, while leaving nested contenteditable cells
    // under the browser's native selection behavior.
    if((ev.ctrlKey || ev.metaKey) && (ev.key === 'a' || ev.key === 'A')){
      var nestedEditable = ev.target.closest
        ? ev.target.closest('[contenteditable="true"]')
        : null;
      if(nestedEditable === els.editor){
        ev.preventDefault();
        selectAllEditorContent();
      }
      return;
    }

    var selection = window.getSelection();
    var sourceBlock = selection && selection.rangeCount > 0
      ? getEditableBlock(selection.anchorNode)
      : null;

    if(ev.key === 'Tab'){
      if(selection && selection.rangeCount > 0){
        var li = getEditableBlock(selection.anchorNode);
        if(li && li.matches('li')){
          ev.preventDefault();
          if(ev.shiftKey){
            document.execCommand('outdent', false, null);
          } else {
            document.execCommand('indent', false, null);
          }
          scheduleSave();
          updateToolbarState();
        }
      }
      return;
    }

    // Enter trong heading thường làm trình duyệt sao chép inline
    // text-align sang heading mới. Block mới phải bắt đầu căn trái;
    // heading hiện tại vẫn giữ căn giữa do người dùng chọn.
    if(ev.key === 'Enter' && !ev.shiftKey && sourceBlock && sourceBlock.matches('h1, h2, h3')){
      setTimeout(function(){
        var currentSelection = window.getSelection();
        var newBlock = currentSelection && currentSelection.rangeCount > 0
          ? getEditableBlock(currentSelection.anchorNode)
          : null;
        if(newBlock && newBlock !== sourceBlock && newBlock.matches('h1, h2, h3, div')){
          resetBlockAlignment(newBlock);
          scheduleSave();
        }
      }, 0);
    }
  });

  var cellSelection = { anchor: null, selecting: false };
  var recentTouch = false;
  els.editor.addEventListener('touchstart', function(){
    recentTouch = true;
    setTimeout(function(){ recentTouch = false; }, 600);
  }, { passive: true });

  els.editor.addEventListener('mousedown', function(ev){
    var tableWrap = ev.target.closest('.kb-table-wrap');
    if(tableWrap) setActiveTableWrap(tableWrap);
    else clearActiveTableWrap();

    // Touch trên bảng dành cho thao tác chọn văn bản native của trình duyệt.
    if(recentTouch || (ev.sourceCapabilities && ev.sourceCapabilities.firesTouchEvents)) return;

    var cell = ev.target.closest('th, td');
    if(!cell || ev.target.closest('.kb-col-resize, .kb-row-resize, .kb-table-tools')) return;
    cellSelection.anchor = cell;
    cellSelection.selecting = true;
    selectCellRange(cell, cell);
  });

  document.addEventListener('mousedown', function(ev){
    var inTable = ev.target.closest && (ev.target.closest('.kb-table-wrap') || ev.target.closest('th, td'));
    if(!inTable && !ev.target.closest('.kb-table-tools')){
      clearActiveTableWrap();
    }
  });
  els.editor.addEventListener('mouseover', function(ev){
    if(!cellSelection.selecting) return;
    var cell = ev.target.closest('th, td');
    if(cell && cellSelection.anchor) selectCellRange(cellSelection.anchor, cell);
  });
  document.addEventListener('mouseup', function(){
    cellSelection.selecting = false;
    cellSelection.anchor = null;
  });

  function updateLastTableCell(){
    var sel = window.getSelection();
    if(sel && sel.rangeCount > 0){
      var node = sel.anchorNode;
      if(node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      var cell = node ? node.closest('th, td') : null;
      if(cell && els.editor.contains(cell)){
        state.lastTableCell = cell;
      }
    }
  }

  document.addEventListener('selectionchange', function(){
    updateLastTableCell();
    var ae = document.activeElement;
    var inTableCell = ae && ae.closest && ae.closest('th, td');
    if(!inTableCell && !(ae && els.editor.contains(ae))){
      clearActiveTableWrap();
    } else {
      var tableWrap = getActiveTableWrap();
      if(tableWrap) setActiveTableWrap(tableWrap);
      else clearActiveTableWrap();
    }
    if(ae === els.editor || (ae && els.editor.contains(ae))){
      updateToolbarState();
    }
  });

  /* ---------------- toolbar ---------------- */
  var toolbarDrag = { active: false, startX: 0, scrollLeft: 0, moved: false };
  els.toolbar.addEventListener('pointerdown', function(ev){
    if(els.toolbar.scrollWidth <= els.toolbar.clientWidth) return;
    toolbarDrag.active = true;
    toolbarDrag.moved = false;
    toolbarDrag.startX = ev.clientX;
    toolbarDrag.scrollLeft = els.toolbar.scrollLeft;
    els.toolbar.classList.add('toolbar-dragging');
    els.toolbar.setPointerCapture(ev.pointerId);
  });
  els.toolbar.addEventListener('pointermove', function(ev){
    if(!toolbarDrag.active) return;
    var distance = ev.clientX - toolbarDrag.startX;
    if(Math.abs(distance) > 4) toolbarDrag.moved = true;
    if(toolbarDrag.moved){
      ev.preventDefault();
      els.toolbar.scrollLeft = toolbarDrag.scrollLeft - distance;
    }
  });
  function stopToolbarDrag(){
    toolbarDrag.active = false;
    els.toolbar.classList.remove('toolbar-dragging');
  }
  els.toolbar.addEventListener('pointerup', stopToolbarDrag);
  els.toolbar.addEventListener('pointercancel', stopToolbarDrag);
  els.toolbar.addEventListener('click', function(ev){
    if(toolbarDrag.moved){
      ev.preventDefault();
      ev.stopImmediatePropagation();
      toolbarDrag.moved = false;
    }
  }, true);

  els.toolbar.addEventListener('mousedown', function(ev){
    if(ev.target.closest('.tb-btn')) ev.preventDefault();
  });

  // Nếu con trỏ đang ở trong vùng có thể sửa (kể cả ô bảng, vốn là một
  // vùng contenteditable lồng bên trong), giữ nguyên vị trí đó; chỉ khi
  // chưa focus ở đâu trong editor mới đưa con trỏ về editor chính.
  function ensureEditableFocus(){
    var ae = document.activeElement;
    if(ae && ae.isContentEditable && els.editor.contains(ae)) return;
    if(state.lastTableCell && els.editor.contains(state.lastTableCell)){
      state.lastTableCell.focus();
      return;
    }

    var sel = window.getSelection();
    if(sel && sel.rangeCount > 0){
      var anchorNode = sel.anchorNode;
      if(anchorNode && els.editor.contains(anchorNode)){
        els.editor.focus();
        return;
      }
    }

    els.editor.focus();
    var range = document.createRange();
    range.selectNodeContents(els.editor);
    range.collapse(false);
    sel = window.getSelection();
    if(sel){
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function normalizeSelectionForBlockCommand(){
    var sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return;

    var range = sel.getRangeAt(0);
    var anchorNode = sel.anchorNode;
    var currentBlock = getEditableBlock(anchorNode);

    if(!currentBlock || currentBlock === els.editor) return;

    if(sel.isCollapsed){
      var blockRange = document.createRange();
      blockRange.selectNodeContents(currentBlock);
      sel.removeAllRanges();
      sel.addRange(blockRange);
      return;
    }

    var startBlock = getEditableBlock(range.startContainer);
    var endBlock = getEditableBlock(range.endContainer);
    if(startBlock && startBlock !== endBlock && startBlock !== els.editor){
      var mergedRange = document.createRange();
      mergedRange.selectNodeContents(startBlock);
      sel.removeAllRanges();
      sel.addRange(mergedRange);
    }
  }

  function insertNewBlockForFormat(tagName, isList){
    var sel = window.getSelection();
    if(!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;

    var anchorNode = sel.anchorNode;
    var currentBlock = getEditableBlock(anchorNode);
    if(!currentBlock || currentBlock === els.editor) return false;
    var text = currentBlock.textContent.replace(/\u200B/g, '').trim();
    var range = sel.getRangeAt(0);
    var endRange = document.createRange();
    endRange.selectNodeContents(currentBlock);
    endRange.collapse(false);
    var atEnd = range.compareBoundaryPoints(Range.END_TO_END, endRange) === 0;
    if(!text || !atEnd) return false;

    if(isList){
      var currentList = currentBlock.closest('ul, ol');
      if(currentBlock.matches('li') && currentList){
        var item = document.createElement('li');
        item.innerHTML = '<br>';
        currentList.insertBefore(item, currentBlock.nextSibling);
        var listRange = document.createRange();
        listRange.selectNodeContents(item);
        listRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(listRange);
        return true;
      }
    }

    var newBlock = document.createElement(isList ? (tagName === 'ol' ? 'ol' : 'ul') : tagName);
    if(isList){
      var newItem = document.createElement('li');
      newItem.innerHTML = '<br>';
      newBlock.appendChild(newItem);
    } else {
      newBlock.innerHTML = '<br>';
    }

    var parent = currentBlock.parentNode;
    if(parent){
      parent.insertBefore(newBlock, currentBlock.nextSibling);
      var targetRange = document.createRange();
      if(isList){
        targetRange.selectNodeContents(newBlock.firstElementChild);
        targetRange.collapse(false);
      } else {
        targetRange.selectNodeContents(newBlock);
        targetRange.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(targetRange);
      return true;
    }
    return false;
  }

  function convertHeadingToOrderedList(){
    var sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return false;

    var block = getEditableBlock(sel.anchorNode);
    if(!block || !block.matches('h1, h2, h3')) return false;

    var list = block.closest('ol');
    if(list && els.editor.contains(list)) return false;

    var item = document.createElement('li');
    item.innerHTML = block.innerHTML || '<br>';

    var orderedList = document.createElement('ol');
    var previous = null;
    Array.prototype.forEach.call(els.editor.querySelectorAll('ol'), function(candidate){
      if(candidate !== orderedList &&
        (candidate.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)){
        previous = candidate;
      }
    });
    if(previous){
      var previousStart = parseInt(previous.getAttribute('start'), 10);
      if(!Number.isFinite(previousStart)) previousStart = 1;
      var nextStart = previousStart + previous.children.length;
      if(nextStart > 1) orderedList.setAttribute('start', nextStart);
    }
    orderedList.appendChild(item);
    block.parentNode.insertBefore(orderedList, block);
    block.remove();

    var range = document.createRange();
    range.selectNodeContents(item);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  function continueOrderedListNumbering(lists, existingLists){
    lists.forEach(function(list){
      if(existingLists.indexOf(list) !== -1 || list.hasAttribute('start')) return;

      var previous = null;
      Array.prototype.forEach.call(els.editor.querySelectorAll('ol'), function(candidate){
        if(candidate !== list &&
          !candidate.contains(list) &&
          (candidate.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)){
          previous = candidate;
        }
      });
      if(!previous) return;

      var previousStart = parseInt(previous.getAttribute('start'), 10);
      if(!Number.isFinite(previousStart)) previousStart = 1;
      var nextStart = previousStart + previous.children.length;
      if(nextStart > 1) list.setAttribute('start', nextStart);
    });
  }

  /* ---------------- xử lý căn lề (trái, giữa, phải) trong ô bảng & đoạn văn ---------------- */
  function getSelectedCells(){
    var selectedCells = state.selectedCells.filter(function(cell){
      return els.editor.contains(cell) && cell.matches('th, td');
    });
    if(selectedCells.length > 0) return selectedCells;

    var sel = window.getSelection();
    if(!sel || sel.rangeCount === 0){
      return state.lastTableCell && els.editor.contains(state.lastTableCell) ? [state.lastTableCell] : [];
    }

    var range = sel.getRangeAt(0);
    var container = range.commonAncestorContainer;
    if(container.nodeType === Node.TEXT_NODE) container = container.parentElement;
    if(!container) return state.lastTableCell && els.editor.contains(state.lastTableCell) ? [state.lastTableCell] : [];

    var singleCell = container.closest('th, td');
    if(singleCell && els.editor.contains(singleCell)){
      state.lastTableCell = singleCell;
      return [singleCell];
    }

    var table = container.closest('table');
    if(!table && container.querySelector) table = container.querySelector('table');
    if(table && els.editor.contains(table)){
      var cells = Array.prototype.filter.call(table.querySelectorAll('th, td'), function(c){
        return range.intersectsNode ? range.intersectsNode(c) : false;
      });
      if(cells.length > 0){
        state.lastTableCell = cells[0];
        return cells;
      }
    }

    return state.lastTableCell && els.editor.contains(state.lastTableCell) ? [state.lastTableCell] : [];
  }

  function clearSelectedCells(){
    state.selectedCells.forEach(function(cell){ cell.classList.remove('kb-cell-selected'); });
    state.selectedCells = [];
  }

  function selectCellRange(anchor, target){
    var table = anchor.closest('table');
    if(!table || table !== target.closest('table')) return;

    var startRow = anchor.parentElement.rowIndex;
    var endRow = target.parentElement.rowIndex;
    var startCol = anchor.cellIndex;
    var endCol = target.cellIndex;
    var minRow = Math.min(startRow, endRow);
    var maxRow = Math.max(startRow, endRow);
    var minCol = Math.min(startCol, endCol);
    var maxCol = Math.max(startCol, endCol);
    clearSelectedCells();

    for(var r = minRow; r <= maxRow; r++){
      var row = table.rows[r];
      if(!row) continue;
      for(var c = minCol; c <= maxCol; c++){
        var cell = row.cells[c];
        if(cell){
          cell.classList.add('kb-cell-selected');
          state.selectedCells.push(cell);
        }
      }
    }
    state.lastTableCell = target;
  }

  function applyAlignment(align){
    ensureEditableFocus();
    updateLastTableCell();

    var cells = getSelectedCells();
    if(cells.length > 0){
      cells.forEach(function(cell){
        cell.style.textAlign = align;
        cell.setAttribute('data-align', align);
      });
      scheduleSave();
      updateToolbarState();
      return;
    }

    var cmd = align === 'center' ? 'justifyCenter' : (align === 'right' ? 'justifyRight' : 'justifyLeft');
    document.execCommand(cmd, false, null);
    scheduleSave();
    updateToolbarState();
  }

  function applyVerticalAlignment(align){
    ensureEditableFocus();
    updateLastTableCell();

    var cells = getSelectedCells();
    if(cells.length === 0) return;

    cells.forEach(function(cell){
      cell.style.verticalAlign = align;
      cell.setAttribute('data-valign', align);
    });
    scheduleSave();
    updateToolbarState();
  }

  /* ---------------- xử lý danh sách chữ abc / số / chấm ---------------- */
  function getSelectedOls(){
    var sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return [];
    var range = sel.getRangeAt(0);
    var container = range.commonAncestorContainer;
    if(container.nodeType === Node.TEXT_NODE) container = container.parentElement;
    if(!container) return [];
    if(!els.editor.contains(container) && container !== els.editor) return [];

    var closest = container.closest('ol');
    if(closest && els.editor.contains(closest)){
      return [closest];
    }

    var ols = Array.prototype.filter.call(container.querySelectorAll('ol'), function(ol){
      return els.editor.contains(ol) && (range.intersectsNode ? range.intersectsNode(ol) : true);
    });
    return ols;
  }

  function getNextAlphaStart(list){
    var previousAlpha = null;
    var allOls = els.editor.querySelectorAll('ol[type="a"]');
    Array.prototype.forEach.call(allOls, function(ol){
      if(ol !== list && (!list || !!(ol.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING))){
        previousAlpha = ol;
      }
    });
    if(!previousAlpha) return 1;

    var start = parseInt(previousAlpha.getAttribute('start'), 10);
    if(!Number.isFinite(start)) start = 1;
    return start + previousAlpha.querySelectorAll(':scope > li').length;
  }

  function continueAlphaLists(lists){
    lists.forEach(function(ol){
      ol.setAttribute('type', 'a');
      var nextStart = getNextAlphaStart(ol);
      if(nextStart > 1) ol.setAttribute('start', nextStart);
      else ol.removeAttribute('start');
    });
  }

  function toggleAlphaList(){
    ensureEditableFocus();
    var ols = getSelectedOls();
    var allAlpha = ols.length > 0 && ols.every(function(ol){ return ol.getAttribute('type') === 'a'; });

    if(allAlpha){
      // Đang là danh sách chữ abc -> bấm lại nút để huỷ danh sách, đưa về đoạn văn thường
      document.execCommand('insertOrderedList', false, null);
    } else if(ols.length > 0){
      // Đang là danh sách số -> chuyển đổi trực tiếp sang dạng chữ abc
      ols.forEach(function(ol){
        ol.setAttribute('type', 'a');
      });
    } else {
      // Đang là văn bản thường hoặc danh sách chấm -> tạo danh sách số rồi đổi sang type="a"
      document.execCommand('insertOrderedList', false, null);
      var newOls = getSelectedOls();
      if(newOls.length === 0){
        var sel = window.getSelection();
        if(sel && sel.anchorNode){
          var n = sel.anchorNode;
          if(n.nodeType === Node.TEXT_NODE) n = n.parentElement;
          var ol = n ? n.closest('ol') : null;
          if(ol && els.editor.contains(ol)) newOls = [ol];
        }
      }
      newOls.forEach(function(ol){
        continueAlphaLists([ol]);
      });
    }
    scheduleSave();
    updateToolbarState();
  }

  function updateToolbarState(){
    if(!els.editor) return;
    var ols = getSelectedOls();
    var hasAlpha = ols.length > 0 && ols.some(function(ol){ return ol.getAttribute('type') === 'a'; });
    var hasNumeric = ols.length > 0 && ols.some(function(ol){ return !ol.getAttribute('type') || ol.getAttribute('type') === '1'; });

    if(els.btnListAlpha){
      els.btnListAlpha.classList.toggle('on', hasAlpha);
    }
    var btnOl = els.toolbar.querySelector('[data-cmd="insertOrderedList"]');
    if(btnOl){
      btnOl.classList.toggle('on', hasNumeric);
    }
    var btnUl = els.toolbar.querySelector('[data-cmd="insertUnorderedList"]');
    if(btnUl){
      var isUl = false;
      try{ isUl = document.queryCommandState('insertUnorderedList'); }catch(e){}
      btnUl.classList.toggle('on', isUl);
    }
    ['bold', 'italic', 'underline'].forEach(function(cmd){
      var b = els.toolbar.querySelector('[data-cmd="' + cmd + '"]');
      if(b){
        var active = false;
        try{ active = document.queryCommandState(cmd); }catch(e){}
        b.classList.toggle('on', active);
      }
    });

    // Cập nhật trạng thái căn lề (trong ô bảng hoặc đoạn văn)
    var curAlign = 'left';
    var activeCell = (function(){
      var sel = window.getSelection();
      if(sel && sel.rangeCount > 0){
        var n = sel.anchorNode;
        if(n && n.nodeType === Node.TEXT_NODE) n = n.parentElement;
        var c = n ? n.closest('th, td') : null;
        if(c && els.editor.contains(c)) return c;
      }
      return state.lastTableCell && els.editor.contains(state.lastTableCell) ? state.lastTableCell : null;
    })();

    if(activeCell){
      curAlign = activeCell.getAttribute('data-align') || activeCell.style.textAlign || 'left';
    } else {
      if(document.queryCommandState('justifyCenter')) curAlign = 'center';
      else if(document.queryCommandState('justifyRight')) curAlign = 'right';
      else curAlign = 'left';
    }

    var btnAlignL = els.toolbar.querySelector('[data-align="left"]');
    var btnAlignC = els.toolbar.querySelector('[data-align="center"]');
    var btnAlignR = els.toolbar.querySelector('[data-align="right"]');

    if(btnAlignL) btnAlignL.classList.toggle('on', curAlign === 'left' || curAlign === 'start');
    if(btnAlignC) btnAlignC.classList.toggle('on', curAlign === 'center');
    if(btnAlignR) btnAlignR.classList.toggle('on', curAlign === 'right' || curAlign === 'end');

    var curVAlign = 'top';
    if(activeCell){
      curVAlign = activeCell.getAttribute('data-valign') || activeCell.style.verticalAlign || 'top';
    }
    ['top', 'middle', 'bottom'].forEach(function(align){
      var btn = els.toolbar.querySelector('[data-valign="' + align + '"]');
      if(btn) btn.classList.toggle('on', curVAlign === align);
    });

    if(activeCell){
      var tw = activeCell.closest('.kb-table-wrap');
      if(tw){
        var tools = tw.querySelector('.kb-table-tools');
        if(tools){
          var tbL = tools.querySelector('[data-act="align-left"]');
          var tbC = tools.querySelector('[data-act="align-center"]');
          var tbR = tools.querySelector('[data-act="align-right"]');
          if(tbL) tbL.classList.toggle('on', curAlign === 'left');
          if(tbC) tbC.classList.toggle('on', curAlign === 'center');
          if(tbR) tbR.classList.toggle('on', curAlign === 'right');
        }
      }
    }
  }

  els.toolbar.addEventListener('click', function(ev){
    var btn = ev.target.closest('.tb-btn');
    if(!btn) return;
    ensureEditableFocus();
    if(btn.dataset.align){
      applyAlignment(btn.dataset.align);
      return;
    } else if(btn.dataset.valign){
      applyVerticalAlignment(btn.dataset.valign);
      return;
    } else if(btn.id === 'btn-list-alpha'){
      toggleAlphaList();
      return;
    } else if(btn.dataset.cmd === 'insertOrderedList'){
      if(convertHeadingToOrderedList() || insertNewBlockForFormat('ol', true)){
        scheduleSave();
        updateToolbarState();
        return;
      }
      normalizeSelectionForBlockCommand();
      var ols = getSelectedOls();
      var hasAlpha = ols.length > 0 && ols.some(function(ol){ return ol.getAttribute('type') === 'a'; });
      if(hasAlpha){
        // Đang là danh sách abc mà bấm nút 1. -> chuyển thành danh sách số
        ols.forEach(function(ol){
          ol.removeAttribute('type');
        });
      } else {
        var existingOls = ols.slice();
        document.execCommand('insertOrderedList', false, null);
        continueOrderedListNumbering(getSelectedOls(), existingOls);
      }
    } else if(btn.dataset.cmd === 'insertUnorderedList'){
      if(insertNewBlockForFormat('ul', true)){
        scheduleSave();
        updateToolbarState();
        return;
      }
      normalizeSelectionForBlockCommand();
      document.execCommand('insertUnorderedList', false, null);
      var sel = window.getSelection();
      if(sel && sel.anchorNode){
        var n = sel.anchorNode;
        if(n.nodeType === Node.TEXT_NODE) n = n.parentElement;
        var ul = n ? n.closest('ul') : null;
        if(ul && ul.hasAttribute('type')) ul.removeAttribute('type');
      }
    } else if(btn.dataset.cmd){
      if(btn.dataset.cmd !== 'removeFormat' && insertNewBlockForFormat('p', false)){
        scheduleSave();
        updateToolbarState();
        return;
      }
      normalizeSelectionForBlockCommand();
      document.execCommand(btn.dataset.cmd, false, null);
    } else if(btn.dataset.block){
      if(insertNewBlockForFormat(btn.dataset.block, false)){
        scheduleSave();
        updateToolbarState();
        return;
      }
      normalizeSelectionForBlockCommand();
      document.execCommand('formatBlock', false, btn.dataset.block);
    }
    scheduleSave();
    updateToolbarState();
  });

  els.btnCheck.addEventListener('click', function(){
    ensureEditableFocus();
    var html = '<div class="kb-check" data-status="none" contenteditable="false">' +
      '<button type="button" class="kb-check-btn" contenteditable="false" aria-label="Đổi trạng thái"></button>' +
      '<div class="kb-check-text" contenteditable="true" spellcheck="false">Nội dung cần tự kiểm tra…</div>' +
      '<span class="kb-check-tag">Chưa xác định</span></div><p><br></p>';
    document.execCommand('insertHTML', false, html);
    scheduleSave();
  });

  els.btnIcon.addEventListener('click', function(){
    ensureEditableFocus();
    var html = '<button type="button" class="kb-icon-toggle" data-status="none" contenteditable="false" aria-label="Đổi trạng thái Đúng/Sai">&#8203;</button>&nbsp;';
    document.execCommand('insertHTML', false, html);
    scheduleSave();
  });

  els.editor.setAttribute('spellcheck', 'false');
  els.editor.setAttribute('autocorrect', 'off');
  els.editor.setAttribute('autocapitalize', 'off');

  els.btnClearFormat.addEventListener('click', function(){
    ensureEditableFocus();
    document.execCommand('removeFormat', false, null);
    document.execCommand('formatBlock', false, 'P');
    scheduleSave();
    updateToolbarState();
  });

  els.btnTable.addEventListener('click', function(){
    ensureEditableFocus();
    var html = buildTableHTML(3, 3) + '<p><br></p>';
    document.execCommand('insertHTML', false, html);
    upgradeTables(els.editor);
    scheduleSave();
  });

  function tableToolsHTML(){
    return '<div class="kb-table-tools">' +
      '<button type="button" data-act="addrow">+ Hàng</button>' +
      '<button type="button" data-act="addcol">+ Cột</button>' +
      '<button type="button" data-act="delrow">− Hàng</button>' +
      '<button type="button" data-act="delcol">− Cột</button>' +
      '<span class="kb-tools-sep"></span>' +
      '<button type="button" data-act="align-left" title="Căn trái ô đang chọn">⫷ Trái</button>' +
      '<button type="button" data-act="align-center" title="Căn giữa ô đang chọn">≡ Giữa</button>' +
      '<button type="button" data-act="align-right" title="Căn phải ô đang chọn">⫸ Phải</button>' +
      '<button type="button" data-act="align-col" title="Căn giữa toàn bộ cột này">≡ Cả cột</button>' +
      '<span class="kb-tools-sep"></span>' +
      '<button type="button" data-act="deltable">Xoá bảng</button></div>';
  }

  function clearActiveTableWrap(){
    var allWraps = document.querySelectorAll('.kb-table-wrap');
    allWraps.forEach(function(item){
      item.classList.remove('active');
    });
    clearSelectedCells();
    state.lastTableCell = null;
  }

  function setActiveTableWrap(wrap){
    if(!wrap) return;
    var allWraps = document.querySelectorAll('.kb-table-wrap');
    allWraps.forEach(function(item){
      item.classList.toggle('active', item === wrap);
    });
  }

  function getActiveTableWrap(){
    var wrap = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.kb-table-wrap') : null;
    if(wrap) return wrap;
    var sel = window.getSelection();
    if(sel && sel.rangeCount > 0){
      var n = sel.anchorNode;
      if(n && n.nodeType === Node.TEXT_NODE) n = n.parentElement;
      if(n){
        var tableWrap = n.closest ? n.closest('.kb-table-wrap') : null;
        if(tableWrap) return tableWrap;
      }
    }
    return null;
  }

  function buildTableHTML(rows, cols){
    var tid = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
    var html = '<div class="kb-table-wrap active" data-tid="' + tid + '" contenteditable="false">';
    html += tableToolsHTML();
    html += '<div class="kb-table-scroll"><table class="kb-table" style="width:100%;"><colgroup>';
    var colWidth = 100 / cols;
    for(var c = 0; c < cols; c++) html += '<col style="width:' + colWidth + '%">';
    html += '</colgroup><tbody>';
    for(var r = 0; r < rows; r++){
      html += '<tr>';
      for(var c2 = 0; c2 < cols; c2++){
        var tag = r === 0 ? 'th' : 'td';
        html += '<' + tag + ' contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off">' + (r === 0 ? ('Cột ' + (c2 + 1)) : '') + '</' + tag + '>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  // Đảm bảo mọi bảng (mới chèn hoặc vừa nạp từ file lưu) đều có khung
  // cuộn ngang, colgroup, và các tay kéo để đổi kích thước cột/hàng.
  // An toàn khi gọi lại nhiều lần (không tạo trùng).
  function upgradeTables(root){
    var wraps = root.querySelectorAll('.kb-table-wrap');
    wraps.forEach(function(wrap){
      var table = wrap.querySelector('table');
      if(!table) return;

      var tools = wrap.querySelector('.kb-table-tools');
      if(tools){
        if(!tools.querySelector('[data-act="align-center"]')){
          tools.outerHTML = tableToolsHTML();
        }
      } else {
        wrap.insertAdjacentHTML('afterbegin', tableToolsHTML());
      }

      if(!wrap.querySelector('.kb-table-scroll')){
        var scroll = document.createElement('div');
        scroll.className = 'kb-table-scroll';
        table.parentNode.insertBefore(scroll, table);
        scroll.appendChild(table);
      }

      var firstRow = table.rows[0];
      if(firstRow && !table.querySelector('colgroup')){
        var cg = document.createElement('colgroup');
        var pct = 100 / firstRow.cells.length;
        for(var i = 0; i < firstRow.cells.length; i++){
          var col = document.createElement('col');
          col.style.width = pct + '%';
          cg.appendChild(col);
        }
        table.insertBefore(cg, table.firstChild);
      }

      if(firstRow){
        Array.prototype.forEach.call(firstRow.cells, function(cell, idx){
          if(!cell.querySelector('.kb-col-resize')){
            var h = document.createElement('span');
            h.className = 'kb-col-resize';
            h.setAttribute('contenteditable', 'false');
            h.setAttribute('data-col', idx);
            cell.appendChild(h);
          }
        });
      }

      Array.prototype.forEach.call(table.rows, function(row){
        var lastCell = row.cells[row.cells.length - 1];
        if(!lastCell) return;
        if(!lastCell.querySelector('.kb-row-resize')){
          var rh = document.createElement('span');
          rh.className = 'kb-row-resize';
          rh.setAttribute('contenteditable', 'false');
          lastCell.appendChild(rh);
        }
      });
    });
  }

  /* ---------------- kéo đổi kích thước cột / hàng ---------------- */
  var resizing = null;
  els.editor.addEventListener('mousedown', function(ev){
    var colHandle = ev.target.closest('.kb-col-resize');
    var rowHandle = ev.target.closest('.kb-row-resize');
    if(colHandle){
      ev.preventDefault();
      var cell = colHandle.closest('th,td');
      var table = cell.closest('table');
      var idx = Array.prototype.indexOf.call(cell.parentElement.children, cell);
      var cols = table.querySelectorAll(':scope > colgroup > col');
      var col = cols[idx];
      if(!col) return;
      var startW = parseInt(col.style.width, 10) || cell.getBoundingClientRect().width;
      resizing = { type: 'col', col: col, startX: ev.clientX, startW: startW };
      document.body.classList.add('kb-resizing-col');
    } else if(rowHandle){
      ev.preventDefault();
      var row = rowHandle.closest('tr');
      var startH = row.getBoundingClientRect().height;
      resizing = { type: 'row', row: row, startY: ev.clientY, startH: startH };
      document.body.classList.add('kb-resizing-row');
    }
  });
  document.addEventListener('mousemove', function(ev){
    if(!resizing) return;
    if(resizing.type === 'col'){
      var dx = ev.clientX - resizing.startX;
      resizing.col.style.width = Math.max(50, Math.round(resizing.startW + dx)) + 'px';
    } else {
      var dy = ev.clientY - resizing.startY;
      resizing.row.style.height = Math.max(24, Math.round(resizing.startH + dy)) + 'px';
    }
  });
  document.addEventListener('mouseup', function(){
    if(resizing){
      resizing = null;
      document.body.classList.remove('kb-resizing-col', 'kb-resizing-row');
      scheduleSave();
    }
  });

  els.editor.addEventListener('mousedown', function(ev){
    if(ev.target.closest('.kb-table-tools button')){
      ev.preventDefault();
    }
  });

  /* ---------------- editor delegation: checklist / icon / công cụ bảng ---------------- */
  els.editor.addEventListener('click', function(ev){
    updateLastTableCell();
    var iconBtn = ev.target.closest('.kb-icon-toggle');
    if(iconBtn){
      var curIcon = iconBtn.dataset.status || 'none';
      iconBtn.dataset.status = curIcon === 'none' ? 'correct' : (curIcon === 'correct' ? 'incorrect' : 'none');
      scheduleSave();
      return;
    }
    var checkBtn = ev.target.closest('.kb-check-btn');
    if(checkBtn){
      var wrap = checkBtn.closest('.kb-check');
      var cur = wrap.dataset.status || 'none';
      var next = cur === 'none' ? 'correct' : (cur === 'correct' ? 'incorrect' : 'none');
      wrap.dataset.status = next;
      var tag = wrap.querySelector('.kb-check-tag');
      tag.textContent = next === 'correct' ? 'Đúng' : (next === 'incorrect' ? 'Sai' : 'Chưa xác định');
      scheduleSave();
      return;
    }
    var tblBtn = ev.target.closest('.kb-table-tools button');
    if(tblBtn){
      var tw = tblBtn.closest('.kb-table-wrap');
      setActiveTableWrap(tw);
      var table = tw.querySelector('table');
      var act = tblBtn.dataset.act;
      var cg = table.querySelector(':scope > colgroup');
      if(act === 'addrow'){
        var lastRow = table.rows[table.rows.length - 1];
        var newRow = table.insertRow(-1);
        for(var i = 0; i < lastRow.cells.length; i++){
          var td = document.createElement('td');
          td.contentEditable = 'true';
          var colAlign = lastRow.cells[i].getAttribute('data-align') || lastRow.cells[i].style.textAlign;
          if(colAlign){
            td.style.textAlign = colAlign;
            td.setAttribute('data-align', colAlign);
          }
          var colVAlign = lastRow.cells[i].getAttribute('data-valign') || lastRow.cells[i].style.verticalAlign;
          if(colVAlign){
            td.style.verticalAlign = colVAlign;
            td.setAttribute('data-valign', colVAlign);
          }
          newRow.appendChild(td);
        }
      } else if(act === 'addcol'){
        for(var r = 0; r < table.rows.length; r++){
          var cell = document.createElement(r === 0 ? 'th' : 'td');
          cell.contentEditable = 'true';
          table.rows[r].appendChild(cell);
        }
        if(cg){
          var lastCol = cg.lastElementChild;
          var w = lastCol ? (parseInt(lastCol.style.width, 10) || 100) : 100;
          var newCol = document.createElement('col');
          newCol.style.width = w + 'px';
          cg.appendChild(newCol);
        }
      } else if(act === 'delrow'){
        if(table.rows.length > 1) table.deleteRow(-1);
      } else if(act === 'delcol'){
        if(table.rows[0].cells.length > 1){
          for(var r2 = 0; r2 < table.rows.length; r2++) table.rows[r2].deleteCell(-1);
          if(cg && cg.lastElementChild) cg.removeChild(cg.lastElementChild);
        }
      } else if(act === 'align-left' || act === 'align-center' || act === 'align-right'){
        var targetAlign = act.replace('align-', '');
        var targetCell = state.lastTableCell && table.contains(state.lastTableCell) ? state.lastTableCell : null;
        if(!targetCell){
          var selCells = getSelectedCells();
          if(selCells.length > 0 && table.contains(selCells[0])) targetCell = selCells[0];
        }
        if(!targetCell && table.rows[0]) targetCell = table.rows[0].cells[0];
        if(targetCell){
          targetCell.style.textAlign = targetAlign;
          targetCell.setAttribute('data-align', targetAlign);
          state.lastTableCell = targetCell;
        }
        scheduleSave();
        updateToolbarState();
        return;
      } else if(act === 'align-col'){
        var targetColCell = state.lastTableCell && table.contains(state.lastTableCell) ? state.lastTableCell : null;
        if(!targetColCell){
          var selC = getSelectedCells();
          if(selC.length > 0 && table.contains(selC[0])) targetColCell = selC[0];
        }
        if(!targetColCell && table.rows[0]) targetColCell = table.rows[0].cells[0];
        if(targetColCell){
          var colIdx = Array.prototype.indexOf.call(targetColCell.parentElement.children, targetColCell);
          var curColAlign = targetColCell.getAttribute('data-align') || targetColCell.style.textAlign || 'left';
          var nextColAlign = curColAlign === 'center' ? 'left' : 'center';
          for(var r3 = 0; r3 < table.rows.length; r3++){
            var rowCell = table.rows[r3].cells[colIdx];
            if(rowCell){
              rowCell.style.textAlign = nextColAlign;
              rowCell.setAttribute('data-align', nextColAlign);
            }
          }
          state.lastTableCell = targetColCell;
        }
        scheduleSave();
        updateToolbarState();
        return;
      } else if(act === 'deltable'){
        tw.remove();
        state.lastTableCell = null;
        scheduleSave();
        updateToolbarState();
        return;
      }
      upgradeTables(tw.parentElement || els.editor);
      scheduleSave();
      updateToolbarState();
    }
  });

  /* =========================================================
     XỬ LÝ DÁN VĂN BẢN (PASTE SANITIZER & TRANSFORMER)
     Dù copy từ bất cứ nguồn nào (Word, Docs, Web, ChatGPT, Markdown):
     - Loại bỏ 100% font chữ, font-size, màu sắc, màu nền ngoại lai.
     - Nhận diện đúng cấu trúc: Heading 1/2/3, danh sách chấm, danh sách số,
       danh sách chữ abc, trích dẫn, bảng, in đậm, in nghiêng.
     - Ép toàn bộ về đúng quy chuẩn và kiểu dáng đặc trưng của sổ tay.
     ========================================================= */

  function escapeHTML(str){
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseInlineMarkdown(str){
    var esc = escapeHTML(str);
    esc = esc.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/__(.*?)__/g, '<b>$1</b>');
    esc = esc.replace(/(^|[^\*])\*(?!\*)(.*?)\*(?!\*)/g, '$1<i>$2</i>');
    esc = esc.replace(/`([^`]+)`/g, '<code>$1</code>');
    return esc;
  }

  function parsePlainTextToHTML(text){
    var lines = text.split(/\r?\n/);
    var html = '';
    var currentList = null;

    function flushList(){
      if(!currentList) return;
      var tag = currentList.type === 'ul' ? 'ul' : 'ol';
      var openTag = '<' + tag;
      if(currentList.type === 'ol-alpha') openTag += ' type="a"';
      if(currentList.start) openTag += ' start="' + currentList.start + '"';
      openTag += '>';
      html += openTag + currentList.items.join('') + '</' + tag + '>';
      currentList = null;
    }

    function openList(type, start){
      if(currentList && currentList.type !== type){
        flushList();
      }
      if(!currentList){
        currentList = { type: type, start: start || null, items: [] };
      }
    }

    function appendListItem(text){
      if(!currentList){
        return;
      }
      currentList.items.push('<li>' + parseInlineMarkdown(text) + '</li>');
    }

    function appendToLastListItem(text){
      if(!currentList || currentList.items.length === 0){
        return false;
      }
      var lastIndex = currentList.items.length - 1;
      currentList.items[lastIndex] = currentList.items[lastIndex].replace(/<\/li>$/, ' ' + parseInlineMarkdown(text) + '</li>');
      return true;
    }

    for(var i = 0; i < lines.length; i++){
      var line = lines[i];
      var trimmed = line.trim();

      if(trimmed === ''){
        flushList();
        html += '<p><br></p>';
        continue;
      }

      // Heading 1: # Tiêu đề
      if(/^#\s+(.+)$/.test(trimmed)){
        flushList();
        var m1 = trimmed.match(/^#\s+(.+)$/);
        html += '<h1>' + parseInlineMarkdown(m1[1]) + '</h1>';
        continue;
      }

      // Heading 2: ## Tiêu đề
      if(/^##\s+(.+)$/.test(trimmed)){
        flushList();
        var m2 = trimmed.match(/^##\s+(.+)$/);
        html += '<h2>' + parseInlineMarkdown(m2[1]) + '</h2>';
        continue;
      }

      // Heading 3: ### Tiêu đề (hoặc ####...)
      if(/^#{3,6}\s+(.+)$/.test(trimmed)){
        flushList();
        var m3 = trimmed.match(/^#{3,6}\s+(.+)$/);
        html += '<h3>' + parseInlineMarkdown(m3[1]) + '</h3>';
        continue;
      }

      // Blockquote: > Trích dẫn
      if(/^>\s+(.+)$/.test(trimmed)){
        flushList();
        var mq = trimmed.match(/^>\s+(.+)$/);
        html += '<blockquote>' + parseInlineMarkdown(mq[1]) + '</blockquote>';
        continue;
      }

      // Danh sách chấm: -, *, •, +
      var bulletMatch = trimmed.match(/^[-*•+]\s+(.+)$/);
      if(bulletMatch){
        if(currentList && currentList.type !== 'ul') flushList();
        openList('ul');
        appendListItem(bulletMatch[1]);
        continue;
      }

      // Danh sách chữ abc: a. hoặc a) hoặc A. hoặc A)
      var alphaMatch = trimmed.match(/^([a-zA-Z])[\.\)]\s+(.+)$/);
      if(alphaMatch){
        if(currentList && currentList.type !== 'ol-alpha') flushList();
        openList('ol-alpha');
        appendListItem(alphaMatch[2]);
        continue;
      }

      // Danh sách số: 1. hoặc 1)
      var numberMatch = trimmed.match(/^(\d+)[\.\)]\s+(.+)$/);
      if(numberMatch){
        if(currentList && currentList.type !== 'ol') flushList();
        openList('ol');
        appendListItem(numberMatch[2]);
        continue;
      }

      // Nếu đang ở trong danh sách và dòng này không phải là block mới, coi đó là phần tiếp theo của mục cuối
      if(currentList && !/^(?:#|##|#{3,6}|>\s|[-*•+]\s+|[a-zA-Z][\.\)]\s+|\d+[\.\)]\s+)/.test(trimmed)){
        appendToLastListItem(trimmed);
        continue;
      }

      // Đoạn văn thường
      flushList();
      html += '<p>' + parseInlineMarkdown(trimmed) + '</p>';
    }

    flushList();
    return html;
  }

  function convertPseudoListParagraphs(body, doc){
    var paras = Array.from(body.children);
    var i = 0;
    while(i < paras.length){
      var p = paras[i];
      if(p.tagName === 'P'){
        var text = p.textContent.trim();

        // 1) Dấu chấm: •, -, *
        var bulletMatch = text.match(/^([•\-\*])\s+(.*)$/);
        if(bulletMatch){
          var ul = doc.createElement('ul');
          while(i < paras.length && paras[i].tagName === 'P'){
            var bm = paras[i].textContent.trim().match(/^([•\-\*])\s+(.*)$/);
            if(!bm) break;
            var li = doc.createElement('li');
            li.innerHTML = paras[i].innerHTML.replace(/^\s*([•\-\*])\s+/, '');
            ul.appendChild(li);
            var nextP = paras[i];
            i++;
            nextP.remove();

            while(i < paras.length && paras[i].tagName === 'P' && !/^(?:[•\-\*]|[a-zA-Z][\.\)]|\d+[\.\)])\s+/.test(paras[i].textContent.trim()) && !/^(?:#|##|###|>)/.test(paras[i].textContent.trim())){
              var continuation = paras[i];
              if(continuation.textContent.trim()){
                li.innerHTML += ' ' + continuation.innerHTML.trim();
              }
              i++;
              continuation.remove();
            }
          }
          if(p.parentNode) p.parentNode.insertBefore(ul, p);
          else body.appendChild(ul);
          continue;
        }

        // 2) Chữ abc: a., b., c. hoặc a), b), c)
        var alphaMatch = text.match(/^([a-zA-Z])[\.\)]\s+(.*)$/);
        if(alphaMatch){
          var nextIsAlpha = (i + 1 < paras.length && paras[i + 1].tagName === 'P' && /^[a-zA-Z][\.\)]\s+/.test(paras[i + 1].textContent.trim()));
          var isStartLetter = /^[a-dA-D]/.test(alphaMatch[1]);
          if(isStartLetter || nextIsAlpha){
            var olAlpha = doc.createElement('ol');
            olAlpha.setAttribute('type', 'a');
            while(i < paras.length && paras[i].tagName === 'P'){
              var am = paras[i].textContent.trim().match(/^([a-zA-Z])[\.\)]\s+(.*)$/);
              if(!am) break;
              var li2 = doc.createElement('li');
              li2.innerHTML = paras[i].innerHTML.replace(/^\s*[a-zA-Z][\.\)]\s+/, '');
              olAlpha.appendChild(li2);
              var nextP2 = paras[i];
              i++;
              nextP2.remove();

              while(i < paras.length && paras[i].tagName === 'P' && !/^(?:[•\-\*]|[a-zA-Z][\.\)]|\d+[\.\)])\s+/.test(paras[i].textContent.trim()) && !/^(?:#|##|###|>)/.test(paras[i].textContent.trim())){
                var continuation2 = paras[i];
                if(continuation2.textContent.trim()){
                  li2.innerHTML += ' ' + continuation2.innerHTML.trim();
                }
                i++;
                continuation2.remove();
              }
            }
            if(p.parentNode) p.parentNode.insertBefore(olAlpha, p);
            else body.appendChild(olAlpha);
            continue;
          }
        }

        // 3) Số thứ tự: 1., 2., 3.
        var numMatch = text.match(/^(\d+)[\.\)]\s+(.*)$/);
        if(numMatch){
          var olNum = doc.createElement('ol');
          while(i < paras.length && paras[i].tagName === 'P'){
            var nm = paras[i].textContent.trim().match(/^(\d+)[\.\)]\s+(.*)$/);
            if(!nm) break;
            var li3 = doc.createElement('li');
            li3.innerHTML = paras[i].innerHTML.replace(/^\s*\d+[\.\)]\s+/, '');
            olNum.appendChild(li3);
            var nextP3 = paras[i];
            i++;
            nextP3.remove();

            while(i < paras.length && paras[i].tagName === 'P' && !/^(?:[•\-\*]|[a-zA-Z][\.\)]|\d+[\.\)])\s+/.test(paras[i].textContent.trim()) && !/^(?:#|##|###|>)/.test(paras[i].textContent.trim())){
              var continuation3 = paras[i];
              if(continuation3.textContent.trim()){
                li3.innerHTML += ' ' + continuation3.innerHTML.trim();
              }
              i++;
              continuation3.remove();
            }
          }
          if(p.parentNode) p.parentNode.insertBefore(olNum, p);
          else body.appendChild(olNum);
          continue;
        }
      }
      i++;
    }
  }

  function insertPastedImageFigure(dataUrl, altText){
    var safeAlt = (altText || 'Hình minh họa').replace(/\s+/g, ' ').trim();
    var figureHtml = '<figure class="kb-figure"><img src="' + escapeHTML(dataUrl) + '" alt="' + escapeHTML(safeAlt) + '" loading="lazy" /><figcaption>' + parseInlineMarkdown(safeAlt) + '</figcaption></figure>';
    document.execCommand('insertHTML', false, figureHtml + '<p><br></p>');
    scheduleSave();
    updateToolbarState();
  }

  function cleanPastedHTML(rawHtml){
    var parser = new DOMParser();
    var doc = parser.parseFromString(rawHtml, 'text/html');
    var body = doc.body;
    if(!body) return '';

    // 1. Loại bỏ các thẻ không dùng cho ghi chú
    var junk = body.querySelectorAll('script, style, meta, link, noscript, iframe, object, embed, svg, canvas, audio, video, form, input, button, select, textarea');
    junk.forEach(function(el){ el.remove(); });

    // 2. Loại bỏ comment HTML <!-- ... -->
    var iter = doc.createNodeIterator(body, NodeFilter.SHOW_COMMENT, null);
    var cNode;
    var comments = [];
    while((cNode = iter.nextNode())){ comments.push(cNode); }
    comments.forEach(function(c){ if(c.parentNode) c.parentNode.removeChild(c); });

    // 3. Chuẩn hoá các phần tử trong cây DOM
    function sanitize(node){
      var children = Array.from(node.childNodes);
      for(var i = 0; i < children.length; i++){
        var child = children[i];
        if(child.nodeType === Node.ELEMENT_NODE){
          sanitize(child);

          var tag = child.tagName.toLowerCase();

          // Xử lý các cấp heading 4, 5, 6 -> đưa về h3 chuẩn của sổ tay
          if(tag === 'h4' || tag === 'h5' || tag === 'h6'){
            var h3 = doc.createElement('h3');
            while(child.firstChild) h3.appendChild(child.firstChild);
            child.parentNode.replaceChild(h3, child);
            child = h3;
            tag = 'h3';
          }

          // Xử lý span, font, wrapper vô nghĩa: dỡ bỏ thẻ bọc ngoài, giữ nguyên nội dung
          if(tag === 'span' || tag === 'font' || tag === 'nobr'){
            while(child.firstChild){
              child.parentNode.insertBefore(child.firstChild, child);
            }
            child.parentNode.removeChild(child);
            continue;
          }

          // Xử lý div / section / article / v.v.
          if(tag === 'div' || tag === 'section' || tag === 'article' || tag === 'aside' || tag === 'header' || tag === 'footer'){
            var hasBlock = child.querySelector('p, h1, h2, h3, ul, ol, table, blockquote, div');
            if(hasBlock){
              while(child.firstChild){
                child.parentNode.insertBefore(child.firstChild, child);
              }
              child.parentNode.removeChild(child);
              continue;
            } else {
              var p = doc.createElement('p');
              while(child.firstChild) p.appendChild(child.firstChild);
              child.parentNode.replaceChild(p, child);
              child = p;
              tag = 'p';
            }
          }

          // Xử lý thẻ b, strong, i, em: nếu rỗng thì xoá
          if((tag === 'b' || tag === 'strong' || tag === 'i' || tag === 'em' || tag === 'u') && !child.textContent.trim()){
            child.parentNode.removeChild(child);
            continue;
          }

          // Giữ ảnh và chuẩn hoá đẹp mắt khi dán từ web/Word
          if(tag === 'img'){
            var imgSrc = child.getAttribute('src') || '';
            if(!imgSrc || !/^(data:image\/(png|jpeg|jpg|gif|webp)|https?:\/\/|\/\/)/i.test(imgSrc)){
              child.parentNode.removeChild(child);
              continue;
            }
            child.setAttribute('loading', 'lazy');
            child.setAttribute('alt', child.getAttribute('alt') || 'Hình minh họa');
            child.removeAttribute('width');
            child.removeAttribute('height');
            child.style.maxWidth = '100%';
            child.style.display = 'block';
            child.style.margin = '0 auto';
            child.style.borderRadius = '12px';
            child.style.border = '1px solid rgba(51,88,106,0.15)';
            child.style.boxShadow = '0 10px 22px rgba(31,41,55,0.08)';
            child.style.background = '#fff';
            continue;
          }

          if(tag === 'figure'){
            child.classList.add('kb-figure');
          }

          if(tag === 'figcaption'){
            child.classList.add('kb-figure-caption');
          }

          // Nhận diện căn lề của ô bảng hoặc đoạn văn bản
          var itemAlign = null;
          var alignAttr = child.getAttribute('align') || child.getAttribute('data-align');
          var valignAttr = child.getAttribute('valign') || child.getAttribute('data-valign');
          var styleAttr = child.getAttribute('style') || '';
          if(alignAttr && /^(left|center|right)$/i.test(alignAttr)){
            itemAlign = alignAttr.toLowerCase();
          } else if(/text-align\s*:\s*center/i.test(styleAttr)){
            itemAlign = 'center';
          } else if(/text-align\s*:\s*right/i.test(styleAttr)){
            itemAlign = 'right';
          } else if(/text-align\s*:\s*left/i.test(styleAttr)){
            itemAlign = 'left';
          }
          var itemVAlign = null;
          if(valignAttr && /^(top|middle|bottom)$/i.test(valignAttr)){
            itemVAlign = valignAttr.toLowerCase();
          } else if(/vertical-align\s*:\s*middle/i.test(styleAttr)){
            itemVAlign = 'middle';
          } else if(/vertical-align\s*:\s*bottom/i.test(styleAttr)){
            itemVAlign = 'bottom';
          } else if(/vertical-align\s*:\s*top/i.test(styleAttr)){
            itemVAlign = 'top';
          }

          // Nhận diện danh sách chữ abc nếu ol có type="a" hoặc có style chứa lower-alpha
          var isAlphaList = false;
          if(tag === 'ol'){
            var typeAttr = child.getAttribute('type');
            if(typeAttr === 'a' || /lower-alpha/i.test(styleAttr)){
              isAlphaList = true;
            }
          }

          // Xoá TOÀN BỘ thuộc tính ngoại lai (style, class, id, font, color, v.v.)
          var attrs = Array.from(child.attributes);
          for(var a = 0; a < attrs.length; a++){
            var attrName = attrs[a].name.toLowerCase();
            if(tag === 'a' && attrName === 'href'){
              var href = child.getAttribute('href');
              if(!/^(https?:\/\/|mailto:|#)/i.test(href)){
                child.removeAttribute('href');
              }
            } else if((tag === 'ol' && attrName === 'start') ||
                      (tag === 'td' || tag === 'th') && (attrName === 'colspan' || attrName === 'rowspan')){
              // giữ colspan / rowspan
            } else {
              child.removeAttribute(attrs[a].name);
            }
          }

          // Gán lại type="a" nếu là danh sách chữ abc
          if(isAlphaList){
            child.setAttribute('type', 'a');
          }

          // Áp dụng lại căn lề chuẩn sạch
          if(itemAlign && (tag === 'td' || tag === 'th')){
            child.style.textAlign = itemAlign;
            child.setAttribute('data-align', itemAlign);
          } else if(itemAlign && itemAlign !== 'left' && (tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'blockquote')){
            child.style.textAlign = itemAlign;
          }
          if(itemVAlign && (tag === 'td' || tag === 'th')){
            child.style.verticalAlign = itemVAlign;
            child.setAttribute('data-valign', itemVAlign);
          }
        }
      }
    }

    sanitize(body);

    // 4. Chuyển đổi các đoạn <p> dạng "a. ", "1. ", "• " thành danh sách chuẩn
    convertPseudoListParagraphs(body, doc);

    // 5. Dọn dẹp p rỗng liên tiếp
    var html = body.innerHTML;
    html = html.replace(/(<p><br\s*\/?><\/p>\s*){2,}/gi, '<p><br></p>');
    return html.trim();
  }

  function cleanPastedContent(clipboardData){
    var rawHtml = clipboardData.getData('text/html');
    var rawText = clipboardData.getData('text/plain') || '';

    // Nếu chỉ có 1 dòng văn bản thuần, không có ký tự cấu trúc đặc biệt:
    var lines = rawText.split(/\r?\n/);
    if(lines.length === 1 && !rawHtml){
      var t = lines[0].trim();
      if(!/^#{1,6}\s+/.test(t) && !/^[-*•+]\s+/.test(t) && !/^[a-zA-Z0-9]+[\.\)]\s+/.test(t)){
        return { type: 'text', content: rawText };
      }
    }

    if(rawHtml && rawHtml.trim()){
      var cleaned = cleanPastedHTML(rawHtml);
      var temp = document.createElement('div');
      temp.innerHTML = cleaned;
      if(temp.textContent.trim().length > 0){
        return { type: 'html', content: cleaned };
      }
    }

    return { type: 'html', content: parsePlainTextToHTML(rawText) };
  }

  /* ---------------- dán văn bản: luôn ép về font/size & kiểu dáng chuẩn đặc trưng của sổ tay ---------------- */
  els.editor.addEventListener('paste', function(ev){
    ensureEditableFocus();
    var clipboardData = ev.clipboardData || window.clipboardData;
    if(!clipboardData) return;

    var items = clipboardData.items || [];
    for(var i = 0; i < items.length; i++){
      var item = items[i];
      if(item && item.kind === 'file' && item.type.indexOf('image/') === 0){
        ev.preventDefault();
        var file = item.getAsFile();
        if(!file) return;
        var reader = new FileReader();
        reader.onload = function(evt){
          insertPastedImageFigure(evt.target.result, 'Hình minh họa');
        };
        reader.readAsDataURL(file);
        return;
      }
    }

    ev.preventDefault();
    var result = cleanPastedContent(clipboardData);
    if(!result) return;

    if(result.type === 'text'){
      document.execCommand('insertText', false, result.content);
    } else {
      document.execCommand('insertHTML', false, result.content);
      upgradeTables(els.editor);
    }

    scheduleSave();
    updateToolbarState();
  });

  /* ---------------- export / import (sao lưu thủ công, không bắt buộc) ---------------- */
  els.exportBtn.addEventListener('click', async function(){
    var payload = { index: state.index, notes: {} };
    for(var i = 0; i < state.index.length; i++){
      var n = state.index[i];
      payload.notes[n.id] = await loadNote(n.id);
    }
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'so-tay-kien-thuc-backup.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  els.importBtn.addEventListener('click', function(){ els.importInput.click(); });
  els.importInput.addEventListener('change', function(){
    var file = els.importInput.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = async function(){
      try{
        var payload = JSON.parse(reader.result);
        if(!payload.index || !payload.notes) throw new Error('sai định dạng');
        for(var i = 0; i < payload.index.length; i++){
          var meta = payload.index[i];
          var existing = state.index.find(function(n){ return n.id === meta.id; });
          if(!existing) state.index.push(meta);
          await saveNote(meta.id, payload.notes[meta.id]);
        }
        await saveIndex();
        renderList();
        alert('Nhập dữ liệu thành công.');
      }catch(e){
        alert('Không đọc được tệp sao lưu. Hãy kiểm tra lại tệp JSON.');
      }
      els.importInput.value = '';
    };
    reader.readAsText(file);
  });

  /* ---------------- search / new ---------------- */
  els.sidebarToggle.addEventListener('click', function(){
    setSidebarOpen(!els.app.classList.contains('sidebar-open'));
  });
  els.sidebarBackdrop.addEventListener('click', function(){ setSidebarOpen(false); });
  els.search.addEventListener('input', renderList);
  els.newBtn.addEventListener('click', function(){ createNote(); });
  els.noNoteCreate.addEventListener('click', function(){ createNote(); });

  /* Prevent iOS from zooming focused fields without changing their visual font size. */
  function installMobileFocusZoomGuard(){
    if(!window.matchMedia('(max-width: 760px)').matches) return;
    var viewport = document.querySelector('meta[name="viewport"]');
    if(!viewport) return;
    var originalContent = viewport.getAttribute('content') || '';
    var focusedEditable = null;

    document.addEventListener('focusin', function(event){
      var target = event.target;
      if(!(target instanceof Element)) return;
      var editable = target.closest('input:not([type="file"]), textarea, [contenteditable="true"]');
      if(!editable) return;
      focusedEditable = editable;
      viewport.setAttribute('content', originalContent + ', maximum-scale=1');
    });

    document.addEventListener('focusout', function(event){
      var target = event.target;
      if(!(target instanceof Element) || target.closest('input:not([type="file"]), textarea, [contenteditable="true"]') !== focusedEditable) return;
      focusedEditable = null;
      viewport.setAttribute('content', originalContent);
    });
  }

  installMobileFocusZoomGuard();

  /* ---------------- ghi chú hướng dẫn mẫu ---------------- */
  function guideHTML(){
    return '<h2>Chào mừng bạn!</h2>' +
      '<p>Đây là ví dụ cho thấy cách trình bày một chủ đề kiến thức. Bạn có thể xoá ghi chú này sau khi đã quen tay.</p>' +
      '<h3>1. Tiêu đề &amp; đoạn văn</h3>' +
      '<p>Dùng nút <b>H1 / H2 / H3</b> trên thanh công cụ để tạo tiêu đề mục, và <b>¶</b> để quay về văn bản thường. Mỗi cấp tiêu đề có kiểu dáng đặc trưng riêng: <b>H1</b> mang dáng dấp chương sách với đường gạch chân trang trọng; <b>H2</b> nổi bật với vạch màu nhấn bên trái; <b>H3</b> mang sắc xanh nhấn thanh lịch. Dù sao chép văn bản từ bất cứ đâu (Word, Google Docs, website, ChatGPT, Markdown) dán vào, trang đều tự động làm sạch phông chữ/cỡ chữ lạ và định dạng chuẩn xác theo kiểu dáng đặc trưng của sổ tay.</p>' +
      '<h3>2. Danh sách</h3>' +
      '<ul><li>Dùng nút "• Danh sách" cho liệt kê không thứ tự</li><li>Dùng "1. Danh sách" khi cần thứ tự số (1, 2, 3…)</li><li>Dùng "a. Danh sách" khi cần thứ tự chữ cái (a, b, c…)</li></ul>' +
      '<h3>3. Mục tự kiểm tra Đúng / Sai</h3>' +
      '<p>Nhấn "☑ Dòng Đúng/Sai" để chèn cả một dòng khẳng định kèm nhãn, hoặc nhấn "◐ Icon Đ/S" để chèn một icon nhỏ đặt được ở bất kỳ đâu — trong đoạn văn, tiêu đề, hay từng ô của bảng. Bấm vào icon để chuyển trạng thái: ? → ✓ Đúng → ✕ Sai.</p>' +
      '<div class="kb-check" data-status="correct" contenteditable="false"><button type="button" class="kb-check-btn" contenteditable="false"></button><div class="kb-check-text" contenteditable="true">Trái Đất quay quanh Mặt Trời.</div><span class="kb-check-tag">Đúng</span></div>' +
      '<div class="kb-check" data-status="incorrect" contenteditable="false"><button type="button" class="kb-check-btn" contenteditable="false"></button><div class="kb-check-text" contenteditable="true">Mặt Trời quay quanh Trái Đất.</div><span class="kb-check-tag">Sai</span></div>' +
      '<div class="kb-check" data-status="none" contenteditable="false"><button type="button" class="kb-check-btn" contenteditable="false"></button><div class="kb-check-text" contenteditable="true">Bấm vào ô vuông bên trái để tự đánh giá câu này.</div><span class="kb-check-tag">Chưa xác định</span></div>' +
      '<h3>4. Bảng — kéo được viền &amp; căn lề từng ô / cột</h3>' +
      '<p>Nhấn "▦ Bảng" để chèn bảng, gõ trực tiếp vào từng ô. Bạn có thể căn lề (<b>Trái / Giữa / Phải</b>) cho từng ô hoặc cả cột bằng các nút căn lề trên thanh công cụ chính hoặc các nút nhỏ ngay trên đầu bảng. Đưa chuột tới sát viền phải một ô đầu bảng để kéo đổi độ rộng cột, hoặc sát viền dưới một hàng để kéo đổi chiều cao hàng.</p>' +
      buildTableHTML(3,3).replace('Cột 1','Thuật ngữ').replace('Cột 2','Định nghĩa').replace('Cột 3','Tự đánh giá') +
      '<h3>5. Lưu trữ</h3>' +
      '<p>Nội dung được lưu khi bạn nhấn <b>Ctrl + S</b> (hoặc <b>Command + S</b> trên macOS), hoặc tự động lưu định kỳ mỗi 1 phút nếu có thay đổi. Mọi dữ liệu lưu qua một API riêng, gắn với địa chỉ trang này (không cần thêm gì vào URL) — mở đúng trang trên bất kỳ thiết bị nào cũng thấy và sửa được cùng dữ liệu, không cần đăng nhập. Dùng nút "🔗 Sao chép link chia sẻ" ở cuối danh sách bên trái để gửi cho thiết bị khác hoặc người khác — nhớ rằng ai có link đó cũng sửa được.</p>';
  }

  /* ---------------- init ---------------- */
  async function init(){
    updateStorageStatusUI();
    await loadIndex();
    if(state.index.length === 0){
      await createNote({ title: 'Hướng dẫn sử dụng', html: guideHTML() });
      return;
    }
    renderList();
    var lastId = await Api.getLast();
    var target = state.index.find(function(n){ return n.id === lastId; }) ||
      state.index.slice().sort(function(a,b){ return b.updatedAt - a.updatedAt; })[0];
    if(target) await openNote(target.id);
  }

  init().catch(function(err){
    apiBroken = true;
    updateStorageStatusUI();
    console.error('Không thể khởi tạo sổ tay:', err);
  });
})();
