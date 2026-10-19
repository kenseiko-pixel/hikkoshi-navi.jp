'use strict';

const phoneOutput = document.querySelector('#submitted-phone');

if (phoneOutput) {
  const storageKey = document.body.dataset.phoneStorage || '';
  let phone = '';

  try {
    phone = (sessionStorage.getItem(storageKey) || '').replace(/\D/g, '').slice(0, 11);
  } catch {
    phone = '';
  }

  let formatted = '';
  if (/^(050|070|080|090)\d{8}$/.test(phone)) {
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

  phoneOutput.textContent = formatted || '電話番号を確認できませんでした';
  phoneOutput.classList.toggle('is-unavailable', !formatted);
}
