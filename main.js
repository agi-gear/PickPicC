/* ============================================================
   PickPicC – main.js
   ============================================================ */

(() => {
  'use strict';

  // ── DOM refs ───────────────────────────────────────────────
  const dropZone     = document.getElementById('drop-zone');
  const fileInput    = document.getElementById('file-input');
  const imageCanvas  = document.getElementById('image-canvas');
  const markerCanvas = document.getElementById('marker-canvas');
  const formatSelect = document.getElementById('format-select');
  const resetBtn     = document.getElementById('reset-btn');
  const historyList  = document.getElementById('history-list');
  const toast        = document.getElementById('toast');

  const imgCtx    = imageCanvas.getContext('2d', { willReadFrequently: true });
  const markerCtx = markerCanvas.getContext('2d');

  // ── State ──────────────────────────────────────────────────
  let loadedImage = null;   // HTMLImageElement
  let history     = [];     // [{ x, y, r, g, b }]
  let toastTimer  = null;

  // ── Helpers: color conversion ─────────────────────────────

  /** RGB (0-255) → HSV { h, s, v } in [0-1] range */
  function rgbToHsvRaw(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d   = max - min;
    let h = 0;
    if (d !== 0) {
      if      (max === rn) h = ((gn - bn) / d + 6) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else                  h = (rn - gn) / d + 4;
      h /= 6;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
  }

  /** Format a color entry according to the selected format */
  function formatColor(entry, fmt) {
    const { r, g, b } = entry;
    if (fmt === 'rgb255') {
      return `R: ${r}  G: ${g}  B: ${b}`;
    }
    const { h, s, v } = rgbToHsvRaw(r, g, b);
    if (fmt === 'hsv360_100') {
      return `H: ${Math.round(h * 360)}  S: ${Math.round(s * 100)}  V: ${Math.round(v * 100)}`;
    }
    if (fmt === 'hsv180_255') {
      return `H: ${Math.round(h * 180)}  S: ${Math.round(s * 255)}  V: ${Math.round(v * 255)}`;
    }
    if (fmt === 'hsv360_255') {
      return `H: ${Math.round(h * 360)}  S: ${Math.round(s * 255)}  V: ${Math.round(v * 255)}`;
    }
    return '';
  }

  /** CSS color string for a swatch */
  function toCssColor({ r, g, b }) {
    return `rgb(${r},${g},${b})`;
  }

  // ── Canvas sizing ─────────────────────────────────────────

  function fitCanvases(img) {
    const zone = dropZone.getBoundingClientRect();
    const pad  = 0;
    const zw   = zone.width  - pad;
    const zh   = zone.height - pad;
    const scale = Math.min(zw / img.naturalWidth, zh / img.naturalHeight, 1);
    const w = Math.floor(img.naturalWidth  * scale);
    const h = Math.floor(img.naturalHeight * scale);

    // Center within drop-zone
    const left = Math.floor((zone.width  - w) / 2);
    const top  = Math.floor((zone.height - h) / 2);

    for (const c of [imageCanvas, markerCanvas]) {
      c.width  = w;
      c.height = h;
      c.style.left = left + 'px';
      c.style.top  = top  + 'px';
    }

    imgCtx.drawImage(img, 0, 0, w, h);
    redrawMarkers();
  }

  // ── Marker drawing ────────────────────────────────────────

  function redrawMarkers() {
    const w = markerCanvas.width;
    const h = markerCanvas.height;
    markerCtx.clearRect(0, 0, w, h);

    history.forEach((entry, idx) => {
      const { cx, cy } = entry; // canvas coords
      const size = 10;

      // Crosshair – dark outline first, then white line on top
      markerCtx.save();
      markerCtx.lineCap = 'round';
      // outline
      markerCtx.strokeStyle = 'rgba(0,0,0,0.75)';
      markerCtx.lineWidth   = 3.5;
      markerCtx.beginPath();
      markerCtx.moveTo(cx - size, cy); markerCtx.lineTo(cx + size, cy);
      markerCtx.moveTo(cx, cy - size); markerCtx.lineTo(cx, cy + size);
      markerCtx.stroke();
      // white line
      markerCtx.strokeStyle = 'rgba(255,255,255,0.95)';
      markerCtx.lineWidth   = 1.5;
      markerCtx.beginPath();
      markerCtx.moveTo(cx - size, cy); markerCtx.lineTo(cx + size, cy);
      markerCtx.moveTo(cx, cy - size); markerCtx.lineTo(cx, cy + size);
      markerCtx.stroke();

      // Dot – center filled with picked color, outlined
      markerCtx.beginPath();
      markerCtx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      markerCtx.fillStyle = toCssColor(entry);
      markerCtx.fill();
      markerCtx.strokeStyle = 'rgba(0,0,0,0.8)';
      markerCtx.lineWidth   = 1.5;
      markerCtx.stroke();
      markerCtx.restore();

      // Index badge with shadow
      markerCtx.save();
      markerCtx.font         = 'bold 10px sans-serif';
      markerCtx.shadowColor  = 'rgba(0,0,0,1)';
      markerCtx.shadowBlur   = 4;
      markerCtx.shadowOffsetX = 0;
      markerCtx.shadowOffsetY = 0;
      markerCtx.fillStyle    = '#fff';
      markerCtx.fillText(idx + 1, cx + 6, cy - 6);
      markerCtx.restore();
    });
  }

  // ── History panel ─────────────────────────────────────────

  function buildHistoryCard(entry, idx) {
    const li = document.createElement('li');
    li.className = 'history-card';
    li.dataset.idx = idx;

    const fmt    = formatSelect.value;
    const color  = toCssColor(entry);
    const valStr = formatColor(entry, fmt);

    li.innerHTML = `
      <div class="card-inner">
        <div class="swatch" style="background:${color}"></div>
        <div class="card-text">
          <div class="card-row1"><span class="index">#${idx + 1}</span><span class="coord">(${entry.px}, ${entry.py})</span></div>
          <div class="color-value">${valStr}</div>
        </div>
        <span class="copy-hint">コピー</span>
      </div>
    `;

    li.addEventListener('click', () => {
      const text = formatColor(entry, formatSelect.value);
      navigator.clipboard.writeText(text).then(() => {
        showToast(`コピーしました: ${text}`);
      }).catch(() => {
        showToast('コピーに失敗しました');
      });
    });

    return li;
  }

  function renderHistory() {
    historyList.innerHTML = '';
    if (history.length === 0) {
      historyList.innerHTML = '<li class="empty-state">画像をクリックすると<br>ここに結果が表示されます</li>';
      return;
    }
    // newest first
    history.slice().reverse().forEach((entry, i) => {
      const realIdx = history.length - 1 - i;
      historyList.appendChild(buildHistoryCard(entry, realIdx));
    });
  }

  // ── Toast ─────────────────────────────────────────────────

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // ── Image loading ─────────────────────────────────────────

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('画像ファイルを選択してください');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        history = [];
        dropZone.classList.add('has-image');
        fitCanvases(img);
        renderHistory();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── Click on canvas ───────────────────────────────────────

  dropZone.addEventListener('click', (e) => {
    if (!loadedImage) {
      fileInput.click();
      return;
    }
    // Compute position relative to imageCanvas
    const rect = imageCanvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) return;

    const cx = Math.floor(e.clientX - rect.left);
    const cy = Math.floor(e.clientY - rect.top);

    const pixel = imgCtx.getImageData(cx, cy, 1, 1).data;
    const r = pixel[0], g = pixel[1], b = pixel[2];

    // px/py = pixel coords in original image
    const scaleX = imageCanvas.width  / loadedImage.naturalWidth;
    const scaleY = imageCanvas.height / loadedImage.naturalHeight;
    const px = Math.floor(cx / scaleX);
    const py = Math.floor(cy / scaleY);

    history.push({ r, g, b, cx, cy, px, py });
    redrawMarkers();
    renderHistory();
  });

  // ── Drag & drop ───────────────────────────────────────────

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    loadFile(file);
  });

  fileInput.addEventListener('change', () => {
    loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  // ── Reset ─────────────────────────────────────────────────

  resetBtn.addEventListener('click', () => {
    history = [];
    redrawMarkers();
    renderHistory();
  });

  // ── Format change → re-render values ─────────────────────

  formatSelect.addEventListener('change', () => {
    renderHistory();
  });

  // ── Clipboard paste (Ctrl+V) ──────────────────────────────

  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        loadFile(item.getAsFile());
        return;
      }
    }
  });

  // ── Resize → refit canvases ───────────────────────────────

  const resizeObserver = new ResizeObserver(() => {
    if (loadedImage) fitCanvases(loadedImage);
  });
  resizeObserver.observe(dropZone);

})();
