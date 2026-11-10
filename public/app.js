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
    selfieAccepted: false,
    photo: null,
    skipCccd: false,
    skipFace: false,
    faceConsent: false,
    faceConsentAt: '',
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
    saveStatus: $('#saveStatus'),
    stepper: $('#stepper'),
    stepTitle: $('#stepTitle'),
    stepAccountId: $('#stepAccountId'),
    toast: $('#toast'),
    successView: $('#successView'),
    successFooter: $('#successFooter'),
    successCopy: $('#successCopy'),
    faceStage: $('#faceStage'),
    btnSkipFace: $('#btnSkipFace'),
    hintQr: $('#hintQr'),
    hintCccd: $('#hintCccd'),
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
    selfieWrap: $('#selfieWrap'),
    faceGuide: $('#faceGuide'),
    faceMesh: $('#faceMesh'),
    faceAuth: $('#faceAuth'),
    faceLiveActions: $('#faceLiveActions'),
    facePreviewActions: $('#facePreviewActions'),
    consentOverlay: $('#consentOverlay'),
    policyOverlay: $('#policyOverlay'),
    consentCheck: $('#consentCheck'),
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

  function currentYearVN() {
    return Number(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Saigon', year: 'numeric'
    }).format(new Date()));
  }

  const YEAR_HINT = 'Thiếu năm sinh';
  function yearInvalidMsg() {
    return 'Năm sinh không hợp lệ. Nhập 4 chữ số từ 1900 đến ' + currentYearVN() + '.';
  }

  function parseBirthYear(raw) {
    const s = String(raw || '').trim();
    let y = '';
    const iso = s.match(/^(\d{4})(?:-\d{2}-\d{2})?$/);
    if (iso) y = iso[1];
    const dmy = s.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (!y && dmy) y = dmy[3];
    if (!y) {
      const digits = s.replace(/\D/g, '');
      if (digits.length === 4) y = digits;
    }
    if (!y) {
      const hasDigits = /\d/.test(s);
      return { ok: false, empty: !hasDigits, year: '', error: hasDigits ? yearInvalidMsg() : YEAR_HINT };
    }
    const n = Number(y);
    const max = currentYearVN();
    if (!/^\d{4}$/.test(y) || n < 1900 || n > max) {
      return { ok: false, empty: false, year: '', error: yearInvalidMsg() };
    }
    return { ok: true, empty: false, year: y, error: '' };
  }

  function ddmmyyyyToYear(s) {
    const m = String(s || '').match(/^(\d{2})(\d{2})(\d{4})$/);
    return m ? m[3] : '';
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
    const facePhoto = (state.selfie && !state.skipFace) ? state.selfie : null;
    if (facePhoto) {
      els.viewPhoto.src = facePhoto;
      els.viewPhoto.alt = 'Ảnh khuôn mặt';
      els.idcard.classList.add('has-photo');
    } else {
      els.viewPhoto.removeAttribute('src');
      els.viewPhoto.alt = '';
      els.idcard.classList.remove('has-photo');
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
    }
    updateCard();
    return fetchQr(nid);
  }

  window.TravelQ = {
    setAccount: (obj) => { window.__tqFromBridge = true; return setAccount(obj || {}); },
    getAccountId: () => state.accountId,
    getQrPayload: () => state.qrPayload,
    onClose: null
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
      dob: ddmmyyyyToYear(ngaySinh),
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
    clearDocHint();
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
      clearDocHint();
    }
    if (n === 3) {
      enterFaceStep();
    }
  }

  function clearDocHint() {
    if (!els.hintCccd) return;
    els.hintCccd.classList.remove('ok', 'warn');
    els.hintCccd.textContent = '';
  }

  function showDocError(msg) {
    if (!els.hintCccd) return false;
    els.hintCccd.classList.remove('ok');
    els.hintCccd.classList.add('warn');
    els.hintCccd.textContent = msg || '';
    return false;
  }

  function validateDoc() {
    const doc = parseDocNo($('#inputDocNo') && $('#inputDocNo').value);
    if (!doc.ok) return showDocError(doc.error);
    clearDocHint();
    return true;
  }

  function clearFieldErrors() {
    $$('#step2 .form-group.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  }

  function markInvalid(input) {
    if (!input) return;
    const group = input.closest('.form-group');
    if (group) group.classList.add('is-invalid');
  }

  function returnToStep2(msg) {
    toast(msg);
    showStep(2);
    const first = $('#step2 .form-group.is-invalid input, #step2 .form-group.is-invalid select, #step2 .form-group.is-invalid textarea');
    if (first) {
      try { first.focus({ preventScroll: true }); } catch (_) { first.focus(); }
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function validateStep2() {
    clearFieldErrors();
    const nameEl = $('#inputName');
    const dobEl = $('#inputDob');
    const addrEl = $('#inputAddress');
    const countryEl = $('#inputCountry');
    const docEl = $('#inputDocNo');
    const name = (nameEl && nameEl.value || '').trim();
    const birth = parseBirthYear(dobEl && dobEl.value);
    const address = (addrEl && addrEl.value || '').trim();
    const country = (countryEl && countryEl.value || '').trim();
    const isVN = /^vi[eệ]t\s*nam$/i.test(country);
    const provinceEl = isVN ? els.province : els.provinceText;
    const province = isVN ? (els.province.value || '') : ((els.provinceText.value || '').trim());
    if (!name) { markInvalid(nameEl); return 'Vui lòng nhập họ và tên.'; }
    if (!birth.ok) { markInvalid(dobEl); return birth.error || 'Vui lòng nhập năm sinh hợp lệ.'; }
    if (!address) { markInvalid(addrEl); return 'Vui lòng nhập nơi ở / địa chỉ.'; }
    if (!country) { markInvalid(countryEl); return 'Vui lòng nhập quốc gia.'; }
    if (!province) {
      markInvalid(provinceEl);
      return isVN ? 'Vui lòng chọn tỉnh/thành phố.' : 'Vui lòng nhập tỉnh/thành (nước ngoài).';
    }
    if (!validateDoc()) {
      markInvalid(docEl);
      return parseDocNo(docEl && docEl.value).error || DOC_INVALID;
    }
    return null;
  }

  function setFaceMode(mode) {
    const live = mode === 'live';
    if (els.faceLiveActions) els.faceLiveActions.hidden = !live;
    if (els.facePreviewActions) els.facePreviewActions.hidden = live;
    if (els.selfieWrap) {
      els.selfieWrap.classList.toggle('live', live && !!state.selfieStream);
      els.selfieWrap.classList.toggle('preview', !live);
    }
    if (els.faceGuide) {
      els.faceGuide.textContent = live
        ? 'Đưa khuôn mặt vào khung oval, nhìn thẳng, đủ sáng'
        : (state.selfieAccepted ? 'Đã chọn ảnh này cho thẻ ID' : 'Xem lại ảnh, chụp lại hoặc dùng ảnh này');
    }
  }

  function enterFaceStep() {
    if (els.btnSkipFace) els.btnSkipFace.hidden = false;
    if (els.faceStage) els.faceStage.classList.remove('is-skipped');
    if (state.selfie && state.selfieAccepted) {
      showFacePreview();
      return;
    }
    if (state.skipFace) {
      skipFaceStep();
      return;
    }
    if (state.faceConsent) {
      startSelfieCam();
      return;
    }
    openConsent();
  }

  function openConsent() {
    if (!els.consentOverlay) return;
    if (els.consentCheck) els.consentCheck.checked = false;
    const agree = $('#btnConsentAgree');
    if (agree) agree.disabled = true;
    els.consentOverlay.hidden = false;
    stopSelfie();
    setFaceMode('live');
    if (els.selfieWrap) els.selfieWrap.classList.add('is-placeholder');
  }

  function closeConsent() {
    if (els.consentOverlay) els.consentOverlay.hidden = true;
  }

  function openPolicy(e) {
    if (e) e.preventDefault();
    if (els.policyOverlay) els.policyOverlay.hidden = false;
  }

  function closePolicy() {
    if (els.policyOverlay) els.policyOverlay.hidden = true;
  }

  function acceptConsent() {
    state.faceConsent = true;
    state.faceConsentAt = new Date().toISOString();
    state.skipFace = false;
    closeConsent();
    startSelfieCam();
  }

  function skipFaceFromConsent() {
    closeConsent();
    skipFaceStep();
  }

  function skipFaceStep() {
    state.skipFace = true;
    state.selfie = null;
    state.selfieAccepted = false;
    stopSelfie();
    if (els.selfiePreview) {
      els.selfiePreview.hidden = true;
      els.selfiePreview.removeAttribute('src');
    }
    if (els.selfieWrap) {
      els.selfieWrap.classList.add('is-placeholder');
      els.selfieWrap.classList.remove('live', 'preview');
    }
    setFaceMode('live');
    if (els.faceLiveActions) els.faceLiveActions.hidden = true;
    if (els.facePreviewActions) els.facePreviewActions.hidden = true;
    if (els.btnSkipFace) els.btnSkipFace.hidden = true;
    if (els.faceStage) els.faceStage.classList.add('is-skipped');
    if (els.faceGuide) {
      els.faceGuide.textContent = 'Đã bỏ qua nhận diện khuôn mặt. Bạn vẫn có thể lưu hồ sơ.';
      els.faceGuide.style.textAlign = 'center';
    }
    updateCard();
  }


  const FACE_PTS = [
    [0.13,0.30],[0.14,0.38],[0.15,0.46],[0.17,0.54],[0.20,0.62],[0.24,0.70],[0.30,0.77],[0.39,0.83],
    [0.50,0.87],
    [0.61,0.83],[0.70,0.77],[0.76,0.70],[0.80,0.62],[0.83,0.54],[0.85,0.46],[0.86,0.38],[0.87,0.30],
    [0.22,0.28],[0.28,0.24],[0.35,0.23],[0.42,0.25],[0.47,0.28],
    [0.53,0.28],[0.58,0.25],[0.65,0.23],[0.72,0.24],[0.78,0.28],
    [0.50,0.32],[0.50,0.39],[0.50,0.46],[0.50,0.53],
    [0.40,0.58],[0.45,0.60],[0.50,0.61],[0.55,0.60],[0.60,0.58],
    [0.30,0.35],[0.34,0.32],[0.39,0.32],[0.43,0.35],[0.39,0.37],[0.34,0.37],
    [0.57,0.35],[0.61,0.32],[0.66,0.32],[0.70,0.35],[0.66,0.37],[0.61,0.37],
    [0.36,0.70],[0.41,0.67],[0.46,0.66],[0.50,0.67],[0.54,0.66],[0.59,0.67],[0.64,0.70],
    [0.59,0.74],[0.54,0.76],[0.50,0.77],[0.46,0.76],[0.41,0.74],
    [0.41,0.70],[0.46,0.69],[0.50,0.70],[0.54,0.69],[0.59,0.70],[0.54,0.72],[0.50,0.73],[0.46,0.72]
  ];
  function rangeEdges(a, b, loop) {
    const e = [];
    for (let i = a; i < b; i++) e.push([i, i + 1]);
    if (loop) e.push([b, a]);
    return e;
  }
  const FACE_EDGES = [
    ...rangeEdges(0, 16, false),
    ...rangeEdges(17, 21, false),
    ...rangeEdges(22, 26, false),
    ...rangeEdges(27, 30, false),
    ...rangeEdges(31, 35, false),
    ...rangeEdges(36, 41, true),
    ...rangeEdges(42, 47, true),
    ...rangeEdges(48, 59, true),
    ...rangeEdges(60, 67, true),
    [17, 36], [21, 39], [22, 42], [26, 45],
    [21, 27], [22, 27], [30, 39], [30, 42],
    [33, 51], [31, 48], [35, 54], [8, 57], [48, 5], [54, 11],
    [36, 17], [45, 26]
  ];

  let meshRaf = 0;
  let meshDetector = null;
  let meshBox = null;
  let meshDetectAt = 0;

  function ovalMetrics(w, h) {
    return { cx: w * 0.5, cy: h * 0.5, rx: w * 0.35, ry: h * 0.40 };
  }

  function mapVideoToOverlay(vx, vy, video, w, h) {
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    return { x: w - (ox + vx * scale), y: oy + vy * scale };
  }

  async function detectFaceBox(w, h) {
    const video = els.selfieVideo;
    if (!video || !video.videoWidth) return null;
    try {
      if (!meshDetector && typeof window.FaceDetector === 'function') {
        meshDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      }
      if (!meshDetector) return null;
      const faces = await meshDetector.detect(video);
      if (!faces || !faces[0] || !faces[0].boundingBox) return null;
      const b = faces[0].boundingBox;
      const p1 = mapVideoToOverlay(b.x, b.y, video, w, h);
      const p2 = mapVideoToOverlay(b.x + b.width, b.y + b.height, video, w, h);
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      return { x, y, w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
    } catch (_) {
      meshDetector = null;
      return null;
    }
  }

  function startFaceMesh() {
    const canvas = els.faceMesh;
    if (!canvas) return;
    stopFaceMesh();
    const tick = async (t) => {
      if (!els.selfieWrap || !els.selfieWrap.classList.contains('live')) {
        meshRaf = 0;
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || els.selfieWrap.clientWidth;
      const h = canvas.clientHeight || els.selfieWrap.clientHeight;
      if (w && h && (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr))) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      if (t - meshDetectAt > 280) {
        meshDetectAt = t;
        const next = await detectFaceBox(w, h);
        if (next) meshBox = next;
      }
      drawFaceMesh(canvas, w, h, dpr, t);
      meshRaf = requestAnimationFrame(tick);
    };
    meshRaf = requestAnimationFrame(tick);
  }

  function stopFaceMesh() {
    if (meshRaf) cancelAnimationFrame(meshRaf);
    meshRaf = 0;
    meshBox = null;
    const canvas = els.faceMesh;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawFaceMesh(canvas, w, h, dpr, t) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const oval = ovalMetrics(w, h);
    // Default mesh sits in the upper-center of the oval (ID-photo framing).
    let bx = oval.cx - oval.rx * 0.90;
    let by = oval.cy - oval.ry * 0.82;
    let bw = oval.rx * 1.80;
    let bh = oval.ry * 1.52;
    if (meshBox && meshBox.w > 20 && meshBox.h > 20) {
      const nx = meshBox.x + meshBox.w * 0.5;
      const ny = meshBox.y + meshBox.h * 0.5;
      const nrx = meshBox.w * 0.55;
      const nry = meshBox.h * 0.65;
      bx = nx - nrx;
      by = ny - nry;
      bw = nrx * 2;
      bh = nry * 2;
    }
    const pts = FACE_PTS.map(([nx, ny]) => ({ x: bx + nx * bw, y: by + ny * bh }));
    const period = 2200;
    const scanP = (t % period) / period;
    const scanY = oval.cy - oval.ry + scanP * oval.ry * 2;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(oval.cx, oval.cy, oval.rx, oval.ry, 0, 0, Math.PI * 2);
    ctx.clip();

    ctx.lineWidth = 0.7;
    FACE_EDGES.forEach(([a, b]) => {
      const pa = pts[a], pb = pts[b];
      if (!pa || !pb) return;
      const midY = (pa.y + pb.y) / 2;
      const near = 1 - Math.min(1, Math.abs(midY - scanY) / 28);
      ctx.strokeStyle = near > 0.35
        ? `rgba(245,184,46,${0.18 + near * 0.55})`
        : 'rgba(127,227,236,0.28)';
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    });

    pts.forEach((p, i) => {
      const phase = (t / 420 + i * 0.17) % (Math.PI * 2);
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(phase));
      const near = 1 - Math.min(1, Math.abs(p.y - scanY) / 22);
      const gold = near > 0.4;
      const r = gold ? 1.7 : 1.25;
      ctx.beginPath();
      ctx.fillStyle = gold
        ? `rgba(245,184,46,${0.55 + pulse * 0.45})`
        : `rgba(159,240,245,${0.35 + pulse * 0.55})`;
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (gold || pulse > 0.85) {
        ctx.beginPath();
        ctx.fillStyle = gold ? 'rgba(245,184,46,0.22)' : 'rgba(47,198,211,0.2)';
        ctx.arc(p.x, p.y, r + 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    const grad = ctx.createLinearGradient(oval.cx, scanY - 10, oval.cx, scanY + 10);
    grad.addColorStop(0, 'rgba(47,198,211,0)');
    grad.addColorStop(0.45, 'rgba(159,240,245,0.55)');
    grad.addColorStop(0.5, 'rgba(245,184,46,0.85)');
    grad.addColorStop(0.55, 'rgba(159,240,245,0.55)');
    grad.addColorStop(1, 'rgba(47,198,211,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(oval.cx - oval.rx, scanY - 10, oval.rx * 2, 20);
    ctx.strokeStyle = 'rgba(245,184,46,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(oval.cx - oval.rx + 6, scanY);
    ctx.lineTo(oval.cx + oval.rx - 6, scanY);
    ctx.stroke();
    ctx.restore();
  }

  function flashAuthenticating(ms) {
    return new Promise((resolve) => {
      if (els.faceAuth) els.faceAuth.hidden = false;
      setTimeout(() => {
        if (els.faceAuth) els.faceAuth.hidden = true;
        resolve();
      }, ms || 900);
    });
  }

  async function startSelfieCam() {
    setFaceMode('live');
    if (els.selfiePreview) els.selfiePreview.hidden = true;
    const snap = $('#btnSelfieSnap');
    if (snap) snap.disabled = true;
    try {
      stopSelfie();
      state.selfieStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }
      });
      els.selfieVideo.srcObject = state.selfieStream;
      els.selfieVideo.style.display = 'block';
      await els.selfieVideo.play();
      if (els.selfieWrap) {
        els.selfieWrap.classList.add('live');
        els.selfieWrap.classList.remove('is-placeholder', 'preview');
      }
      startFaceMesh();
      if (snap) snap.disabled = false;
    } catch (e) {
      if (els.selfieWrap) els.selfieWrap.classList.add('is-placeholder');
      toast('Không mở được camera. Bạn có thể tải ảnh lên.');
    }
  }

  function showFacePreview() {
    stopSelfie();
    if (els.selfiePreview && state.selfie) {
      els.selfiePreview.src = state.selfie;
      els.selfiePreview.hidden = false;
    }
    if (els.selfieWrap) {
      els.selfieWrap.classList.add('preview');
      els.selfieWrap.classList.remove('live', 'is-placeholder');
    }
    setFaceMode('preview');
  }

  async function captureSelfieFromVideo() {
    const v = els.selfieVideo;
    if (!v || !v.videoWidth) return;
    const c = els.selfieCanvas;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const raw = c.toDataURL('image/jpeg', 0.92);
    const blob = await (await fetch(raw)).blob();
    state.selfie = await compressFile(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }), 1200, 0.85);
    state.skipFace = false;
    state.selfieAccepted = false;
    const snap = $('#btnSelfieSnap');
    if (snap) snap.disabled = true;
    await flashAuthenticating(900);
    showFacePreview();
  }

  async function setSelfieFromFile(file) {
    if (!file) return;
    state.selfie = await compressFile(file, 1200, 0.85);
    state.skipFace = false;
    state.selfieAccepted = false;
    state.faceConsent = state.faceConsent || true;
    if (!state.faceConsentAt) state.faceConsentAt = new Date().toISOString();
    closeConsent();
    await flashAuthenticating(700);
    showFacePreview();
  }

  function useCapturedSelfie() {
    if (!state.selfie) return;
    state.selfieAccepted = true;
    state.skipFace = false;
    updateCard();
    if (els.faceGuide) els.faceGuide.textContent = 'Đã chọn ảnh này cho thẻ ID';
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
    stopFaceMesh();
    if (els.faceAuth) els.faceAuth.hidden = true;
    if (state.selfieStream) {
      state.selfieStream.getTracks().forEach((t) => t.stop());
      state.selfieStream = null;
    }
    if (els.selfieVideo) {
      els.selfieVideo.style.display = 'none';
      els.selfieVideo.srcObject = null;
    }
    if (els.selfieWrap) els.selfieWrap.classList.remove('live');
  }


  function notifyHostClose() {
    const payload = { type: 'travelq:close' };
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
    } catch (_) {}
    try { window.postMessage(payload, '*'); } catch (_) {}
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (_) {}
    try {
      if (window.TravelQ && typeof window.TravelQ.onClose === 'function') window.TravelQ.onClose();
    } catch (_) {}
  }

  function openSuccessView() {
    if (els.toast) {
      els.toast.hidden = true;
      els.toast.classList.remove('show');
    }
    document.body.classList.add('success-view');
    if (els.successView) els.successView.hidden = false;
    if (els.successCopy) els.successCopy.hidden = false;
    if (els.successFooter) els.successFooter.hidden = false;
    const card = els.idcard;
    if (card) {
      card.classList.remove('saved-pop');
      void card.offsetWidth;
      card.classList.add('saved-pop');
      requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  function dismissSuccessView() {
    document.body.classList.remove('success-view');
    if (els.successView) els.successView.hidden = true;
    if (els.successCopy) els.successCopy.hidden = true;
    if (els.successFooter) els.successFooter.hidden = true;
    if (els.idcard) els.idcard.classList.remove('saved-pop');
    notifyHostClose();
  }

  async function doSave() {
    if (!state.accountId) {
      toast('Thiếu ID tài khoản. Mở trang với ?id=… hoặc gắn từ ứng dụng.');
      return;
    }
    const err = validateStep2();
    if (err) {
      returnToStep2(err);
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
          dob: parseBirthYear($('#inputDob').value).year,
          address: ($('#inputAddress').value || '').trim(),
          phone: ($('#inputPhone').value || '').trim(),
          gender: $('#inputGender').value || '',
          country: ($('#inputCountry').value || '').trim(),
          province,
          nationality: ($('#inputCountry').value || '').trim(),
          cccdFrontDataUrl: state.skipCccd ? null : state.cccdFront,
          cccdBackDataUrl: state.skipCccd ? null : state.cccdBack,
          selfieDataUrl: state.skipFace ? null : state.selfie,
          photoDataUrl: state.skipFace ? null : (state.selfie || null),
          faceConsent: !!state.faceConsent,
          faceConsentAt: state.faceConsent ? (state.faceConsentAt || new Date().toISOString()) : '',
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
      updateCard();
      closeStepper();
      openSuccessView();
      showStatus('ok', 'Đã lưu hồ sơ ' + displayId(state.accountId));
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
    openSuccessView,
    dismissSuccessView,
    notifyHostClose,
    openConsent,
    closeConsent,
    acceptConsent,
    skipFaceStep,
    setFaceMode,
    startSelfieCam,
    showFacePreview,
    useCapturedSelfie,
    setSelfieFromDataUrl: async (dataUrl) => {
      state.selfie = dataUrl;
      state.skipFace = false;
      state.selfieAccepted = false;
      showFacePreview();
    },
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

  ['front', 'back'].forEach((w) => {
    const W = w === 'front' ? 'Front' : 'Back';
    const box = $('#box' + W);
    const input = $('#input' + W);
    const open = () => { input.value = ''; input.click(); };
    box.addEventListener('click', open);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    $('#btn' + W + 'Retake').addEventListener('click', (e) => { e.stopPropagation(); open(); });
    input.addEventListener('change', () => handleCccdImage(input.files[0], w));
  });

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
    if (err) {
      const first = $('#step2 .form-group.is-invalid input, #step2 .form-group.is-invalid select, #step2 .form-group.is-invalid textarea');
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (_) { first.focus(); }
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return toast(err);
    }
    showStep(3);
  });

  $('#inputCountry').addEventListener('input', updateCountryMode);
  $('#inputCountry').addEventListener('change', updateCountryMode);
  $('#inputDocNo').addEventListener('input', () => {
    const el = $('#inputDocNo');
    el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    clearDocHint();
    updateCard();
  });
  $('#inputDob').addEventListener('input', () => {
    const el = $('#inputDob');
    el.value = el.value.replace(/\D/g, '').slice(0, 4);
  });
  ['inputName', 'inputDob', 'inputCountry'].forEach((id) => {
    $('#' + id).addEventListener('input', updateCard);
    $('#' + id).addEventListener('change', updateCard);
  });

  if ($('#btnConsentAgree')) {
    $('#consentCheck').addEventListener('change', () => {
      $('#btnConsentAgree').disabled = !$('#consentCheck').checked;
    });
    $('#btnConsentAgree').addEventListener('click', acceptConsent);
    $('#btnConsentSkip').addEventListener('click', skipFaceFromConsent);
  }
  if ($('#linkPrivacyPolicy')) {
    $('#linkPrivacyPolicy').addEventListener('click', openPolicy);
  }
  if ($('#btnPolicyClose')) {
    $('#btnPolicyClose').addEventListener('click', closePolicy);
  }
  if ($('#policyOverlay')) {
    $('#policyOverlay').addEventListener('click', (ev) => {
      if (ev.target === els.policyOverlay) closePolicy();
    });
  }

  $('#btnSelfieSnap').addEventListener('click', () => captureSelfieFromVideo());
  $('#btnSelfieRetake').addEventListener('click', () => {
    state.selfie = null;
    state.selfieAccepted = false;
    if (els.selfiePreview) els.selfiePreview.hidden = true;
    startSelfieCam();
  });
  if ($('#btnSelfieUse')) {
    $('#btnSelfieUse').addEventListener('click', useCapturedSelfie);
  }
  $('#btnSelfieFile').addEventListener('click', () => $('#inputSelfieFile').click());
  $('#inputSelfieFile').addEventListener('change', async () => {
    const f = $('#inputSelfieFile').files && $('#inputSelfieFile').files[0];
    await setSelfieFromFile(f);
  });

  $('#btnSkipFace').addEventListener('click', skipFaceStep);
  $('#btnFinishSave').addEventListener('click', doSave);
  if ($('#btnSuccessDone')) $('#btnSuccessDone').addEventListener('click', dismissSuccessView);
  if ($('#btnSuccessClose')) $('#btnSuccessClose').addEventListener('click', dismissSuccessView);

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
