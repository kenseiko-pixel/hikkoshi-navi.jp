'use strict';

const phoneOutput = document.querySelector('#submitted-phone');
const phoneConfirm = document.querySelector('#phone-confirm');

if (phoneOutput && phoneConfirm) {
  const storageKey = document.body.dataset.phoneStorage || '';
  let phone = '';

  try {
    phone = (sessionStorage.getItem(storageKey) || '').replace(/\D/g, '').slice(0, 11);
  } catch {
    phone = '';
  }

  const localPreview = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (!phone && localPreview) phone = '00000000000';

  let formatted = '';
  if (/^0{11}$/.test(phone)) {
    formatted = '000-0000-0000';
  } else if (/^(050|070|080|090)\d{8}$/.test(phone)) {
    formatted = phone.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  } else if (/^0800\d{7}$/.test(phone)) {
    formatted = phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1-$2-$3');
  } else if (/^(03|06)\d{8}$/.test(phone)) {
    formatted = phone.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
  } else if (/^0120\d{6}$/.test(phone)) {
    formatted = phone.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1-$2-$3');
  } else if (/^0\d{9}$/.test(phone)) {
    formatted = phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  }

  if (formatted) {
    phoneOutput.textContent = formatted;
    phoneConfirm.hidden = false;
  }
}

const completionEvent = document.body.dataset.completionEvent || '';
const completionStorageKey = (document.body.dataset.phoneStorage || '') + ':complete';
if (completionEvent && completionStorageKey !== ':complete') {
  try {
    if (sessionStorage.getItem(completionStorageKey) === '1') {
      sessionStorage.removeItem(completionStorageKey);
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: completionEvent, lp_name: 'au-hikari-moving-entry' });
    }
  } catch {
    // 計測用の一時保存が使えない環境では、ページ表示を優先する。
  }
}
