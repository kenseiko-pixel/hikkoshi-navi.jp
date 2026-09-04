function initAreaForm(collectAttribution) {
  var form = document.getElementById('areaForm');
  var postal = document.getElementById('areaPostal');
  var address = document.getElementById('areaAddress');
  var status = document.getElementById('areaPostalStatus');
  var error = document.getElementById('areaError');
  var button = form.querySelector('button[type="submit"]');
  var busy = false, revision = 0;
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
    var payload = new FormData(form), tracking = collectAttribution();
    Object.keys(tracking).forEach(function(key) {payload.set(key,tracking[key]);});
    payload.set('form_type','area');
    payload.set('postal',digits(postal.value));
    payload.set('tel',digits(document.getElementById('areaTel').value));
    payload.set('name',document.getElementById('areaName').value.trim());
    payload.set('address',address.value.trim());
    busy = true; button.disabled = true; button.textContent = '送信中…';
    var controller = new AbortController(), timeout = setTimeout(function(){controller.abort();},30000);
    fetch(form.action,{method:'POST',body:payload,signal:controller.signal})
      .then(function(r) {if (!r.ok) throw Error(); return r.json();})
      .then(function(data) {
        if (data.ok !== true) throw Error();
        try {sessionStorage.setItem('internet-hikkoshi-entry:area-complete','1');} catch(e) {}
        location.replace('area-thanks.html');
      }).catch(function() {
        error.textContent = '送信を確認できませんでした。時間をおいて再度お試しください。';
        busy = false; button.disabled = false; button.textContent = '無料でエリア確認を依頼する';
      }).finally(function(){clearTimeout(timeout);});
  });
}
