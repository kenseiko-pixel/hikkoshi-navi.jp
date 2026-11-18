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

function pushDataLayerEvent(event, detail = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...detail });
}

function storePhoneForThanks(key, value) {
  try {
    sessionStorage.setItem(key, value);
    sessionStorage.setItem(key + ':complete', '1');
  } catch {
    // 一時保存を利用できない環境でも、送信処理は妨げない。
  }
}

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

function phoneValidationMessage(value) {
  if (/^(070|080|090)/.test(value)) {
    return /^(070|080|090)\d{8}$/.test(value) ? '' : '携帯電話は11桁です。';
  }
  return /^0\d{9,10}$/.test(value) ? '' : '電話番号を10〜11桁の数字で入力してください。';
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

async function submitJsonForm(form, payload, button, errorElement, successUrl, onSuccess) {
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
    if (typeof onSuccess === 'function') onSuccess();
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
  const controlOf = (name) => applicationForm.querySelector(`[name="${name}"]:not(:disabled)`);
  const valueOf = (name) => applicationForm.querySelector(`[name="${name}"]:checked:not(:disabled)`)?.value || '';
  const setGroupError = (name, message) => {
    const group = controlOf(name)?.closest('.segmented');
    return group ? setError(group, message) : true;
  };

  const postal = applicationForm.querySelector('#postal');
  const address = applicationForm.querySelector('#address');
  const postalStatus = document.querySelector('#postal-status');
  let postalRequest = 0;
  address.addEventListener('input', () => postalRequest++);
  postal.addEventListener('input', async (event) => {
    const code = digits(event.target.value).slice(0, 7);
    event.target.value = code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
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

  const inputPanel = applicationForm.querySelector('[data-application-panel="input"]');
  const reviewPanel = applicationForm.querySelector('[data-application-panel="review"]');
  const applicationIndicators = [...document.querySelectorAll('[data-application-indicator]')];
  const applicationError = document.querySelector('#application-error');
  const applicationSubmit = applicationForm.querySelector('button[type="submit"]');
  let showingApplicationReview = false;

  const focusApplicationError = () => {
    const invalid = applicationForm.querySelector('.invalid');
    const control = invalid?.matches('input, select, textarea') ? invalid : invalid?.querySelector('input, select, textarea');
    control?.focus();
  };

  const validateApplication = () => {
    const name = applicationForm.elements.customer_name.value.trim();
    const phone = digits(applicationForm.elements.phone.value);
    const postalValue = digits(postal.value);
    const addressValue = address.value.trim();
    const checks = [
      setError(postal, /^\d{7}$/.test(postalValue) ? '' : '郵便番号を7桁の数字で入力してください。'),
      setError(address, addressValue ? '' : '利用予定住所を入力してください。'),
      setError(applicationForm.elements.customer_name, name ? '' : 'お名前を入力してください。'),
      setError(applicationForm.elements.phone, phoneValidationMessage(phone))
    ];
    // template内で保管している項目は検証しない。フォームへ戻した際は元の検証を再開する。
    if (controlOf('procedure')) {
      checks.push(setGroupError('procedure', valueOf('procedure') ? '' : '希望する手続きを選択してください。'));
    }
    const emailControl = controlOf('email');
    if (emailControl) {
      const email = emailControl.value.trim();
      checks.push(setError(emailControl, !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'メールアドレスの形式をご確認ください。'));
    }
    const timeControl = controlOf('preferred_time');
    if (timeControl) {
      checks.push(setError(timeControl, timeControl.value ? '' : 'ご希望の連絡時間帯を選択してください。'));
    }
    const consentControl = controlOf('privacy_consent');
    if (consentControl) {
      checks.push(setError(consentControl.closest('.consent'), consentControl.checked ? '' : '個人情報の取扱いへの同意が必要です。'));
    }
    const valid = checks.every(Boolean);
    applicationError.textContent = valid ? '' : '赤く表示された項目をご確認ください。';
    return valid;
  };

  const showApplicationPanel = (review, moveFocus = true) => {
    if (!inputPanel || !reviewPanel) return;
    showingApplicationReview = review;
    inputPanel.hidden = review;
    reviewPanel.hidden = !review;
    applicationIndicators.forEach((indicator) => {
      const step = Number(indicator.dataset.applicationIndicator);
      indicator.classList.toggle('is-complete', review && step === 1);
      if (step === (review ? 2 : 1)) indicator.setAttribute('aria-current', 'step');
      else indicator.removeAttribute('aria-current');
    });
    if (moveFocus) {
      document.querySelector('.application-steps, .application-progress')?.scrollIntoView({ block: 'start' });
      const target = review ? document.querySelector('#application-review-title') : postal;
      target?.focus({ preventScroll: true });
    }
  };

  const showApplicationReview = () => {
    if (!validateApplication()) {
      focusApplicationError();
      return;
    }
    // 確認中に遅れて届いた郵便番号検索で送信内容が変わることを防ぐ。
    postalRequest++;
    if (postalStatus.textContent === '住所を検索しています…') postalStatus.textContent = '';
    const code = digits(postal.value);
    const values = {
      postal: `${code.slice(0, 3)}-${code.slice(3)}`,
      address: address.value.trim(),
      customer_name: applicationForm.elements.customer_name.value.trim(),
      phone: digits(applicationForm.elements.phone.value),
      email: controlOf('email')?.value.trim() || '未入力',
      preferred_time: controlOf('preferred_time')?.value || '',
      procedure: valueOf('procedure')
    };
    reviewPanel.querySelectorAll('[data-review-field]').forEach((field) => {
      field.textContent = values[field.dataset.reviewField] || '';
    });
    showApplicationPanel(true);
  };

  applicationForm.querySelector('[data-application-next]')?.addEventListener('click', showApplicationReview);
  applicationForm.querySelector('[data-application-back]')?.addEventListener('click', () => showApplicationPanel(false));

  applicationForm.addEventListener('submit', (event) => {
    if (inputPanel && reviewPanel && !showingApplicationReview) {
      event.preventDefault();
      showApplicationReview();
      return;
    }
    if (reviewPanel && event.submitter !== applicationSubmit) {
      event.preventDefault();
      return;
    }
    if (!validateApplication()) {
      event.preventDefault();
      showApplicationPanel(false, false);
      focusApplicationError();
      return;
    }
    const phone = digits(applicationForm.elements.phone.value);
    setTrackingFields(trackingFields);
    storePhoneForThanks('au_application_contact_phone', phone);
    applicationSubmit.disabled = true;
    applicationSubmit.textContent = '送信しています…';
    applicationForm.setAttribute('aria-busy', 'true');
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
  const areaContactTime = document.querySelector('#area-contact-time');
  const areaStatus = document.querySelector('#area-postal-status');
  const areaError = document.querySelector('#area-error');
  const areaSubmit = document.querySelector('#area-submit');
  const areaPanels = [...areaForm.querySelectorAll('[data-area-panel]')];
  const areaIndicators = [...document.querySelectorAll('[data-area-indicator]')];
  const lastAreaInputStep = areaPanels.length;
  let currentAreaStep = 1;
  let requestRevision = 0;

  const showAreaStep = (step, focusFirst = false) => {
    currentAreaStep = Math.max(1, Math.min(lastAreaInputStep, step));
    areaPanels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.areaPanel) !== currentAreaStep;
    });
    areaIndicators.forEach((indicator) => {
      const indicatorStep = Number(indicator.dataset.areaIndicator);
      indicator.classList.toggle('complete', indicatorStep < currentAreaStep);
      if (indicatorStep === currentAreaStep) indicator.setAttribute('aria-current', 'step');
      else indicator.removeAttribute('aria-current');
    });
    if (focusFirst) {
      const firstControl = areaForm.querySelector(`[data-area-panel="${currentAreaStep}"] input, [data-area-panel="${currentAreaStep}"] select`);
      setTimeout(() => firstControl?.focus({ preventScroll: true }), 0);
    }
  };

  const validateAreaStep = (step) => {
    let checks = [];
    if (step === 1) {
      checks = [
        setError(areaPostal, /^\d{7}$/.test(digits(areaPostal.value)) ? '' : '郵便番号を7桁で入力してください。'),
        setError(areaAddress, areaAddress.value.trim() ? '' : '住所を入力してください。')
      ];
    } else if (step === 2) {
      checks = [
        setError(areaName, areaName.value.trim() ? '' : 'お名前を入力してください。'),
        setError(areaTel, phoneValidationMessage(digits(areaTel.value))),
        setError(areaContactTime, areaContactTime.value ? '' : 'ご希望の連絡時間帯を選択してください。')
      ];
    }
    const valid = checks.every(Boolean);
    areaError.textContent = valid ? '' : '赤く表示された項目をご確認ください。';
    if (!valid) areaForm.querySelector(`[data-area-panel="${step}"] .invalid`)?.focus();
    return valid;
  };

  const advanceAreaStep = () => {
    if (currentAreaStep >= lastAreaInputStep || !validateAreaStep(currentAreaStep)) return;
    showAreaStep(currentAreaStep + 1, true);
    pushDataLayerEvent('area_form_step', { step_number: currentAreaStep });
  };

  areaForm.querySelectorAll('[data-area-next]').forEach((button) => {
    button.addEventListener('click', advanceAreaStep);
  });
  areaForm.querySelectorAll('[data-area-back]').forEach((button) => {
    button.addEventListener('click', () => showAreaStep(currentAreaStep - 1, true));
  });

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

  [areaAddress, areaName, areaTel, areaContactTime].forEach((control) => {
    control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (control.value) setError(control, '');
      areaError.textContent = '';
    });
  });

  areaForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (currentAreaStep < lastAreaInputStep) {
      advanceAreaStep();
      return;
    }
    if (areaSubmit.disabled) return;
    const postalValue = digits(areaPostal.value);
    const telValue = digits(areaTel.value);
    const checks = [
      setError(areaPostal, /^\d{7}$/.test(postalValue) ? '' : '郵便番号を7桁で入力してください。'),
      setError(areaAddress, areaAddress.value.trim() ? '' : '住所を入力してください。'),
      setError(areaName, areaName.value.trim() ? '' : 'お名前を入力してください。'),
      setError(areaTel, phoneValidationMessage(telValue)),
      setError(areaContactTime, areaContactTime.value ? '' : 'ご希望の連絡時間帯を選択してください。')
    ];
    if (!checks.every(Boolean)) {
      areaError.textContent = '赤く表示された項目をご確認ください。';
      const invalid = areaForm.querySelector('.invalid');
      const invalidStep = Number(invalid?.closest('[data-area-panel]')?.dataset.areaPanel || 1);
      showAreaStep(invalidStep);
      setTimeout(() => invalid?.focus(), 0);
      return;
    }
    const payload = new FormData(areaForm);
    payload.set('postal', postalValue);
    payload.set('address', areaAddress.value.trim());
    payload.set('name', areaName.value.trim());
    payload.set('tel', telValue);
    appendAttribution(payload);
    submitJsonForm(areaForm, payload, areaSubmit, areaError, 'area-thanks.html', () => {
      storePhoneForThanks('au_area_contact_phone', telValue);
      pushDataLayerEvent('area_form_step', { step_number: 3 });
    });
  });
  showAreaStep(1);
}

const estimateForm = document.querySelector('#estimate-form');
if (estimateForm) {
  const estimateHousing = document.querySelector('#estimate-housing');
  const estimatePostal = document.querySelector('#estimate-postal');
  const estimateName = document.querySelector('#estimate-name');
  const estimateTel = document.querySelector('#estimate-tel');
  const estimateContactTime = document.querySelector('#estimate-contact-time');
  const estimateError = document.querySelector('#estimate-error');
  const estimateSubmit = document.querySelector('#estimate-submit');
  const housingOptions = ['戸建住宅', '集合住宅'];

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
      setError(estimatePostal, /^\d{7}$/.test(postal) ? '' : '郵便番号を7桁で入力してください。'),
      setError(estimateName, name ? '' : 'お名前を入力してください。'),
      setError(estimateTel, phoneValidationMessage(tel)),
      setError(estimateContactTime, estimateContactTime.value ? '' : 'ご希望の連絡時間帯を選択してください。')
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
    submitJsonForm(estimateForm, payload, estimateSubmit, estimateError, 'estimate-thanks.html', () => {
      storePhoneForThanks('au_estimate_contact_phone', tel);
    });
  });

  [estimateHousing, estimateName, estimateTel, estimateContactTime].forEach((control) => {
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
    if (callbackDialog.open) return;
    callbackTrigger = trigger;
    callbackError.textContent = '';
    callbackDialog.showModal();
    document.body.classList.add('modal-open');
    dispatchEvent(new Event('modalstatechange'));
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
    dispatchEvent(new Event('modalstatechange'));
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
      setError(callbackTel, phoneValidationMessage(tel)),
      setError(callbackTime, allowedTimes.includes(callbackTime.value) ? '' : 'ご希望の連絡時間帯を選択してください。')
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
    submitJsonForm(callbackForm, payload, callbackSubmit, callbackError, 'callback-thanks.html', () => {
      storePhoneForThanks('au_callback_contact_phone', tel);
    });
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
  const visible = { areaForm: false, estimateForm: false, final: false, footer: false };
  let fieldFocused = false;
  const updateSticky = () => sticky.classList.toggle('hidden', fieldFocused || document.body.classList.contains('modal-open') || Object.values(visible).some(Boolean));
  [
    ['areaForm', '#area-form'],
    ['estimateForm', '#estimate-form'],
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
  document.addEventListener('focusin', (event) => {
    if (!event.target.matches('input, select, textarea')) return;
    fieldFocused = true;
    updateSticky();
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      fieldFocused = document.activeElement?.matches('input, select, textarea') ?? false;
      updateSticky();
    }, 0);
  });
  addEventListener('modalstatechange', updateSticky);
  updateSticky();
}

collectAttribution();
