(function () {
  const $ = (s) => document.querySelector(s);
  const lookupId = $('#lookupId');
  const status = $('#lookupStatus');
  const result = $('#lookupResult');
  const video = $('#readerVideo');
  let stream = null;
  let scanTimer = null;
  let fullCccd = '';
  let revealed = false;

  function showStatus(type, text) {
    status.className = 'status show ' + type;
    status.textContent = text;
  }

  function formatDateVi(iso) {
    if (!iso) return '—';
    const s = String(iso);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function formatBirthYear(v) {
    if (!v) return '—';
    const m = String(v).match(/^(\d{4})/);
    return m ? m[1] : '—';
  }

  function formatDateTimeVi(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const parts = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Saigon',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
  }

  function mask(cccd) {
    const s = String(cccd || '');
    if (!s) return '—';
    if (s.length <= 4) return '****';
    return s.slice(0, 3) + '******' + s.slice(-3);
  }

  function displayId(id) {
    const s = String(id || '');
    let body = s.replace(/^TQ/i, '');
    if (/^\d+$/.test(body)) {
      const parts = body.match(/.{1,3}/g) || [body];
      return 'TQ ' + parts.join(' ');
    }
    return body ? ('TQ ' + body) : '—';
  }


  async function fetchWithRetry(url, options, { retries = 6, delay = 1500, timeout = 12000, onRetry } = {}) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(url, { ...(options || {}), signal: ctrl.signal });
        clearTimeout(timer);
        if ([502, 503, 504, 521, 522, 523, 524].includes(res.status) && i < retries) {
          if (onRetry) onRetry(i + 1);
          await new Promise((r) => setTimeout(r, delay * Math.min(i + 1, 4)));
          continue;
        }
        return res;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        if (i < retries) {
          if (onRetry) onRetry(i + 1);
          await new Promise((r) => setTimeout(r, delay * Math.min(i + 1, 4)));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr || new Error('NETWORK');
  }

  async function lookup(raw) {
    const q = encodeURIComponent(String(raw || '').trim());
    if (!q) { showStatus('err', 'Nhập ID hoặc payload QR.'); return; }
    showStatus('info', 'Đang tra cứu…');
    result.classList.remove('show');
    try {
      const res = await fetchWithRetry('/api/records/' + q, {}, { retries: 6, delay: 1500, onRetry() { showStatus('info', 'Đang thử lại kết nối…'); } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'NOT_FOUND');
      fullCccd = data.cccd || '';
      revealed = false;
      $('#lrId').textContent = data.displayId || displayId(data.id);
      $('#lrName').textContent = data.name || '—';
      $('#lrDob').textContent = formatBirthYear(data.dob);
      if ($('#lrGender')) $('#lrGender').textContent = data.gender || '—';
      $('#lrPassport').textContent = data.passportNo || '—';
      $('#lrNationality').textContent = data.nationality || data.country || '—';
      $('#lrDate').textContent = formatDateVi(data.issueDate || data.savedAt || data.updatedAt);
      $('#lrAddress').textContent = data.address || '—';
      if ($('#lrCountry')) $('#lrCountry').textContent = data.country || data.nationality || '—';
      if ($('#lrProvince')) $('#lrProvince').textContent = data.province || '—';
      $('#lrPhone').textContent = data.phoneMasked || data.phone || '—';
      $('#lrKyc').textContent = data.kyc || 'skipped';
      if ($('#lrSource')) $('#lrSource').textContent = data.source || 'manual';
      if ($('#lrFaceConsent')) {
        if (data.faceConsent) {
          const when = formatDateTimeVi(data.faceConsentAt);
          $('#lrFaceConsent').textContent = when ? ('Có · ' + when) : 'Có';
        } else {
          $('#lrFaceConsent').textContent = 'Không';
        }
      }
      $('#lrSig').textContent = data.signatureVerified ? 'Hợp lệ ✓' : 'Không có / chưa kiểm';
      $('#lrCccd').textContent = data.cccdMasked || mask(fullCccd);
      $('#btnReveal').textContent = 'Hiện';
      $('#btnReveal').style.display = fullCccd ? '' : 'none';
      result.classList.add('show');
      showStatus('ok', 'Đã tải hồ sơ ' + (data.displayId || displayId(data.id)));
    } catch (e) {
      showStatus('err', 'Tra cứu thất bại: ' + (e.message || e));
    }
  }

  $('#btnLookup').addEventListener('click', () => lookup(lookupId.value));
  lookupId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookup(lookupId.value);
  });

  $('#btnReveal').addEventListener('click', () => {
    if (!fullCccd) return;
    revealed = !revealed;
    $('#lrCccd').textContent = revealed ? fullCccd : mask(fullCccd);
    $('#btnReveal').textContent = revealed ? 'Ẩn' : 'Hiện';
  });

  function stopCam() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    video.classList.remove('show');
  }

  async function startCam() {
    try {
      stopCam();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } }
      });
      video.srcObject = stream;
      await video.play();
      video.classList.add('show');
      showStatus('info', 'Đưa QR vào khung hình…');
      const canvas = $('#readerCanvas');
      const ctx = canvas.getContext('2d');
      scanTimer = setInterval(() => {
        if (!video.videoWidth) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = typeof jsQR === 'function' ? jsQR(img.data, img.width, img.height) : null;
        if (code && code.data) {
          lookupId.value = code.data.trim();
          stopCam();
          lookup(lookupId.value);
        }
      }, 400);
    } catch (e) {
      showStatus('err', 'Không mở được camera: ' + (e.message || e) + '. Thử tải ảnh QR.');
    }
  }

  $('#btnCam').addEventListener('click', startCam);
  $('#btnScanFile').addEventListener('click', () => $('#scanFile').click());
  $('#scanFile').addEventListener('change', () => {
    const file = $('#scanFile').files && $('#scanFile').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = $('#readerCanvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = typeof jsQR === 'function' ? jsQR(data.data, data.width, data.height) : null;
        if (code && code.data) {
          lookupId.value = code.data.trim();
          lookup(lookupId.value);
        } else {
          showStatus('err', 'Không đọc được QR từ ảnh.');
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const params = new URLSearchParams(location.search);
  if (params.get('id')) {
    lookupId.value = params.get('id');
    lookup(lookupId.value);
  }
})();
