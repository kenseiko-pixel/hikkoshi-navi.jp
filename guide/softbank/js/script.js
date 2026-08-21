const choices = document.querySelectorAll('input[name="usage"]');
const selectionMessage = document.getElementById('selection-message');
const address = document.getElementById('address');
const labels = {
  softbank: '移転・継続のお手続きをご案内します',
  other: '新居での新規お申し込みをご案内します',
  none: '新居での新規お申し込みをご案内します'
};

choices.forEach(choice => choice.addEventListener('change', () => {
  selectionMessage.textContent = `✓ ${labels[choice.value]}`;
  selectionMessage.style.color = '#111';
  setTimeout(() => address.scrollIntoView({ behavior: 'smooth', block: 'start' }), 280);
}));

const form = document.getElementById('address-form');
const postal = document.getElementById('postal');
const postalError = document.getElementById('postal-error');
const toast = document.getElementById('toast');

postal.addEventListener('input', () => {
  postal.value = postal.value.replace(/\D/g, '').slice(0, 7);
  postal.classList.remove('invalid');
  postalError.textContent = '';
});

document.getElementById('postal-search').addEventListener('click', () => {
  if (!/^\d{7}$/.test(postal.value)) {
    postal.classList.add('invalid');
    postalError.textContent = '郵便番号を7桁で入力してください。';
    postal.focus();
    return;
  }
  showToast('郵便番号を確認しました。続けて住所をご入力ください。');
  document.getElementById('prefecture').focus();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const required = [...form.querySelectorAll('[required]')];
  required.forEach(el => el.classList.remove('invalid'));
  const invalid = required.filter(el => !el.value.trim() || (el === postal && !/^\d{7}$/.test(el.value)));
  if (invalid.length) {
    invalid.forEach(el => el.classList.add('invalid'));
    document.getElementById('form-error').textContent = '必須項目をご確認ください。';
    invalid[0].focus();
    return;
  }
  document.getElementById('form-error').textContent = '';
  showToast('入力内容を確認できました（モック画面のため送信されません）');
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

const sticky = document.querySelector('.sticky');
const finalCta = document.querySelector('.final-cta');
const hero = document.querySelector('.hero');
let heroVisible = true;
let finalVisible = false;
const updateSticky = () => sticky.classList.toggle('hidden', heroVisible || finalVisible);
new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; updateSticky(); }, { threshold: .08 }).observe(hero);
new IntersectionObserver(([entry]) => { finalVisible = entry.isIntersecting; updateSticky(); }, { threshold: .1 }).observe(finalCta);
updateSticky();
