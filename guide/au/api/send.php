<?php
declare(strict_types=1);
session_start();

const MAIL_TO = 'hikaricenter@012grp.co.jp';
const MAIL_FROM = 'contact-net-hikkoshi-navi@net.hikkoshi-navi.jp';

function redirect_error(string $code): never {
    header('Location: ../application/?send=error&reason=' . rawurlencode($code) . '#application', true, 303);
    exit;
}

function is_quick_form(): bool {
    $type = trim((string)($_POST['form_type'] ?? ''));
    return in_array($type, ['area', 'callback', 'estimate'], true);
}

function respond_json(int $status, bool $ok, string $message = ''): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function fail_request(string $code, string $message = '入力内容をご確認ください。', int $status = 422): never {
    if (is_quick_form()) respond_json($status, false, $message);
    redirect_error($code);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method Not Allowed');
}

// Origin ヘッダーがあるブラウザー送信は同一ホストのみ許可します。
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '');
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== $host) {
    fail_request('origin', '送信元を確認できませんでした。', 403);
}

// ボット対策用のハニーポットと短時間の連続送信制限です。
if (trim((string)($_POST['website'] ?? '')) !== '') {
    if (is_quick_form()) respond_json(200, true);
    header('Location: ../thanks.html', true, 303);
    exit;
}
$now = time();
if (isset($_SESSION['last_form_submit']) && $now - (int)$_SESSION['last_form_submit'] < 10) {
    fail_request('rate_limit', '連続して送信されています。少し時間をおいて再度お試しください。', 429);
}

function line(string $key): string {
    $value = trim((string)($_POST[$key] ?? ''));
    return preg_replace('/[\r\n\0]+/u', ' ', $value) ?? '';
}

function clean_value(mixed $value, int $limit = 500): string {
    $clean = preg_replace('/[\r\n\0]+/u', ' ', trim((string)$value)) ?? '';
    return function_exists('mb_substr') ? mb_substr($clean, 0, $limit, 'UTF-8') : substr($clean, 0, $limit);
}

$formType = line('form_type');
$isArea = $formType === 'area';
$isCallback = $formType === 'callback';
$isEstimate = $formType === 'estimate';
$isQuickForm = $isArea || $isCallback || $isEstimate;

$procedure = line('procedure');
$name = $isQuickForm ? line('name') : line('customer_name');
$phone = preg_replace('/\D+/', '', line($isQuickForm ? 'tel' : 'phone')) ?? '';
$email = $isQuickForm ? '' : line('email');
$postal = preg_replace('/\D+/', '', line('postal')) ?? '';
$address = line('address');
$housingType = line('housing_type');
$preferredTime = line('preferred_time');
$privacyConsent = line('privacy_consent');

$allowedProcedures = ['新規申し込み', '他社からの乗りかえ', '引越し・住所移転相談'];
$allowedTimes = ['いつでも', '10-12時頃', '12-15時頃', '15-18時頃', '18時以降'];
$isValidPhone = preg_match('/^(070|080|090)/', $phone)
    ? preg_match('/^(070|080|090)\d{8}$/', $phone)
    : preg_match('/^0\d{9,10}$/', $phone);
if ($isCallback) {
    if ($name === '' || !$isValidPhone) fail_request('contact', 'お名前と電話番号をご確認ください。');
    if (!in_array($preferredTime, $allowedTimes, true)) fail_request('preferred_time', 'ご希望の連絡時間帯をご確認ください。');
} elseif ($isArea) {
    if ($name === '' || !$isValidPhone) fail_request('contact', 'お名前と電話番号をご確認ください。');
    if (!preg_match('/^\d{7}$/', $postal) || $address === '') fail_request('address', '郵便番号と住所をご確認ください。');
    if (!in_array($preferredTime, $allowedTimes, true)) fail_request('preferred_time', 'ご希望の連絡時間帯をご確認ください。');
} elseif ($isEstimate) {
    $allowedHousingTypes = ['戸建住宅', '集合住宅'];
    if ($name === '' || !$isValidPhone) fail_request('contact', 'お名前と電話番号をご確認ください。');
    if (!preg_match('/^\d{7}$/', $postal)) fail_request('postal', '郵便番号をご確認ください。');
    if (!in_array($housingType, $allowedHousingTypes, true)) fail_request('housing_type', '住居タイプをご確認ください。');
    if (!in_array($preferredTime, $allowedTimes, true)) fail_request('preferred_time', 'ご希望の連絡時間帯をご確認ください。');
} else {
    if (!in_array($procedure, $allowedProcedures, true)) redirect_error('procedure');
    if ($name === '' || !$isValidPhone) redirect_error('contact');
    if ($email !== '' && (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL))) redirect_error('email');
    if (!preg_match('/^\d{7}$/', $postal) || $address === '') redirect_error('address');
    if (!in_array($preferredTime, $allowedTimes, true)) redirect_error('preferred_time');
    if ($privacyConsent !== '同意する') redirect_error('privacy_consent');
}

$trackingKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gad_source','gad_campaignid','gclid','gbraid','wbraid','yclid','msclkid','fbclid','entry_url','submit_url','referrer','lp_name','carrier','device','entry_time'];
$otherQueryParams = [];
$decodedParams = json_decode((string)($_POST['other_query_params'] ?? ''), true);
if (is_array($decodedParams)) {
    foreach ($decodedParams as $key => $value) {
        if (count($otherQueryParams) >= 30) break;
        if (!is_string($key) || !preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $key)) continue;
        if (preg_match('/(?:password|passwd|pwd|token|secret|email|mail|phone|tel|name|address|postal|zipcode|session|auth|cookie)/i', $key)) continue;
        if (!is_scalar($value)) continue;
        $otherQueryParams[$key] = clean_value($value);
    }
}

// 送信前に設定値を検証し、不正な場合は fail closed とします。
if (!filter_var(MAIL_TO, FILTER_VALIDATE_EMAIL) || !filter_var(MAIL_FROM, FILTER_VALIDATE_EMAIL)) {
    fail_request('mail_config', '現在、受付設定を確認できません。時間をおいて再度お試しください。', 503);
}

$postalFormatted = $postal === '' ? '' : substr($postal, 0, 3) . '-' . substr($postal, 3);
$phoneFormatted = $phone;
if (preg_match('/^(0[789]0)(\d{4})(\d{4})$/', $phone, $matches)) {
    $phoneFormatted = $matches[1] . '-' . $matches[2] . '-' . $matches[3];
}

$inquiryType = $isArea ? 'エリア確認' : ($isCallback ? '電話予約' : ($isEstimate ? 'お見積り' : 'お申し込み'));
$body = "au引越しサイトに" . $inquiryType . "のお問い合わせがありました。\n";
$body .= "https://net.hikkoshi-navi.jp/guide/au/\n\n";
$body .= "---\n\n";
if (!$isQuickForm) {
    $body .= "[希望する手続き] " . $procedure . "\n";
}
$body .= "[お名前] " . $name . "\n";
$body .= "[連絡先電話番号] " . $phoneFormatted . "\n";
if (!$isQuickForm && $email !== '') {
    $body .= "[メールアドレス] " . $email . "\n";
}
if ($isArea || !$isQuickForm) {
    $body .= "[郵便番号] " . $postalFormatted . "\n";
    $body .= "[利用予定住所] " . $address . "\n";
} elseif ($isEstimate) {
    $body .= "[住居タイプ] " . $housingType . "\n";
    $body .= "[郵便番号] " . $postalFormatted . "\n";
}
$body .= "[ご希望の連絡時間帯] " . $preferredTime . "\n";
if (!$isQuickForm) {
    $body .= "[個人情報の取扱い] 同意済み\n";
}
$body .= "[受付日時] " . date('Y-m-d H:i:s') . "\n";
$body .= "[広告・流入パラメータ]\n";
foreach ($trackingKeys as $key) $body .= $key . ' = ' . clean_value($_POST[$key] ?? '') . "\n";
if ($otherQueryParams !== []) {
    $body .= "[その他のURLパラメータ]\n";
    foreach ($otherQueryParams as $key => $value) $body .= $key . ' = ' . $value . "\n";
}

$subject = '新お申し込み【インターネット引越し受付.com】';
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$encodedFromName = '=?UTF-8?B?' . base64_encode('インターネット引越し受付.com') . '?=';
$headers = "From: " . $encodedFromName . " <" . MAIL_FROM . ">\r\n";
$headers .= "Reply-To: " . MAIL_FROM . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Content-Transfer-Encoding: base64\r\n";

$encodedBody = chunk_split(base64_encode($body), 76, "\r\n");
$sent = mail(MAIL_TO, $encodedSubject, $encodedBody, $headers);
if (!$sent) fail_request('mail', '送信できませんでした。時間をおいて再度お試しください。', 500);

// メールアドレスが入力されたお申し込みに限り、受付内容をお客様へ自動返信します。
if (!$isQuickForm && $email !== '') {
    $customerSubject = '【auひかり引越し受付】お問い合わせありがとうございます';
    $customerBody = $name . " 様\n\n";
    $customerBody .= "この度はお問い合わせいただき、ありがとうございます。\n\n";
    $customerBody .= "ご入力いただいた内容で受付いたしました。\n";
    $customerBody .= "専門スタッフより順次ご連絡いたします。\n\n";
    $customerBody .= "【ご入力内容】\n";
    $customerBody .= "希望する手続き：" . $procedure . "\n";
    $customerBody .= "お名前：" . $name . "\n";
    $customerBody .= "電話番号：" . $phoneFormatted . "\n";
    $customerBody .= "メールアドレス：" . $email . "\n";
    $customerBody .= "郵便番号：" . $postalFormatted . "\n";
    $customerBody .= "利用予定住所：" . $address . "\n";
    $customerBody .= "ご希望の連絡時間帯：" . $preferredTime . "\n\n";
    $customerBody .= "※本メールは配信専用のメールアドレスから送信しています。\n";
    $customerBody .= "こちらのメールにご返信いただいても、回答することができません。\n\n";
    $customerBody .= "インターネット引越し窓口\n";
    $customerBody .= "TEL：050-5291-8061\n";
    $customerBody .= "URL：https://net.hikkoshi-navi.jp/guide/au\n";
    $customerBody .= "営業時間：10:00〜20:00（年中無休）\n";

    $customerEncodedSubject = '=?UTF-8?B?' . base64_encode($customerSubject) . '?=';
    $customerEncodedBody = chunk_split(base64_encode($customerBody), 76, "\r\n");
    if (!mail($email, $customerEncodedSubject, $customerEncodedBody, $headers)) {
        // 管理メールは送信済みのため受付は成功扱いとし、個人情報を含めず失敗だけを記録します。
        error_log('Customer acknowledgement mail failed.');
    }
}

$_SESSION['last_form_submit'] = $now;
if ($isQuickForm) respond_json(200, true);
header('Location: ../thanks.html', true, 303);
exit;
