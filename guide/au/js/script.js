const LP_CONFIG = {
  lpName: 'au-hikari-moving-entry',
  carrier: 'auひかり'
};

const TRACKING_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gad_source', 'gad_campaignid', 'gclid', 'gbraid', 'wbraid',
  'yclid', 'msclkid', 'fbclid'
];
const BLOCKED_QUERY_KEY = /(?:password|passwd|pwd|token|secret|email|mail|phone|tel|name|address|postal|zipcode|session|auth|cookie)/i;
const ATTRIBUTION_STORE_KEY = LP_CONFIG.lpName + ':attribution';

function safeUrl(value) {
  try {
    const url = new URL(value, location.href);
    return url.origin + url.pathname + url.hash;
  } catch {
    return '';
  }
}

function collectAttribution() {
  const query = new URLSearchParams(location.search);
  let data = {};
  try {
    data = JSON.parse(sessionStorage.getItem(ATTRIBUTION_STORE_KEY) || '{}');
  } catch {}
  TRACKING_KEYS.forEach((key) => {
    if (query.has(key)) data[key] = (query.get(key) || '').slice(0, 500);
  });
  const extra = {};
  let count = 0;
  query.forEach((value, key) => {
    if (count >= 30 || TRACKING_KEYS.includes(key) || BLOCKED_QUERY_KEY.test(key) || !/^[A-Za-z0-9_.-]{1,64}$/.test(key)) return;
    extra[key] = value.slice(0, 500);
    count++;
  });
  if (Object.keys(extra).length) data.other_query_params = JSON.stringify(extra);
  if (!data.entry_url) data.entry_url = safeUrl(location.href);
  if (!data.entry_time) data.entry_time = new Date().toISOString();
  if (!data.referrer) data.referrer = safeUrl(document.referrer);
  Object.assign(data, {
    submit_url: safeUrl(location.href),
    lp_name: LP_CONFIG.lpName,
    carrier: LP_CONFIG.carrier,
    device: matchMedia('(max-width:767px)').matches ? 'mobile' : 'desktop'
  });
  try {
    sessionStorage.setItem(ATTRIBUTION_STORE_KEY, JSON.stringify(data));
  } catch {}
  return data;
}

function appendAttribution(payload) {
  Object.entries(collectAttribution()).forEach(([key, value]) => payload.set(key, value));
}

function setTrackingFields(holder) {
  if (!holder) return;
  holder.replaceChildren(...Object.entries(collectAttribution()).map(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    return input;
  }));
}

function digits(value) {
  return value
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
    .replace(/\D/g, '');
}

function setError(control, message) {
  control.classList.toggle('invalid', Boolean(message));
  control.setAttribute('aria-invalid', message ? 'true' : 'false');
  let error = control.nextElementSibling;
  if (!error?.classList.contains('field-error')) {
    error = document.createElement('small');
    error.className = 'field-error';
    control.insertAdjacentElement('afterend', error);
  }
  error.textContent = message;
  return !message;
}

async function submitJsonForm(form, payload, button, errorElement, successUrl) {
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.textContent = '送信中…';
  form.setAttribute('aria-busy', 'true');
  errorElement.textContent = '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(form.action, { method: 'POST', body: payload, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) throw new Error(data.message || '送信できませんでした。');
    location.replace(successUrl);
  } catch {
    errorElement.textContent = '送信を確認できませんでした。入力内容を残していますので、時間をおいて再度お試しください。';
    button.disabled = false;
    button.innerHTML = originalHtml;
    form.removeAttribute('aria-busy');
  } finally {
    clearTimeout(timeout);
  }
}

const applicationForm = document.querySelector('#application-form');
if (applicationForm) {
  const trackingFields = applicationForm.querySelector('#tracking-fields');
  const panels = [...applicationForm.querySelectorAll('.form-panel')];
  const progress = [...applicationForm.querySelectorAll('.form-progress span')];
  const valueOf = (name) => applicationForm.querySelector(`[name="${name}"]:checked`)?.value || '';
  const show = (step) => {
    panels.forEach((panel) => {
      const active = panel.dataset.formStep === String(step);
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    const progressStep = step === 'review' ? 1 : step === 'complete' ? 2 : 0;
    progress.forEach((item, index) => item.classList.toggle('active', index <= progressStep));
    applicationForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const setGroupError = (name, message) => setError(applicationForm.querySelector(`[name="${name}"]`).closest('.segmented'), message);

  applicationForm.querySelector('.next-step').addEventListener('click', () => {
    const checks = [
      setGroupError('procedure', valueOf('procedure') ? '' : '希望する手続きを選択してください。'),
      setError(applicationForm.elements.current_line, applicationForm.elements.current_line.value ? '' : '現在利用中の回線を選択してください。'),
      setGroupError('moving', valueOf('moving') ? '' : '引っ越し予定を選択してください。')
    ];
    const valid = checks.every(Boolean);
    document.querySelector('#step1-error').textContent = valid ? '' : '赤く表示された項目をご確認ください。';
    if (valid) show(2);
  });
  applicationForm.querySelector('.back-step').addEventListener('click', () => show(1));
  applicationForm.querySelector('.back-to-edit').addEventListener('click', () => show(2));

  const postal = applicationForm.querySelector('#postal');
  const address = applicationForm.querySelector('#address');
  const postalStatus = document.querySelector('#postal-status');
  let postalRequest = 0;
  address.addEventListener('input', () => postalRequest++);
  postal.addEventListener('input', async (event) => {
    const code = digits(event.target.value).slice(0, 7);
    event.target.value = code;
    setError(postal, '');
    postalStatus.className = 'postal-status';
    postalStatus.textContent = '';
    if (code.length !== 7) return;
    const request = ++postalRequest;
    postalStatus.textContent = '住所を検索しています…';
    try {
      const response = await fetch('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + encodeURIComponent(code));
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (request !== postalRequest) return;
      if (!data.results?.length) throw new Error();
      const result = data.results[0];
      address.value = result.address1 + result.address2 + result.address3;
      setError(address, '');
      postalStatus.textContent = '住所を自動入力しました。番地・建物名を追記してください。';
      postalStatus.classList.add('success');
    } catch {
      if (request !== postalRequest) return;
      postalStatus.textContent = '自動検索できませんでした。住所を手入力してください。';
      postalStatus.classList.add('error');
    }
  });

  applicationForm.querySelector('.review-step').addEventListener('click', () => {
    const name = applicationForm.elements.customer_name.value.trim();
    const phone = digits(applicationForm.elements.phone.value);
    const time = applicationForm.elements.contact_time.value;
    const postalValue = digits(postal.value);
    const addressValue = address.value.trim();
    const consent = applicationForm.elements.privacy_consent.checked;
    const checks = [
      setError(applicationForm.elements.customer_name, name ? '' : 'お名前を入力してください。'),
      setError(applicationForm.elements.phone, /^0\d{9,10}$/.test(phone) ? '' : '電話番号を10〜11桁の数字で入力してください。'),
      setError(postal, /^\d{7}$/.test(postalValue) ? '' : '郵便番号を7桁の数字で入力してください。'),
      setError(address, addressValue ? '' : '利用予定住所を入力してください。'),
      setError(applicationForm.elements.privacy_consent.closest('.consent'), consent ? '' : '個人情報の取扱いへの同意が必要です。')
    ];
    const valid = checks.every(Boolean);
    document.querySelector('#step2-error').textContent = valid ? '' : '赤く表示された項目をご確認ください。';
    if (!valid) {
      applicationForm.querySelector('.invalid')?.focus();
      return;
    }
    const rows = [
      ['希望する手続き', valueOf('procedure')],
      ['現在利用中の回線', applicationForm.elements.current_line.value],
      ['引っ越し予定', valueOf('moving')],
      ['お名前', name],
      ['電話番号', phone],
      ['郵便番号', postalValue],
      ['利用予定住所', addressValue],
      ['希望連絡時間', time || '指定なし']
    ];
    const reviewList = document.querySelector('#review-list');
    reviewList.replaceChildren(...rows.map(([term, description]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = description;
      row.append(dt, dd);
      return row;
    }));
    setTrackingFields(trackingFields);
    show('review');
  });

  applicationForm.addEventListener('submit', () => {
    setTrackingFields(trackingFields);
    const button = applicationForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = '送信しています…';
  });
  applicationForm.addEventListener('input', (event) => {
    if (event.target.matches('input:not([type="radio"]):not([type="checkbox"]),select') && event.target.value) setError(event.target, '');
  });
  applicationForm.addEventListener('change', (event) => {
    if (event.target.type === 'radio') setGroupError(event.target.name, '');
    if (event.target.name === 'privacy_consent' && event.target.checked) {
      setError(event.target.closest('.consent'), '');
    }
  });
  setTrackingFields(trackingFields);
}

const areaForm = document.querySelector('#area-form');
if (areaForm) {
  const areaPostal = document.querySelector('#area-postal');
  const areaAddress = document.querySelector('#area-address');
  const areaName = document.querySelector('#area-name');
  const areaTel = document.querySelector('#area-tel');
  const areaStatus = document.querySelector('#area-postal-status');
  const areaError = document.querySelector('#area-error');
  const areaSubmit = document.querySelector('#area-submit');
  let requestRevision = 0;

  areaAddress.addEventListener('input', () => requestRevision++);
  areaPostal.addEventListener('input', async () => {
    const code = digits(areaPostal.value).slice(0, 7);
    areaPostal.value = code.length > 3 ? code.slice(0, 3) + '-' + code.slice(3) : code;
    areaStatus.className = 'postal-status';
    areaStatus.textContent = '';
    setError(areaPostal, '');
    if (code.length !== 7) return;
    const request = ++requestRevision;
    areaStatus.textContent = '住所を検索しています…';
    try {
      const response = await fetch('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + encodeURIComponent(code));
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (request !== requestRevision) return;
      if (!data.results?.length) throw new Error();
      const result = data.results[0];
      areaAddress.value = result.address1 + result.address2 + result.address3;
      setError(areaAddress, '');
      areaStatus.textContent = '住所を自動入力しました。番地・建物名を追記してください。';
      areaStatus.classList.add('success');
    } catch {
      if (request !== requestRevision) return;
      areaStatus.textContent = '住所を手入力してください。';
      areaStatus.classList.add('error');
    }
  });

  areaForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (areaSubmit.disabled) return;
    const postalValue = digits(areaPostal.value);
    const telValue = digits(areaTel.value);
    const checks = [
      setError(areaPostal, /^\d{7}$/.test(postalValue) ? '' : '郵便番号を7桁で入力してください。'),
      setError(areaAddress, areaAddress.value.trim() ? '' : '住所を入力してください。'),
      setError(areaName, areaName.value.trim() ? '' : 'お名前を入力してください。'),
      setError(areaTel, /^0\d{9,10}$/.test(telValue) ? '' : '電話番号を10〜11桁で入力してください。')
    ];
    if (!checks.every(Boolean)) {
      areaError.textContent = '赤く表示された項目をご確認ください。';
      areaForm.querySelector('.invalid')?.focus();
      return;
    }
    const payload = new FormData(areaForm);
    payload.set('postal', postalValue);
    payload.set('address', areaAddress.value.trim());
    payload.set('name', areaName.value.trim());
    payload.set('tel', telValue);
    appendAttribution(payload);
    submitJsonForm(areaForm, payload, areaSubmit, areaError, 'area-thanks.html');
  });
}

const estimateForm = document.querySelector('#estimate-form');
if (estimateForm) {
  const estimateHousing = document.querySelector('#estimate-housing');
  const estimateCurrentLine = document.querySelector('#estimate-current-line');
  const estimatePostal = document.querySelector('#estimate-postal');
  const estimateName = document.querySelector('#estimate-name');
  const estimateTel = document.querySelector('#estimate-tel');
  const estimateError = document.querySelector('#estimate-error');
  const estimateSubmit = document.querySelector('#estimate-submit');
  const housingOptions = ['戸建住宅', '集合住宅'];
  const currentLineOptions = [
    'auひかり', 'フレッツ光・他社光コラボ',
    'その他の固定回線', 'ホームルーター・モバイルWi-Fi', '利用していない・不明'
  ];

  estimatePostal.addEventListener('input', () => {
    const code = digits(estimatePostal.value).slice(0, 7);
    estimatePostal.value = code.length > 3 ? code.slice(0, 3) + '-' + code.slice(3) : code;
    if (code.length === 7) setError(estimatePostal, '');
  });

  estimateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (estimateSubmit.disabled) return;
    const postal = digits(estimatePostal.value);
    const name = estimateName.value.trim();
    const tel = digits(estimateTel.value);
    const checks = [
      setError(estimateHousing, housingOptions.includes(estimateHousing.value) ? '' : '住居タイプを選択してください。'),
      setError(estimateCurrentLine, currentLineOptions.includes(estimateCurrentLine.value) ? '' : '現在利用中の回線を選択してください。'),
      setError(estimatePostal, /^\d{7}$/.test(postal) ? '' : '郵便番号を7桁で入力してください。'),
      setError(estimateName, name ? '' : 'お名前を入力してください。'),
      setError(estimateTel, /^0\d{9,10}$/.test(tel) ? '' : '電話番号を10〜11桁で入力してください。')
    ];
    if (!checks.every(Boolean)) {
      estimateError.textContent = '赤く表示された項目をご確認ください。';
      estimateForm.querySelector('.invalid')?.focus();
      return;
    }
    estimateError.textContent = '';
    const payload = new FormData(estimateForm);
    payload.set('postal', postal);
    payload.set('name', name);
    payload.set('tel', tel);
    appendAttribution(payload);
    submitJsonForm(estimateForm, payload, estimateSubmit, estimateError, 'estimate-thanks.html');
  });

  [estimateHousing, estimateCurrentLine, estimateName, estimateTel].forEach((control) => {
    control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (control.value) setError(control, '');
      estimateError.textContent = '';
    });
  });
}

const callbackDialog = document.querySelector('#callback-dialog');
const callbackForm = document.querySelector('#callback-form');
if (callbackDialog && callbackForm) {
  const callbackName = document.querySelector('#callback-name');
  const callbackTel = document.querySelector('#callback-tel');
  const callbackTime = document.querySelector('#callback-time');
  const callbackError = document.querySelector('#callback-error');
  const callbackSubmit = document.querySelector('#callback-submit');
  let callbackTrigger = null;

  const openCallback = (trigger) => {
    callbackTrigger = trigger;
    callbackError.textContent = '';
    callbackDialog.showModal();
    document.body.classList.add('modal-open');
    callbackName.focus();
  };
  document.querySelectorAll('[data-callback]').forEach((trigger) => {
    trigger.addEventListener('click', () => openCallback(trigger));
  });
  callbackDialog.querySelector('.callback-dialog__close').addEventListener('click', () => {
    if (!callbackSubmit.disabled) callbackDialog.close();
  });
  callbackDialog.addEventListener('cancel', (event) => {
    if (callbackSubmit.disabled) event.preventDefault();
  });
  callbackDialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    callbackTrigger?.focus();
  });

  callbackForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (callbackSubmit.disabled) return;
    const name = callbackName.value.trim();
    const tel = digits(callbackTel.value);
    const allowedTimes = ['いつでも', '10-12時頃', '12-15時頃', '15-18時頃', '18時以降'];
    const checks = [
      setError(callbackName, name ? '' : 'お名前を入力してください。'),
      setError(callbackTel, /^0\d{9,10}$/.test(tel) ? '' : '電話番号を10〜11桁で入力してください。'),
      setError(callbackTime, allowedTimes.includes(callbackTime.value) ? '' : 'ご案内希望時間帯を選択してください。')
    ];
    if (!checks.every(Boolean)) {
      callbackError.textContent = '赤く表示された項目をご確認ください。';
      callbackForm.querySelector('.invalid')?.focus();
      return;
    }
    const payload = new FormData(callbackForm);
    payload.set('name', name);
    payload.set('tel', tel);
    payload.set('preferred_time', callbackTime.value);
    appendAttribution(payload);
    submitJsonForm(callbackForm, payload, callbackSubmit, callbackError, 'callback-thanks.html');
  });
}

document.querySelectorAll('a[href="#area-check"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const section = document.querySelector('#area-check');
    const postal = document.querySelector('#area-postal');
    if (!section || !postal) return;
    event.preventDefault();
    section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => postal.focus({ preventScroll: true }), 450);
  });
});

const sticky = document.querySelector('.sticky');
if (sticky) {
  const visible = { area: false, form: false, final: false, footer: false };
  let stickyReady = scrollY > 240;
  const updateSticky = () => sticky.classList.toggle('hidden', !stickyReady || Object.values(visible).some(Boolean));
  addEventListener('scroll', () => {
    stickyReady = scrollY > 240;
    updateSticky();
  }, { passive: true });
  [
    ['area', '#area-check'],
    ['form', '#application'],
    ['final', '#final-cta'],
    ['footer', '#footer']
  ].forEach(([key, selector]) => {
    const target = document.querySelector(selector);
    if (!target) return;
    new IntersectionObserver(([entry]) => {
      visible[key] = entry.isIntersecting;
      updateSticky();
    }, { threshold: 0.08 }).observe(target);
  });
  updateSticky();
}

collectAttribution();
