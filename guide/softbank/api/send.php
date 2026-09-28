<?php
declare(strict_types=1);
session_start();

const MAIL_TO = 'hikaricenter@012grp.co.jp';
const MAIL_FROM = 'website@012grp.co.jp';

function redirect_error(string $code): never {
    header('Location: ../application/?send=error&reason=' . rawurlencode($code) . '#application', true, 303);
    exit;
}

function is_quick_form(): bool {
    $type = trim((string)($_POST['form_type'] ?? ''));
    return $type === 'area' || $type === 'callback' || $type === 'estimate';
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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method Not Allowed');
}

// Reject cross-origin browser posts when an Origin header is available.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '');
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== $host) {
    fail_request('origin', '送信元を確認できませんでした。', 403);
}

// Honeypot and short interval rate limit.
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
$currentLine = line('current_line');
$moving = line('moving');
$name = $isQuickForm ? line('name') : line('customer_name');
$phone = preg_replace('/\D+/', '', line($isQuickForm ? 'tel' : 'phone')) ?? '';
$postal = preg_replace('/\D+/', '', line('postal')) ?? '';
$address = line('address');
$housingType = line('housing_type');
$contactTime = line('contact_time') ?: 'いつでも可';
$preferredTime = line('preferred_time');

$allowedProcedures = ['新規申し込み', '他社からの乗り換え', '引っ越し・移転'];
$allowedMoving = ['あり', 'なし', '未定'];
if ($isCallback) {
    $allowedTimes = ['いつでも', '10-12時頃', '12-15時頃', '15-18時頃', '18時以降'];
    if ($name === '' || !preg_match('/^0\d{9,10}$/', $phone)) fail_request('contact', 'お名前と電話番号をご確認ください。');
    if (!in_array($preferredTime, $allowedTimes, true)) fail_request('preferred_time', 'ご案内希望時間帯をご確認ください。');
} elseif ($isArea) {
    if ($name === '' || !preg_match('/^0\d{9,10}$/', $phone)) fail_request('contact', 'お名前と電話番号をご確認ください。');
    if (!preg_match('/^\d{7}$/', $postal) || $address === '') fail_request('address', '郵便番号と住所をご確認ください。');
} elseif ($isEstimate) {
    $allowedHousingTypes = ['戸建住宅', '集合住宅'];
    $allowedEstimateLines = ['SoftBank 光', 'SoftBank Air', 'フレッツ光・他社光コラボ', 'その他の固定回線', 'ホームルーター・モバイルWi-Fi', '利用していない・不明'];
    if ($name === '' || !preg_match('/^0\d{9,10}$/', $phone)) fail_request('contact', 'お名前と電話番号をご確認ください。');
    if (!preg_match('/^\d{7}$/', $postal)) fail_request('postal', '郵便番号をご確認ください。');
    if (!in_array($housingType, $allowedHousingTypes, true)) fail_request('housing_type', '住居タイプをご確認ください。');
    if (!in_array($currentLine, $allowedEstimateLines, true)) fail_request('current_line', '現在利用中の回線をご確認ください。');
} else {
    if (!in_array($procedure, $allowedProcedures, true) || $currentLine === '' || !in_array($moving, $allowedMoving, true)) redirect_error('step1');
    if ($name === '' || !preg_match('/^0\d{9,10}$/', $phone)) redirect_error('contact');
    if (!preg_match('/^\d{7}$/', $postal) || $address === '') redirect_error('address');
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

// Format values for readability in the notification email.
$postalFormatted = $postal === '' ? '' : substr($postal, 0, 3) . '-' . substr($postal, 3);
$phoneFormatted = $phone;
if (preg_match('/^(0[789]0)(\d{4})(\d{4})$/', $phone, $matches)) {
    $phoneFormatted = $matches[1] . '-' . $matches[2] . '-' . $matches[3];
}

$mailType = $isCallback ? '電話予約' : ($isArea ? 'エリアチェック' : ($isEstimate ? 'お見積り' : 'お問い合わせ'));
$body = $mailType . "のお知らせです。\n\n";
$body .= "===受付内容===\n";
if (!$isQuickForm) {
    $body .= "[希望する手続き] " . $procedure . "\n";
    $body .= "[現在利用中の回線] " . $currentLine . "\n";
    $body .= "[引っ越し予定] " . $moving . "\n";
}
$body .= "[お名前] " . $name . "\n";
$body .= "[連絡先電話番号] " . $phoneFormatted . "\n";
if ($isArea || !$isQuickForm) {
    $body .= "[郵便番号] " . $postalFormatted . "\n";
    $body .= "[住所] " . $address . "\n";
} elseif ($isEstimate) {
    $body .= "[住居タイプ] " . $housingType . "\n";
    $body .= "[現在利用中の回線] " . $currentLine . "\n";
    $body .= "[郵便番号] " . $postalFormatted . "\n";
}
if ($isCallback) {
    $body .= "[ご案内希望時間帯] " . $preferredTime . "\n";
} elseif (!$isArea && !$isEstimate) {
    $body .= "[連絡希望時間帯] " . $contactTime . "\n";
}
$body .= "[受付日時] " . date('Y-m-d H:i:s') . "\n";
$body .= "[パラメータ]\n";
foreach ($trackingKeys as $key) $body .= $key . ' = ' . clean_value($_POST[$key] ?? '') . "\n";
if ($otherQueryParams !== []) {
    $body .= "[その他のURLパラメータ]\n";
    foreach ($otherQueryParams as $key => $value) $body .= $key . ' = ' . $value . "\n";
}
$body .= "============\n";

$subject = '【' . $mailType . '】ソフトバンクLPから受付がありました';
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$encodedFromName = '=?UTF-8?B?' . base64_encode('ソフトバンク光 受付窓口') . '?=';
$headers = "From: " . $encodedFromName . " <" . MAIL_FROM . ">\r\n";
$headers .= "Reply-To: " . MAIL_FROM . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Content-Transfer-Encoding: base64\r\n";

$encodedBody = chunk_split(base64_encode($body), 76, "\r\n");
$sent = mail(MAIL_TO, $encodedSubject, $encodedBody, $headers);

if (!$sent) fail_request('mail', '送信できませんでした。時間をおいて再度お試しください。', 500);
$_SESSION['last_form_submit'] = $now;
if ($isQuickForm) respond_json(200, true);
header('Location: ../thanks.html', true, 303);
exit;
