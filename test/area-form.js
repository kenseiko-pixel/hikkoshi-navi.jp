function initAreaForm(collectAttribution) {
  var form = document.getElementById('areaForm');
  var postal = document.getElementById('areaPostal');
  var address = document.getElementById('areaAddress');
  var status = document.getElementById('areaPostalStatus');
  var error = document.getElementById('areaError');
  var timeDialog = document.getElementById('areaTimeDialog');
  var timeForm = document.getElementById('areaTimeForm');
  var timeError = document.getElementById('areaTimeError');
  var timeButton = document.getElementById('areaTimeSubmit');
  var timeOptions = timeDialog ? timeDialog.querySelectorAll('[data-area-time-value]') : [];
  var submittedValues = null;
  var selectedTime = 'いつでも';
  var busy = false, areaSent = false, revision = 0;
  function finish() { location.replace('area-thanks.html'); }
  function pushAreaEvent(eventName, values) {
    window.dataLayer = window.dataLayer || [];
    var eventData = {event: eventName, lp_name: 'internet-hikkoshi-entry'};
    Object.keys(values || {}).forEach(function(key) { eventData[key] = values[key]; });
    window.dataLayer.push(eventData);
  }
  function showTimeDialog(values) {
    submittedValues = values;
    if (!timeDialog || !timeForm) { submitArea(''); return; }
    areaSent = false;
    selectedTime = 'いつでも';
    timeOptions.forEach(function(option) {
      option.setAttribute('aria-checked', option.dataset.areaTimeValue === selectedTime ? 'true' : 'false');
    });
    timeError.textContent = '';
    timeDialog.showModal();
    document.body.classList.add('modal-open');
    pushAreaEvent('area_time_modal_view');
    timeDialog.querySelector('[data-area-time-value]').focus();
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
    if (timeButton) {
      timeButton.disabled = true;
      timeButton.textContent = '送信中…';
    }
    timeOptions.forEach(function(option) { option.disabled = true; });
    var controller = new AbortController(), timeout = setTimeout(function(){ controller.abort(); }, 30000);
    fetch(form.action, {method:'POST', body:payload, signal:controller.signal})
      .then(function(response) { if (!response.ok) throw Error(); return response.json(); })
      .then(function(data) {
        if (data.ok !== true) throw Error();
        try { sessionStorage.setItem('internet-hikkoshi-entry:area-complete', '1'); } catch(e) {}
        pushAreaEvent('area_time_submit', {preferred_time: preferredTime || '未指定'});
        areaSent = true;
        if (timeDialog && timeDialog.open) timeDialog.close(); else finish();
      })
      .catch(function() {
        var message = '送信を確認できませんでした。時間をおいて再度お試しください。';
        if (timeDialog && timeDialog.open) timeError.textContent = message; else error.textContent = message;
        busy = false;
        if (timeButton) {
          timeButton.disabled = false;
          timeButton.textContent = '送信';
        }
        timeOptions.forEach(function(option) { option.disabled = false; });
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
    timeOptions.forEach(function(option) {
      option.addEventListener('click', function() {
        selectedTime = option.dataset.areaTimeValue;
        timeOptions.forEach(function(item) {
          item.setAttribute('aria-checked', item === option ? 'true' : 'false');
        });
        pushAreaEvent('area_time_selected', {preferred_time: option.dataset.areaTimeValue});
      });
    });
    timeDialog.querySelector('[data-area-time-close]').addEventListener('click', function() {
      if (!busy) timeDialog.close();
    });
    timeDialog.addEventListener('cancel', function(event) {
      event.preventDefault();
      if (!busy) timeDialog.close();
    });
    timeDialog.addEventListener('close', function() {
      document.body.classList.remove('modal-open');
      if (areaSent) {
        finish();
      } else {
        postal.focus({preventScroll:true});
      }
    });
    timeForm.addEventListener('submit', function(event) {
      event.preventDefault();
      if (busy || !submittedValues) return;
      submitArea(selectedTime);
    });
  }
}
