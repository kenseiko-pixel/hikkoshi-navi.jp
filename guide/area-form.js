function initAreaForm(collectAttribution) {
  var form = document.getElementById('areaForm');
  var postal = document.getElementById('areaPostal');
  var address = document.getElementById('areaAddress');
  var name = document.getElementById('areaName');
  var tel = document.getElementById('areaTel');
  var telError = document.getElementById('areaTelError');
  var status = document.getElementById('areaPostalStatus');
  var error = document.getElementById('areaError');
  var submitButton = form.querySelector('button[type="submit"]');
  var busy = false, revision = 0;

  function digits(value) {
    return value.replace(/[０-９]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) - 65248);
    }).replace(/[-\s()]+/g, '');
  }

  [postal, address, name].forEach(function(input) {
    input.addEventListener('input', function() {
      input.removeAttribute('aria-invalid');
      error.textContent = '';
    });
  });

  function syncPhone(showError) {
    var normalized = digits(tel.value).replace(/\D/g, '').slice(0, 11);
    var valid = /^0\d{9,10}$/.test(normalized);
    if (showError && !valid) tel.setAttribute('aria-invalid', 'true');
    else tel.removeAttribute('aria-invalid');
    var show = showError && !valid;
    telError.classList.toggle('is-shown', show);
    error.textContent = '';
    return {valid: valid, value: normalized};
  }

  tel.addEventListener('input', function() {
    tel.removeAttribute('aria-invalid');
    telError.classList.remove('is-shown');
    error.textContent = '';
  });
  tel.addEventListener('blur', function() { syncPhone(true); });

  address.addEventListener('input', function() { revision++; });
  postal.addEventListener('input', function() {
    var code = digits(postal.value), request = ++revision;
    status.textContent = '';
    if (!/^\d{7}$/.test(code)) return;
    postal.value = code.slice(0, 3) + '-' + code.slice(3);
    status.textContent = '住所を検索しています…';
    fetch('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + code)
      .then(function(response) { if (!response.ok) throw Error(); return response.json(); })
      .then(function(data) {
        if (request !== revision) return;
        if (!data.results || !data.results.length) throw Error();
        var found = data.results[0];
        address.value = found.address1 + found.address2 + found.address3;
        status.textContent = '番地・建物名を追記してください。';
      })
      .catch(function() {
        if (request === revision) status.textContent = '住所を手入力してください。';
      });
  });

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    if (busy) return;
    var rules = [
      [postal, function(value) { return /^\d{7}$/.test(digits(value)); }, '郵便番号を7桁で入力してください。'],
      [address, function(value) { return value.trim() !== ''; }, '住所を入力してください。'],
      [name, function(value) { return value.trim() !== ''; }, 'お名前を入力してください。'],
      [tel, function() { return syncPhone(false).valid; }, '電話番号を正しく入力してください。']
    ];
    error.textContent = '';
    for (var i = 0; i < rules.length; i++) {
      rules[i][0].removeAttribute('aria-invalid');
      if (!rules[i][1](rules[i][0].value)) {
        if (rules[i][0] === tel) {
          syncPhone(true);
          tel.focus();
        } else {
          rules[i][0].setAttribute('aria-invalid', 'true');
          rules[i][0].focus();
        }
        error.textContent = rules[i][2];
        return;
      }
    }

    var payload = new FormData(form), tracking = collectAttribution();
    Object.keys(tracking).forEach(function(key) { payload.set(key, tracking[key]); });
    payload.set('form_type', 'area');
    payload.set('postal', digits(postal.value));
    payload.set('address', address.value.trim());
    payload.set('name', name.value.trim());
    payload.set('tel', syncPhone(false).value);

    busy = true;
    submitButton.disabled = true;
    submitButton.textContent = '送信中…';
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 30000);
    fetch(form.action, {method:'POST', body:payload, signal:controller.signal})
      .then(function(response) { if (!response.ok) throw Error(); return response.json(); })
      .then(function(data) {
        if (data.ok !== true) throw Error();
        try { sessionStorage.setItem('internet-hikkoshi-entry:area-complete', '1'); } catch(e) {}
        location.replace('area-thanks.html');
      })
      .catch(function() {
        error.textContent = '送信を確認できませんでした。時間をおいて再度お試しください。';
        busy = false;
        submitButton.disabled = false;
        submitButton.innerHTML = '<span class="area-check__free">無料</span><span>エリア確認を依頼する</span>';
      })
      .finally(function() { clearTimeout(timeout); });
  });
}
