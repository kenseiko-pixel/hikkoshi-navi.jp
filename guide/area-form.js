function initAreaForm(collectAttribution) {
  var form = document.getElementById('areaForm');
  var postal = document.getElementById('areaPostal');
  var address = document.getElementById('areaAddress');
  var name = document.getElementById('areaName');
  var tel = document.getElementById('areaTel');
  var tel1 = document.getElementById('areaTel1');
  var tel2 = document.getElementById('areaTel2');
  var tel3 = document.getElementById('areaTel3');
  var phoneParts = form.querySelector('.phone-parts');
  var telError = document.getElementById('areaTelError');
  var status = document.getElementById('areaPostalStatus');
  var error = document.getElementById('areaError');
  var submitButton = form.querySelector('button[type="submit"]');
  var timeInput = document.getElementById('areaPreferredTime');
  var timePicker = document.getElementById('areaTimePicker');
  var timeCurrent = document.getElementById('areaTimeCurrent');
  var timeOptions = timePicker.querySelectorAll('[data-area-time-value]');
  var busy = false, revision = 0;

  function digits(value) {
    return value.replace(/[０-９]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) - 65248);
    }).replace(/[-\s()]+/g, '');
  }

  function isValid() {
    return /^\d{7}$/.test(digits(postal.value)) &&
      address.value.trim() !== '' &&
      name.value.trim() !== '' &&
      getPhoneState().valid;
  }

  function updateSubmitState() {
    if (!busy) submitButton.disabled = !isValid();
  }

  function pushAreaEvent(eventName, values) {
    window.dataLayer = window.dataLayer || [];
    var eventData = {event: eventName, lp_name: 'internet-hikkoshi-entry'};
    Object.keys(values || {}).forEach(function(key) { eventData[key] = values[key]; });
    window.dataLayer.push(eventData);
  }

  [postal, address, name].forEach(function(input) {
    input.addEventListener('input', function() {
      input.removeAttribute('aria-invalid');
      error.textContent = '';
      updateSubmitState();
    });
  });

  function getPhoneState() {
    var parts = [tel1.value, tel2.value, tel3.value];
    var mobile = /^(070|080|090)$/.test(parts[0]);
    var targetLength = mobile || /^(020|050)$/.test(parts[0]) || parts[0] === '0800' ? 11 : 10;
    var expectedMiddleLength = targetLength - parts[0].length - 4;
    var invalid = [
      mobile ? !/^(070|080|090)$/.test(parts[0]) : !/^0\d{1,3}$/.test(parts[0]),
      !/^\d{1,4}$/.test(parts[1]) || parts[1].length !== expectedMiddleLength,
      !/^\d{4}$/.test(parts[2])
    ];
    return {valid: invalid.indexOf(true) === -1, invalid: invalid};
  }

  function syncPhone(showError, showEmpty) {
    tel1.value = digits(tel1.value).slice(0, 4);
    tel2.value = digits(tel2.value).slice(0, 4);
    tel3.value = digits(tel3.value).slice(0, 4);
    tel.value = tel1.value + tel2.value + tel3.value;
    var state = getPhoneState();
    var show = showError && (showEmpty || tel.value !== '') && !state.valid;
    [tel1, tel2, tel3].forEach(function(part, index) {
      if (show && state.invalid[index]) part.setAttribute('aria-invalid', 'true');
      else part.removeAttribute('aria-invalid');
    });
    telError.classList.toggle('is-shown', show);
    error.textContent = '';
    updateSubmitState();
  }

  tel1.addEventListener('input', function() {
    syncPhone(false);
    if (/^(070|080|090)$/.test(tel1.value) || tel1.value.length === 4) tel2.focus();
  });
  tel2.addEventListener('input', function() {
    syncPhone(false);
    if (tel2.value.length === 4) tel3.focus();
  });
  tel3.addEventListener('input', function() { syncPhone(false); });
  tel1.addEventListener('paste', function(event) {
    var pasted = digits((event.clipboardData || window.clipboardData).getData('text'));
    if (!/^0\d{9,10}$/.test(pasted)) return;
    event.preventDefault();
    var firstLength = pasted.length === 10 && /^(03|06)/.test(pasted) ? 2 : 3;
    tel1.value = pasted.slice(0, firstLength);
    tel2.value = pasted.slice(firstLength, -4);
    tel3.value = pasted.slice(-4);
    syncPhone(true);
    tel3.focus();
  });
  phoneParts.addEventListener('focusout', function() {
    window.setTimeout(function() {
      if (!phoneParts.contains(document.activeElement)) syncPhone(true);
    }, 0);
  });

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
        updateSubmitState();
      })
      .catch(function() {
        if (request === revision) status.textContent = '住所を手入力してください。';
        updateSubmitState();
      });
  });

  timePicker.addEventListener('toggle', function() {
    if (timePicker.open) pushAreaEvent('area_time_modal_view');
  });
  timeOptions.forEach(function(option) {
    option.addEventListener('click', function() {
      var selectedTime = option.dataset.areaTimeValue;
      timeInput.value = selectedTime;
      timeCurrent.textContent = option.textContent;
      timeOptions.forEach(function(item) {
        item.setAttribute('aria-checked', item === option ? 'true' : 'false');
      });
      timePicker.open = false;
      pushAreaEvent('area_time_selected', {preferred_time: selectedTime});
      timePicker.querySelector('summary').focus();
    });
  });
  document.addEventListener('click', function(event) {
    if (timePicker.open && !timePicker.contains(event.target)) timePicker.open = false;
  });

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    if (busy) return;
    var rules = [
      [postal, function(value) { return /^\d{7}$/.test(digits(value)); }, '郵便番号を7桁で入力してください。'],
      [address, function(value) { return value.trim() !== ''; }, '住所を入力してください。'],
      [name, function(value) { return value.trim() !== ''; }, 'お名前を入力してください。'],
      [tel1, function() { return getPhoneState().valid; }, '電話番号を正しく入力してください。']
    ];
    error.textContent = '';
    for (var i = 0; i < rules.length; i++) {
      rules[i][0].removeAttribute('aria-invalid');
      if (!rules[i][1](rules[i][0].value)) {
        if (rules[i][0] === tel1) {
          syncPhone(true, true);
          var phoneState = getPhoneState();
          var firstInvalidPart = [tel1, tel2, tel3][phoneState.invalid.indexOf(true)];
          if (firstInvalidPart) firstInvalidPart.focus();
        } else {
          rules[i][0].setAttribute('aria-invalid', 'true');
          rules[i][0].focus();
        }
        error.textContent = rules[i][2];
        updateSubmitState();
        return;
      }
    }

    var payload = new FormData(form), tracking = collectAttribution();
    Object.keys(tracking).forEach(function(key) { payload.set(key, tracking[key]); });
    payload.set('form_type', 'area');
    payload.set('preferred_time', timeInput.value);
    payload.set('postal', digits(postal.value));
    payload.set('address', address.value.trim());
    payload.set('name', name.value.trim());
    payload.set('tel', tel.value);

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
        pushAreaEvent('area_time_submit', {preferred_time: timeInput.value});
        location.replace('area-thanks.html');
      })
      .catch(function() {
        error.textContent = '送信を確認できませんでした。時間をおいて再度お試しください。';
        busy = false;
        submitButton.innerHTML = '<span class="area-check__free">無料</span><span>エリア確認を依頼する</span>';
        updateSubmitState();
      })
      .finally(function() { clearTimeout(timeout); });
  });

  updateSubmitState();
}
