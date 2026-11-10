(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const VN_PROVINCES = [
    'Thành phố Hà Nội', 'Cao Bằng', 'Tuyên Quang', 'Điện Biên', 'Lai Châu', 'Sơn La',
    'Lào Cai', 'Thái Nguyên', 'Lạng Sơn', 'Quảng Ninh', 'Bắc Ninh', 'Phú Thọ',
    'Thành phố Hải Phòng', 'Hưng Yên', 'Ninh Bình', 'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh',
    'Quảng Trị', 'Thành phố Huế', 'Thành phố Đà Nẵng', 'Quảng Ngãi', 'Gia Lai',
    'Khánh Hòa', 'Đắk Lắk', 'Lâm Đồng', 'Đồng Nai', 'Thành phố Hồ Chí Minh',
    'Tây Ninh', 'Đồng Tháp', 'Vĩnh Long', 'An Giang', 'Thành phố Cần Thơ', 'Cà Mau'
  ];

  const state = {
    accountId: '',
    accountName: '',
    qrPayload: '',
    saved: false,
    step: 1,
    cccdFront: null,
    cccdBack: null,
    selfie: null,
    photo: null,
    skipCccd: false,
    skipFace: false,
    source: 'manual',
    issueDate: '',
    passportNo: '',
    scanStream: null,
    selfieStream: null,
    scanTimer: null
  };

  const els = {
    statusPill: $('#statusPill'),
    accountBanner: $('#accountBanner'),
    accountIdGroup: $('#accountIdGroup'),
    inputAccountId: $('#inputAccountId'),
    viewId: $('#viewId'),
    viewName: $('#viewName'),
    viewMeta: $('#viewMeta'),
    viewPassport: $('#viewPassport'),
    viewPhoto: $('#viewPhoto'),
    idcard: $('#idcard'),
    qrHost: $('#qrHost'),
    cardBadge: $('#cardBadge'),
    saveStatus: $('#saveStatus'),
    stepper: $('#stepper'),
    stepTitle: $('#stepTitle'),
    stepAccountId: $('#stepAccountId'),
    toast: $('#toast'),
    hintQr: $('#hintQr'),
    hintCccd: $('#hintCccd'),
    hintFace: $('#hintFace'),
    boxFront: $('#boxFront'),
    boxBack: $('#boxBack'),
    previewFront: $('#previewFront'),
    previewBack: $('#previewBack'),
    scanLiveWrap: $('#scanLiveWrap'),
    scanVideo: $('#scanVideo'),
    scanCanvas: $('#scanCanvas'),
    selfieVideo: $('#selfieVideo'),
    selfieCanvas: $('#selfieCanvas'),
    selfiePreview: $('#selfiePreview'),
    photoPreview: $('#photoPreview'),
    province: $('#inputProvince'),
    provinceText: $('#inputProvinceText'),
    provinceGroup: $('#provinceGroup')
  };

  function toast(msg, ms = 2800) {
    els.toast.hidden = false;
    els.toast.classList.add('show');
    els.toast.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      els.toast.classList.remove('show');
      els.toast.hidden = true;
    }, ms);
  }

  function showStatus(type, text) {
    els.saveStatus.className = 'status show ' + type;
    els.saveStatus.textContent = text;
  }

  function normalizeId(raw) {
    const id = String(raw || '').replace(/\s+/g, '').replace(/^(TQ|ID)[:\-]*/i, '');
    return /^[A-Za-z0-9]{4,20}$/.test(id) ? id : '';
  }

  function displayId(id) {
    const body = String(id || '').replace(/^TQ/i, '');
    if (/^\d+$/.test(body)) {
      return 'TQ ' + (body.match(/.{1,3}/g) || [body]).join(' ');
    }
    return body ? 'TQ ' + body : 'TQ ··· ···';
  }

  function formatDateVi(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
  }

  const DOC_HINT = 'Nhập CCCD (12 chữ số) hoặc hộ chiếu (1 chữ cái + 7 chữ số, ví dụ C1234567)';
  const DOC_INVALID = 'Số không hợp lệ. CCCD phải đúng 12 chữ số; hộ chiếu phải là 1 chữ cái và 7 chữ số (ví dụ C1234567).';

  function parseDocNo(raw) {
    const v = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!v) return { ok: false, empty: true, value: '', cccd: '', passportNo: '', error: DOC_HINT };
    if (/^\d{12}$/.test(v)) return { ok: true, empty: false, value: v, kind: 'cccd', cccd: v, passportNo: '', error: '' };
    if (/^[A-Z]\d{7}$/.test(v)) return { ok: true, empty: false, value: v, kind: 'passport', cccd: '', passportNo: v, error: '' };
    return { ok: false, empty: false, value: v, cccd: '', passportNo: '', error: DOC_INVALID };
  }

  function ddmmyyyyToIso(s) {
    const m = String(s || '').match(/^(\d{2})(\d{2})(\d{4})$/);
    if (!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  function fillProvinces() {
    els.province.innerHTML = '<option value="">— Chọn tỉnh/thành —</option>' +
      VN_PROVINCES.map((p) => `<option value="${p}">${p}</option>`).join('');
  }

  function matchProvince(addr) {
    const last = String(addr || '').split(',').map((s) => s.trim()).filter(Boolean).pop() || '';
    const n = (s) => s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/^tp\.?\s*|^thanh pho\s*|^tinh\s*/i, '')
      .replace(/\s+/g, ' ').trim();
    const target = n(last);
    if (!target) return '';
    let best = '';
    for (const p of VN_PROVINCES) {
      const pn = n(p);
      if (pn === target || pn.includes(target) || target.includes(pn)) {
        best = p;
        if (pn === target) break;
      }
    }
    // special HCMC
    if (!best && /ho chi minh|sai gon|hcm/i.test(target)) best = 'Thành phố Hồ Chí Minh';
    return best;
  }

  function updateCountryMode() {
    const c = ($('#inputCountry').value || '').trim();
    const isVN = !c || /^vi[eệ]t\s*nam$/i.test(c);
    els.province.hidden = !isVN;
    els.provinceText.hidden = isVN;
    if (isVN && !($('#inputCountry').value || '').trim()) {
      $('#inputCountry').value = 'Việt Nam';
    }
  }

  function renderQr(text) {
    els.qrHost.innerHTML = '';
    if (!text) {
      els.qrHost.innerHTML = '<div style="font-size:9px;color:#888;display:grid;place-items:center;height:100%;text-align:center;padding:4px">Đang tạo QR…</div>';
      return;
    }
    try {
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      const n = q.getModuleCount();
      const m = 2;
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${n + m * 2} ${n + m * 2}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d); path.setAttribute('fill', '#0b1f33');
      svg.append(bg, path);
      els.qrHost.appendChild(svg);
    } catch {
      els.qrHost.innerHTML = '<div style="font-size:8px;color:#c44;padding:4px">QR lỗi</div>';
    }
  }

  function updateCard() {
    els.viewId.textContent = displayId(state.accountId);
    const name = ($('#inputName').value || state.accountName || '').trim();
    els.viewName.textContent = (name || '—').toUpperCase();
    const country = ($('#inputCountry').value || 'Việt Nam').trim();
    els.viewMeta.textContent = `${country || '—'} · Cấp ngày ${formatDateVi(state.issueDate)}`;
    const doc = parseDocNo($('#inputDocNo') && $('#inputDocNo').value);
    const pass = state.passportNo || doc.passportNo || '';
    els.viewPassport.textContent = 'Hộ chiếu: ' + (pass || '—');
    if (state.photo) {
      els.viewPhoto.src = state.photo;
      els.idcard.classList.add('has-photo');
    }
    renderQr(state.qrPayload);
  }

  async function fetchQr(id) {
    state.qrPayload = '';
    renderQr('');
    try {
      const res = await fetch('/api/qr/' + encodeURIComponent(id));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'QR_FAILED');
      state.qrPayload = data.qrPayload;
      updateCard();
      return true;
    } catch (e) {
      showStatus('err', 'Không tạo được QR: ' + (e.message || e));
      return false;
    }
  }

  async function setAccount({ id, name }) {
    const nid = normalizeId(id);
    if (!nid) {
      showStatus('err', 'ID tài khoản không hợp lệ (4–20 A-Z/0-9).');
      els.accountBanner.textContent = 'ID không hợp lệ';
      return false;
    }
    state.accountId = nid;
    state.accountName = (name || '').trim();
    els.inputAccountId.value = nid;
    if (state.accountName && !$('#inputName').value) $('#inputName').value = state.accountName;
    els.accountBanner.textContent = 'Tài khoản: ' + (state.accountName || '—') + ' · ID ' + nid;
    els.stepAccountId.textContent = 'ID: ' + displayId(nid) + '  (' + nid + ')';
    const params = new URLSearchParams(location.search);
    if (params.get('id') || window.__tqFromBridge) {
      els.accountIdGroup.style.display = 'none';
    }
    if (!state.saved) {
      els.statusPill.textContent = 'CHƯA LƯU';
      els.statusPill.className = 'pill idle';
      els.cardBadge.textContent = 'DRAFT';
    }
    updateCard();
    return fetchQr(nid);
  }

  window.TravelQ = {
    setAccount: (obj) => { window.__tqFromBridge = true; return setAccount(obj || {}); },
    getAccountId: () => state.accountId,
    getQrPayload: () => state.qrPayload
  };
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'travelq:setAccount' || d.action === 'setAccount') {
      window.__tqFromBridge = true;
      setAccount({ id: d.id || d.accountId, name: d.name });
    }
  });

  function compressFile(file, maxEdge = 1600, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight;
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function dataUrlToImageData(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({ canvas: c, ctx, imgData: ctx.getImageData(0, 0, c.width, c.height) });
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function boostGray(imgData) {
    const d = new Uint8ClampedArray(imgData.data);
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g = Math.min(255, Math.max(0, (g - 128) * 1.6 + 128));
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    return new ImageData(d, imgData.width, imgData.height);
  }

  function tryJsQR(imgData) {
    if (typeof jsQR !== 'function') return null;
    return jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'attemptBoth' });
  }

  async function scanQrFromDataUrl(dataUrl) {
    const { canvas, ctx, imgData } = await dataUrlToImageData(dataUrl);
    const W = canvas.width, H = canvas.height;
    const attempts = [];
    attempts.push(imgData);
    attempts.push(boostGray(imgData));

    // full scaled versions
    for (const scale of [0.75, 0.5, 1.5, 2]) {
      const w = Math.max(1, Math.round(W * scale));
      const h = Math.max(1, Math.round(H * scale));
      if (w > 2400 || h > 2400) continue;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = true;
      x.drawImage(canvas, 0, 0, w, h);
      const id = x.getImageData(0, 0, w, h);
      attempts.push(id);
      attempts.push(boostGray(id));
    }

    // top-right crop (CCCD QR location) at several sizes
    const crops = [
      [0.55, 0, 0.45, 0.4],
      [0.6, 0, 0.4, 0.35],
      [0.5, 0, 0.5, 0.45],
      [0.65, 0.02, 0.33, 0.3]
    ];
    for (const [rx, ry, rw, rh] of crops) {
      const sx = Math.floor(W * rx), sy = Math.floor(H * ry);
      const sw = Math.floor(W * rw), sh = Math.floor(H * rh);
      for (const scale of [1, 2, 3]) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, sw * scale);
        c.height = Math.max(1, sh * scale);
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;
        x.drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
        const id = x.getImageData(0, 0, c.width, c.height);
        attempts.push(id);
        attempts.push(boostGray(id));
      }
    }

    for (const id of attempts) {
      const code = tryJsQR(id);
      if (code && code.data) return code.data.trim();
    }
    return null;
  }

  function parseCccdQr(raw) {
    const parts = String(raw || '').split('|');
    if (parts.length < 7) return null;
    const [soCccd, soCmnd, hoTen, ngaySinh, gioiTinh, diaChi, ngayCap] = parts;
    if (!/^\d{9,12}$/.test(soCccd)) return null;
    return {
      cccd: soCccd,
      name: (hoTen || '').trim(),
      dob: ddmmyyyyToIso(ngaySinh),
      gender: (gioiTinh || '').trim(),
      address: (diaChi || '').trim(),
      province: matchProvince(diaChi),
      country: 'Việt Nam',
      raw
    };
  }

  function applyCccdQr(parsed) {
    if (!parsed) return;
    state.source = 'cccd_qr';
    if (parsed.cccd && $('#inputDocNo')) $('#inputDocNo').value = parsed.cccd;
    if (parsed.name) $('#inputName').value = parsed.name;
    if (parsed.dob) $('#inputDob').value = parsed.dob;
    if (parsed.gender) $('#inputGender').value = parsed.gender;
    if (parsed.address) $('#inputAddress').value = parsed.address;
    $('#inputCountry').value = 'Việt Nam';
    updateCountryMode();
    if (parsed.province) els.province.value = parsed.province;
    updateDocHint();
    updateCard();
    toast('Đã lấy thông tin từ QR CCCD');
    els.hintQr.textContent = 'Đã quét QR CCCD ✓ — ' + parsed.name;
    els.hintQr.classList.add('ok');
  }

  async function handleCccdImage(file, which) {
    if (!file) return;
    state.skipCccd = false;
    const data = await compressFile(file, 1800, 0.85);
    if (which === 'front') {
      state.cccdFront = data;
      els.previewFront.src = data;
      els.boxFront.classList.add('has-img');
      els.hintQr.textContent = 'Đang quét QR trên ảnh mặt trước…';
      try {
        const raw = await scanQrFromDataUrl(data);
        if (raw) {
          const parsed = parseCccdQr(raw);
          if (parsed) applyCccdQr(parsed);
          else {
            els.hintQr.textContent = 'Đọc được QR nhưng không đúng định dạng CCCD VN. Bạn có thể nhập tay.';
            els.hintQr.classList.remove('ok');
          }
        } else {
          els.hintQr.textContent = 'Không tìm thấy QR trên ảnh. Thử chụp rõ góc trên phải hoặc dùng Quét QR live.';
          els.hintQr.classList.remove('ok');
        }
      } catch (e) {
        els.hintQr.textContent = 'Lỗi quét QR: ' + (e.message || e);
      }
    } else {
      state.cccdBack = data;
      els.previewBack.src = data;
      els.boxBack.classList.add('has-img');
    }
  }

  function stopScanLive() {
    if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = null; }
    if (state.scanStream) {
      state.scanStream.getTracks().forEach((t) => t.stop());
      state.scanStream = null;
    }
    els.scanLiveWrap.hidden = true;
    $('#btnStopScan').hidden = true;
  }

  async function startScanLive() {
    try {
      stopScanLive();
      state.scanStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } }
      });
      els.scanVideo.srcObject = state.scanStream;
      await els.scanVideo.play();
      els.scanLiveWrap.hidden = false;
      $('#btnStopScan').hidden = false;
      els.hintQr.textContent = 'Đưa QR CCCD vào khung hình…';
      const canvas = els.scanCanvas;
      const ctx = canvas.getContext('2d');
      state.scanTimer = setInterval(() => {
        const v = els.scanVideo;
        if (!v.videoWidth) return;
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let code = tryJsQR(img);
        if (!code) code = tryJsQR(boostGray(img));
        if (code && code.data) {
          const parsed = parseCccdQr(code.data.trim());
          if (parsed) {
            applyCccdQr(parsed);
            stopScanLive();
          }
        }
      }, 350);
    } catch (e) {
      toast('Không mở camera: ' + (e.message || e));
    }
  }

  function openStepper(step = 1) {
    state.step = step;
    els.stepper.hidden = false;
    document.body.classList.add('stepper-open');
    showStep(step);
  }

  function closeStepper() {
    stopScanLive();
    stopSelfie();
    els.stepper.hidden = true;
    document.body.classList.remove('stepper-open');
    updateCard();
  }

  function showStep(n) {
    state.step = n;
    $$('.step').forEach((el) => { el.hidden = Number(el.dataset.step) !== n; });
    $$('.progress-seg').forEach((el) => {
      const s = Number(el.dataset.step);
      el.classList.toggle('on', s === n);
      el.classList.toggle('done', s < n);
    });
    const titles = { 1: 'Bước 1/3 · Chụp CCCD', 2: 'Bước 2/3 · Thông tin', 3: 'Bước 3/3 · Khuôn mặt' };
    els.stepTitle.textContent = titles[n] || 'Cập nhật';
    if (n === 2) {
      els.stepAccountId.textContent = 'ID: ' + displayId(state.accountId) + '  (' + state.accountId + ')';
      updateCountryMode();
      updateDocHint();
    }
    if (n === 3) {
      // auto-try front camera
    }
  }

  function updateDocHint() {
    const doc = parseDocNo($('#inputDocNo') && $('#inputDocNo').value);
    els.hintCccd.classList.remove('ok', 'warn');
    if (!doc.ok) {
      els.hintCccd.textContent = doc.error;
      els.hintCccd.classList.add('warn');
      return false;
    }
    els.hintCccd.textContent = doc.kind === 'cccd' ? 'CCCD ✓' : 'Hộ chiếu ✓';
    els.hintCccd.classList.add('ok');
    return true;
  }

  function validateStep2() {
    const name = ($('#inputName').value || '').trim();
    const dob = $('#inputDob').value || '';
    const address = ($('#inputAddress').value || '').trim();
    const country = ($('#inputCountry').value || '').trim();
    const isVN = /^vi[eệ]t\s*nam$/i.test(country);
    const province = isVN ? (els.province.value || '') : (els.provinceText.value || '').trim();
    if (!name) return 'Thiếu họ và tên';
    if (!dob) return 'Thiếu ngày sinh';
    if (!address) return 'Thiếu nơi ở / địa chỉ';
    if (!country) return 'Thiếu quốc gia';
    if (isVN && !province) return 'Chọn tỉnh/thành phố';
    if (!isVN && !province) return 'Nhập tỉnh/thành (nước ngoài)';
    if (!updateDocHint()) return parseDocNo($('#inputDocNo') && $('#inputDocNo').value).error || DOC_HINT;
    return null;
  }

  function kycStatus() {
    const hasFront = !!state.cccdFront && !state.skipCccd;
    const hasBack = !!state.cccdBack && !state.skipCccd;
    const hasSelfie = !!state.selfie && !state.skipFace;
    if (hasFront && hasBack && hasSelfie) return 'complete';
    if (hasFront || hasBack || hasSelfie) return 'partial';
    return 'skipped';
  }

  function stopSelfie() {
    if (state.selfieStream) {
      state.selfieStream.getTracks().forEach((t) => t.stop());
      state.selfieStream = null;
    }
    els.selfieVideo.style.display = 'none';
  }

  async function maybeFaceCheck(dataUrl) {
    if (!('FaceDetector' in window)) {
      els.hintFace.textContent = 'FaceDetector không có — đã lưu selfie.';
      return;
    }
    try {
      const det = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const img = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const faces = await det.detect(img);
      els.hintFace.textContent = (faces && faces.length) ? 'Phát hiện khuôn mặt ✓' : 'Không thấy mặt rõ — vẫn có thể lưu.';
    } catch {
      els.hintFace.textContent = 'Không kiểm tra được mặt — vẫn lưu.';
    }
  }

  async function doSave() {
    if (!state.accountId) return showStatus('err', 'Thiếu ID tài khoản.');
    const err = validateStep2();
    if (err) {
      toast(err);
      showStep(2);
      return;
    }
    const isVN = /^vi[eệ]t\s*nam$/i.test(($('#inputCountry').value || '').trim());
    const province = isVN ? els.province.value : els.provinceText.value.trim();
    showStatus('info', 'Đang mã hoá & lưu…');
    $('#btnFinishSave').disabled = true;
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: state.accountId,
          name: ($('#inputName').value || '').trim(),
          docNo: ($('#inputDocNo').value || '').trim(),
          cccd: parseDocNo($('#inputDocNo').value).cccd,
          passportNo: parseDocNo($('#inputDocNo').value).passportNo,
          dob: $('#inputDob').value || '',
          address: ($('#inputAddress').value || '').trim(),
          phone: ($('#inputPhone').value || '').trim(),
          gender: $('#inputGender').value || '',
          country: ($('#inputCountry').value || '').trim(),
          province,
          nationality: ($('#inputCountry').value || '').trim(),
          cccdFrontDataUrl: state.skipCccd ? null : state.cccdFront,
          cccdBackDataUrl: state.skipCccd ? null : state.cccdBack,
          selfieDataUrl: state.skipFace ? null : state.selfie,
          photoDataUrl: state.photo,
          kyc: kycStatus(),
          source: state.source || 'manual'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.hint || 'SAVE_FAILED');
      state.qrPayload = data.qrPayload || state.qrPayload;
      state.issueDate = data.issueDate || (data.savedAt || '').slice(0, 10);
      state.passportNo = parseDocNo($('#inputDocNo').value).passportNo;
      state.saved = true;
      els.statusPill.textContent = 'ĐÃ LƯU';
      els.statusPill.className = 'pill ok';
      els.cardBadge.textContent = 'ACTIVE';
      updateCard();
      closeStepper();
      showStatus('ok', 'Đã lưu hồ sơ ' + displayId(state.accountId) + ' · KYC ' + kycStatus());
      toast('ĐÃ LƯU');
    } catch (e) {
      showStatus('err', 'Lưu thất bại: ' + (e.message || e));
      toast('Lưu thất bại: ' + (e.message || e));
    } finally {
      $('#btnFinishSave').disabled = false;
    }
  }

  // Expose for headless tests
  window.__tqTest = {
    parseCccdQr,
    applyCccdQr,
    scanQrFromDataUrl,
    openStepper,
    showStep,
    getState: () => state,
    doSave,
    setCccdFrontDataUrl: async (dataUrl) => {
      state.cccdFront = dataUrl;
      els.previewFront.src = dataUrl;
      els.boxFront.classList.add('has-img');
      const raw = await scanQrFromDataUrl(dataUrl);
      if (raw) {
        const p = parseCccdQr(raw);
        if (p) applyCccdQr(p);
        return p;
      }
      return null;
    }
  };

  // ===== Events =====
  $('#btnUpdate').addEventListener('click', () => openStepper(1));
  $('#btnStepClose').addEventListener('click', closeStepper);
  $('#btnStepBack').addEventListener('click', () => {
    if (state.step <= 1) closeStepper();
    else showStep(state.step - 1);
  });

  $('#btnFrontCam').addEventListener('click', () => $('#inputFrontCam').click());
  $('#btnFrontLib').addEventListener('click', () => $('#inputFrontLib').click());
  $('#btnBackCam').addEventListener('click', () => $('#inputBackCam').click());
  $('#btnBackLib').addEventListener('click', () => $('#inputBackLib').click());
  $('#inputFrontCam').addEventListener('change', () => handleCccdImage($('#inputFrontCam').files[0], 'front'));
  $('#inputFrontLib').addEventListener('change', () => handleCccdImage($('#inputFrontLib').files[0], 'front'));
  $('#inputBackCam').addEventListener('change', () => handleCccdImage($('#inputBackCam').files[0], 'back'));
  $('#inputBackLib').addEventListener('change', () => handleCccdImage($('#inputBackLib').files[0], 'back'));

  $('#btnScanQrLive').addEventListener('click', startScanLive);
  $('#btnStopScan').addEventListener('click', stopScanLive);
  $('#btnSkipCccd').addEventListener('click', () => {
    state.skipCccd = true;
    stopScanLive();
    showStep(2);
  });
  $('#btnStep1Next').addEventListener('click', () => {
    stopScanLive();
    showStep(2);
  });

  $('#btnStep2Next').addEventListener('click', () => {
    const err = validateStep2();
    if (err) return toast(err);
    showStep(3);
  });

  $('#inputCountry').addEventListener('input', updateCountryMode);
  $('#inputCountry').addEventListener('change', updateCountryMode);
  $('#inputDocNo').addEventListener('input', () => {
    const el = $('#inputDocNo');
    el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    updateDocHint();
    updateCard();
  });
  ['inputName', 'inputDob', 'inputCountry'].forEach((id) => {
    $('#' + id).addEventListener('input', updateCard);
    $('#' + id).addEventListener('change', updateCard);
  });

  $('#btnPhoto').addEventListener('click', () => $('#photoInput').click());
  $('#photoInput').addEventListener('change', async () => {
    const f = $('#photoInput').files && $('#photoInput').files[0];
    if (!f) return;
    state.photo = await compressFile(f, 1200, 0.85);
    els.photoPreview.src = state.photo;
    els.photoPreview.hidden = false;
    updateCard();
  });

  $('#btnSelfieCam').addEventListener('click', async () => {
    try {
      stopSelfie();
      state.selfieStream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: 'user' }
      });
      els.selfieVideo.srcObject = state.selfieStream;
      els.selfieVideo.style.display = 'block';
      els.selfiePreview.hidden = true;
      await els.selfieVideo.play();
      $('#btnSelfieSnap').disabled = false;
      $('#btnSelfieRetake').hidden = true;
    } catch (e) {
      toast('Không mở camera: ' + (e.message || e));
    }
  });

  $('#btnSelfieSnap').addEventListener('click', async () => {
    const v = els.selfieVideo;
    if (!v.videoWidth) return;
    const c = els.selfieCanvas;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const raw = c.toDataURL('image/jpeg', 0.92);
    const blob = await (await fetch(raw)).blob();
    state.selfie = await compressFile(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }), 1200, 0.85);
    state.skipFace = false;
    els.selfiePreview.src = state.selfie;
    els.selfiePreview.hidden = false;
    stopSelfie();
    $('#btnSelfieRetake').hidden = false;
    $('#btnSelfieSnap').disabled = true;
    await maybeFaceCheck(state.selfie);
  });

  $('#btnSelfieRetake').addEventListener('click', () => {
    state.selfie = null;
    els.selfiePreview.hidden = true;
    $('#btnSelfieCam').click();
  });

  $('#btnSelfieFile').addEventListener('click', () => $('#inputSelfieFile').click());
  $('#inputSelfieFile').addEventListener('change', async () => {
    const f = $('#inputSelfieFile').files && $('#inputSelfieFile').files[0];
    if (!f) return;
    state.selfie = await compressFile(f, 1200, 0.85);
    state.skipFace = false;
    els.selfiePreview.src = state.selfie;
    els.selfiePreview.hidden = false;
    stopSelfie();
    $('#btnSelfieRetake').hidden = false;
    await maybeFaceCheck(state.selfie);
  });

  $('#btnSkipFace').addEventListener('click', () => {
    state.skipFace = true;
    state.selfie = null;
    stopSelfie();
    doSave();
  });
  $('#btnFinishSave').addEventListener('click', doSave);

  $('#btnCopy').addEventListener('click', async () => {
    if (!state.accountId) return showStatus('err', 'Chưa có ID.');
    try {
      await navigator.clipboard.writeText(state.accountId);
      showStatus('ok', 'Đã sao chép ' + state.accountId);
    } catch { showStatus('info', state.accountId); }
  });

  $('#btnPng').addEventListener('click', async () => {
    showStatus('info', 'Đang xuất PNG…');
    try {
      const canvas = await html2canvas(els.idcard, { backgroundColor: null, scale: 3, useCORS: true, logging: false });
      const out = document.createElement('canvas');
      out.width = 1476; out.height = 1039;
      out.getContext('2d').drawImage(canvas, 0, 0, 1476, 1039);
      const a = document.createElement('a');
      a.download = (state.accountId || 'travelq') + '.png';
      a.href = out.toDataURL('image/png');
      a.click();
      showStatus('ok', 'Đã tải PNG.');
    } catch (e) {
      showStatus('err', 'Xuất PNG lỗi: ' + (e.message || e));
    }
  });

  els.inputAccountId.addEventListener('change', () => setAccount({ id: els.inputAccountId.value, name: $('#inputName').value }));
  els.inputAccountId.addEventListener('blur', () => {
    if (normalizeId(els.inputAccountId.value) !== state.accountId) {
      setAccount({ id: els.inputAccountId.value, name: $('#inputName').value });
    }
  });

  fillProvinces();
  $('#inputCountry').value = 'Việt Nam';
  updateCountryMode();

  (async function boot() {
    const params = new URLSearchParams(location.search);
    const urlId = params.get('id') || params.get('accountId');
    const urlName = params.get('name') || '';
    if (urlId) {
      els.accountIdGroup.style.display = 'none';
      await setAccount({ id: urlId, name: urlName });
    } else {
      els.inputAccountId.value = '017715';
      els.accountBanner.textContent = 'Demo: nhập/đổi ID tài khoản (mặc định 017715)';
      await setAccount({ id: '017715', name: 'Dinh Dinh' });
    }
  })();
})();
