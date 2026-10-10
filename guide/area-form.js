function initConsultationForm(collectAttribution) {
  var form = document.getElementById('consultationForm');
  var preferredTime = document.getElementById('consultationTime');
  var postal = document.getElementById('areaPostal');
  var postalLookupButton = document.getElementById('postalLookupButton');
  var address = document.getElementById('areaAddress');
  var name = document.getElementById('areaName');
  var tel = document.getElementById('areaTel');
  var telError = document.getElementById('areaTelError');
  var status = document.getElementById('areaPostalStatus');
  var error = document.getElementById('areaError');
  var submitButton = form.querySelector('button[type="submit"]');
  var stickyCta = document.getElementById('stickyCta');
  var consultation = document.getElementById('consultation');
  var busy = false, revision = 0;
  var formControlFocused = false, consultationVisible = false, visibilityFrame = 0;

  function syncSticky() {
    if (!stickyCta) return;
    var shouldHide = formControlFocused || consultationVisible;
    stickyCta.classList.toggle('is-hidden', shouldHide);
    if (shouldHide) stickyCta.setAttribute('aria-hidden', 'true');
    else stickyCta.removeAttribute('aria-hidden');
  }

  function updateConsultationVisibility() {
    visibilityFrame = 0;
    if (!consultation) return;
    var rect = consultation.getBoundingClientRect();
    var viewport = window.visualViewport;
    var viewportTop = viewport ? viewport.offsetTop : 0;
    var viewportBottom = viewportTop + (viewport ? viewport.height : window.innerHeight);
    consultationVisible = rect.bottom > viewportTop && rect.top < viewportBottom;
    syncSticky();
  }

  function requestConsultationVisibilityUpdate() {
    if (visibilityFrame) return;
    visibilityFrame = window.requestAnimationFrame(updateConsultationVisibility);
  }

  form.addEventListener('focusin', function(event) {
    if (!event.target.matches('input, select, textarea')) return;
    formControlFocused = true;
    syncSticky();
  });

  form.addEventListener('focusout', function() {
    window.setTimeout(function() {
      var active = document.activeElement;
      formControlFocused = !!(active && form.contains(active) && active.matches('input, select, textarea'));
      updateConsultationVisibility();
    }, 0);
  });

  window.addEventListener('scroll', requestConsultationVisibilityUpdate, {passive:true});
  window.addEventListener('resize', requestConsultationVisibilityUpdate, {passive:true});
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', requestConsultationVisibilityUpdate, {passive:true});
    window.visualViewport.addEventListener('scroll', requestConsultationVisibilityUpdate, {passive:true});
  }
  document.querySelectorAll('a[href="#consultation"]').forEach(function(link) {
    link.addEventListener('click', function() {
      consultationVisible = true;
      syncSticky();
    });
  });

  function digits(value) {
    return value.replace(/[０-９]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) - 65248);
    }).replace(/[-\s()]+/g, '');
  }

  function phoneState() {
    var normalized = digits(tel.value).replace(/\D/g, '');
    var mobile = /^(070|080|090)/.test(normalized);
    var valid = mobile ? /^(070|080|090)\d{8}$/.test(normalized) : /^0\d{9,10}$/.test(normalized);
    return {
      valid: valid,
      value: normalized,
      message: mobile && !valid ? '携帯番号の桁数は11桁です。' : '電話番号を正しく入力してください。'
    };
  }

  var rules = [
    {input:postal, error:document.getElementById('areaPostalError'), valid:function() { return /^\d{7}$/.test(digits(postal.value)); }, message:'郵便番号を7桁で入力してください。'},
    {input:address, error:document.getElementById('areaAddressError'), valid:function() { return address.value.trim() !== ''; }, message:'住所を入力してください。'},
    {input:name, error:document.getElementById('areaNameError'), valid:function() { return name.value.trim() !== ''; }, message:'お名前を入力してください。'},
    {input:tel, error:telError, valid:function() { return phoneState().valid; }, message:function() { return phoneState().message; }},
    {input:preferredTime, error:document.getElementById('consultationTimeError'), valid:function() { return preferredTime.value !== ''; }, message:'ご希望の連絡時間帯を選択してください。'}
  ];

  function setFieldError(rule, show) {
    var message = typeof rule.message === 'function' ? rule.message() : rule.message;
    rule.error.textContent = message;
    rule.error.classList.toggle('is-shown', show);
    if (show) rule.input.setAttribute('aria-invalid', 'true');
    else rule.input.removeAttribute('aria-invalid');
  }

  rules.forEach(function(rule) {
    var eventName = rule.input.tagName === 'SELECT' ? 'change' : 'input';
    rule.input.addEventListener(eventName, function() {
      if (rule.valid()) setFieldError(rule, false);
      else if (rule.input.getAttribute('aria-invalid') === 'true') setFieldError(rule, true);
      if (!busy) error.textContent = '';
    });
  });

  preferredTime.addEventListener('change', function() { error.textContent = ''; });
  tel.addEventListener('blur', function() {
    if (tel.value !== '' && !phoneState().valid) setFieldError(rules[3], true);
  });

  address.addEventListener('input', function() { revision++; });
  function lookupAddress(showPostalError) {
    var code = digits(postal.value), request = ++revision;
    status.textContent = '';
    if (!/^\d{7}$/.test(code)) {
      if (showPostalError) {
        setFieldError(rules[0], true);
        postal.focus();
      }
      return;
    }
    setFieldError(rules[0], false);
    postal.value = code.slice(0, 3) + '-' + code.slice(3);
    status.textContent = '住所を検索しています…';
    fetch('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + code)
      .then(function(response) { if (!response.ok) throw Error(); return response.json(); })
      .then(function(data) {
        if (request !== revision) return;
        if (!data.results || !data.results.length) throw Error();
        var found = data.results[0];
        address.value = found.address1 + found.address2 + found.address3;
        setFieldError(rules[1], false);
        status.textContent = '番地・建物名を追記してください。';
      })
      .catch(function() {
        if (request === revision) status.textContent = '住所を手入力してください。';
      });
  }

  postal.addEventListener('input', function() {
    if (/^\d{7}$/.test(digits(postal.value))) lookupAddress(false);
  });
  postalLookupButton.addEventListener('click', function() { lookupAddress(true); });
  function focusFirstInvalid(firstInvalid) {
    firstInvalid.focus({preventScroll:false});
  }

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    if (busy) return;
    error.textContent = '';
    var firstInvalid = null;
    for (var i = 0; i < rules.length; i++) {
      var valid = rules[i].valid();
      setFieldError(rules[i], !valid);
      if (!valid && !firstInvalid) firstInvalid = rules[i].input;
    }
    if (firstInvalid) {
      error.textContent = '未入力または入力内容に誤りがある項目をご確認ください。';
      focusFirstInvalid(firstInvalid);
      return;
    }

    var payload = new FormData(form), tracking = collectAttribution();
    Object.keys(tracking).forEach(function(key) { payload.set(key, tracking[key]); });
    payload.set('form_type', 'area');
    payload.set('preferred_time', preferredTime.value);
    payload.set('postal', digits(postal.value));
    payload.set('address', address.value.trim());
    payload.set('name', name.value.trim());
    payload.set('tel', phoneState().value);

    busy = true;
    submitButton.disabled = true;
    submitButton.textContent = '送信中…';
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 30000);
    fetch(form.action, {method:'POST', body:payload, signal:controller.signal})
      .then(function(response) { if (!response.ok) throw Error(); return response.json(); })
      .then(function(data) {
        if (data.ok !== true) throw Error();
        try {
          sessionStorage.setItem('internet-hikkoshi-entry:application-phone', phoneState().value);
        } catch(e) {}
        location.replace('thanks.html');
      })
      .catch(function() {
        error.textContent = '送信を確認できませんでした。時間をおいて再度お試しください。';
        busy = false;
        submitButton.disabled = false;
        submitButton.textContent = 'エリア確認を依頼';
      })
      .finally(function() { clearTimeout(timeout); });
  });

  updateConsultationVisibility();
}
