function initAreaForm(collectAttribution) {
  var form = document.getElementById('areaForm');
  var postal = document.getElementById('areaPostal');
  var address = document.getElementById('areaAddress');
  var status = document.getElementById('areaPostalStatus');
  var error = document.getElementById('areaError');
  var button = form.querySelector('button[type="submit"]');
  var timeDialog = document.getElementById('areaTimeDialog');
  var timeForm = document.getElementById('areaTimeForm');
  var timeSelect = document.getElementById('areaPreferredTime');
  var timeError = document.getElementById('areaTimeError');
  var timeButton = document.getElementById('areaTimeSubmit');
  var submittedValues = null;
  var busy = false, revision = 0;
  function finish() { location.replace('area-thanks.html'); }
  function showTimeDialog(values) {
    submittedValues = values;
    if (!timeDialog || !timeForm) { submitArea(''); return; }
    timeSelect.value = '';
    timeError.textContent = '';
    timeDialog.showModal();
    document.body.classList.add('modal-open');
    timeSelect.focus();
  }
  function submitArea(preferredTime) {
    if (busy || !submittedValues) return;
    var payload = new FormData();
    payload.set('form_type', 'area');
    payload.set('preferred_time', preferredTime);
    payload.set('postal', submittedValues.postal);
    payload.set('address', submittedValues.address);
    payload.set('name', submittedValues.name);
    payload.set('tel', submittedValues.tel);
    Object.keys(submittedValues.tracking).forEach(function(key) { payload.set(key, submittedValues.tracking[key]); });
    busy = true;
    button.disabled = true;
    button.textContent = '送信中…';
    timeButton && (timeButton.disabled = true);
    if (timeButton) timeButton.textContent = '送信中…';
    var controller = new AbortController(), timeout = setTimeout(function(){ controller.abort(); }, 30000);
    fetch(form.action, {method:'POST', body:payload, signal:controller.signal})
      .then(function(response) { if (!response.ok) throw Error(); return response.json(); })
      .then(function(data) {
        if (data.ok !== true) throw Error();
        try { sessionStorage.setItem('internet-hikkoshi-entry:area-complete', '1'); } catch(e) {}
        if (timeDialog && timeDialog.open) timeDialog.close(); else finish();
      })
      .catch(function() {
        var message = '送信を確認できませんでした。時間をおいて再度お試しください。';
        if (timeDialog && timeDialog.open) timeError.textContent = message; else error.textContent = message;
        busy = false;
        button.disabled = false;
        button.textContent = 'エリア確認をスタート';
        if (timeButton) {
          timeButton.disabled = false;
          timeButton.textContent = 'この時間帯で送信する';
        }
      })
      .finally(function(){ clearTimeout(timeout); });
  }
  function digits(value) { return value.replace(/[０-９]/g, function(c) { return String.fromCharCode(c.charCodeAt(0)-65248); }).replace(/[-\s()]+/g, ''); }
  address.addEventListener('input', function () { revision++; });
  postal.addEventListener('input', function () {
    var code = digits(postal.value), request = ++revision;
    status.textContent = '';
    if (!/^\d{7}$/.test(code)) return;
    postal.value = code.slice(0,3) + '-' + code.slice(3);
    status.textContent = '住所を検索しています…';
    fetch('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + code)
      .then(function(r) { if (!r.ok) throw Error(); return r.json(); })
      .then(function(data) {
        if (request !== revision) return;
        if (!data.results || !data.results.length) throw Error();
        var found = data.results[0];
        address.value = found.address1 + found.address2 + found.address3;
        status.textContent = '番地・建物名を追記してください。';
      }).catch(function() { if (request === revision) status.textContent = '住所を手入力してください。'; });
  });
  form.addEventListener('submit', function(event) {
    event.preventDefault();
    if (busy) return;
    var rules = [
      ['areaPostal', function(v) {return /^\d{7}$/.test(digits(v));}, '郵便番号を7桁で入力してください。'],
      ['areaAddress', function(v) {return !!v.trim();}, '住所を入力してください。'],
      ['areaName', function(v) {return !!v.trim();}, 'お名前を入力してください。'],
      ['areaTel', function(v) {return /^0\d{9,10}$/.test(digits(v));}, '電話番号を10〜11桁で入力してください。']
    ];
    error.textContent = '';
    for (var i=0;i<rules.length;i++) {
      var input = document.getElementById(rules[i][0]);
      input.removeAttribute('aria-invalid');
      if (!rules[i][1](input.value)) {
        input.setAttribute('aria-invalid','true');
        error.textContent = rules[i][2]; input.focus(); return;
      }
    }
    showTimeDialog({
      postal: digits(postal.value),
      address: address.value.trim(),
      name: document.getElementById('areaName').value.trim(),
      tel: digits(document.getElementById('areaTel').value),
      tracking: collectAttribution()
    });
  });

  if (timeDialog && timeForm) {
    timeDialog.querySelectorAll('[data-area-time-skip]').forEach(function(skip) {
      skip.addEventListener('click', function() { submitArea(''); });
    });
    timeDialog.addEventListener('cancel', function(event) {
      event.preventDefault();
      submitArea('');
    });
    timeDialog.addEventListener('close', function() {
      document.body.classList.remove('modal-open');
      finish();
    });
    timeForm.addEventListener('submit', function(event) {
      event.preventDefault();
      var allowed = ['いつでも','10-12時頃','12-15時頃','15-18時頃','18時以降'];
      if (busy || !submittedValues) return;
      if (allowed.indexOf(timeSelect.value) === -1) {
        timeError.textContent = 'ご連絡希望時間帯を選択してください。';
        timeSelect.focus();
        return;
      }
      submitArea(timeSelect.value);
    });
  }
}
