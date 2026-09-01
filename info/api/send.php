<?php
declare(strict_types=1);

mb_language('Japanese');
mb_internal_encoding('UTF-8');
header('Content-Type: application/json; charset=utf-8');

const MAIL_TO = 'hikaricenter@012grp.co.jp';
const MAIL_FROM = 'contact-net-hikkoshi-navi@net.hikkoshi-navi.jp';

function respond(int $status, bool $ok, string $message = ''): never {
    http_response_code($status);
    echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, false, 'Method Not Allowed');
}
if (trim((string)($_POST['company'] ?? '')) !== '') respond(200, true);

function clean(string $key, int $limit = 500): string {
    $value = preg_replace('/[\r\n\0]+/u', ' ', trim((string)($_POST[$key] ?? ''))) ?? '';
    return mb_substr($value, 0, $limit, 'UTF-8');
}

$procedure = clean('procedure', 50);
$currentLine = clean('current_line', 100);

$name = clean('name', 50);
$tel = preg_replace('/\D+/', '', clean('tel')) ?? '';
$postal = preg_replace('/\D+/', '', clean('postal')) ?? '';
$address = clean('address', 200);
$email = clean('email', 254);

$errors = [];
if (!in_array($procedure, ['そのまま移転', '他社へ乗り換え', '相談して決めたい'], true)) $errors[] = '希望する手続き';
if ($currentLine === '') $errors[] = '現在利用中の回線';
if ($name === '') $errors[] = 'お名前';
if (!preg_match('/^0\d{9,10}$/', $tel)) $errors[] = '電話番号';
if (!preg_match('/^\d{7}$/', $postal)) $errors[] = '郵便番号';
if ($address === '') $errors[] = '住所';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'メールアドレス';
if ($errors) respond(422, false, implode('、', $errors) . 'をご確認ください。');

$postalFormatted = substr($postal, 0, 3) . '-' . substr($postal, 3);
$trackingKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gad_source','gad_campaignid','gclid','gbraid','wbraid','yclid','msclkid','fbclid','entry_url','submit_url','referrer','lp_name','carrier','device','entry_time'];

$body = "お申し込み【インターネット引越し受付.com】がありました。\n\n";
$body .= "---\n\n";
$body .= "[お名前] {$name}\n";
$body .= "[電話番号] {$tel}\n";
$body .= "[郵便番号] {$postalFormatted}\n";
$body .= "[住所] {$address}\n";
$body .= "[メールアドレス] {$email}\n\n";
$body .= "[希望する手続き] {$procedure}\n";
$body .= "[現在利用中の回線] {$currentLine}\n";
$body .= "\n";
$body .= "[パラメーター]\n";
foreach ($trackingKeys as $key) $body .= $key . ' = ' . clean($key) . "\n";

$otherQueryParams = json_decode((string)($_POST['other_query_params'] ?? ''), true);
if (is_array($otherQueryParams) && $otherQueryParams !== []) {
    $body .= "[その他のURLパラメーター]\n";
    $count = 0;
    foreach ($otherQueryParams as $key => $value) {
        if ($count >= 30) break;
        if (!is_string($key) || !preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $key)) continue;
        if (preg_match('/(?:password|passwd|pwd|token|secret|email|mail|phone|tel|name|address|postal|zipcode|session|auth|cookie)/i', $key)) continue;
        if (!is_scalar($value)) continue;
        $safeValue = preg_replace('/[\r\n\0]+/u', ' ', trim((string)$value)) ?? '';
        $body .= $key . ' = ' . mb_substr($safeValue, 0, 500, 'UTF-8') . "\n";
        $count++;
    }
}

$subject = '新お申し込み【インターネット引越し受付.com】';
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$encodedFromName = '=?UTF-8?B?' . base64_encode('インターネット引越し受付.com') . '?=';
$headers = "From: {$encodedFromName} <" . MAIL_FROM . ">\r\n";
$headers .= "Reply-To: {$email}\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Content-Transfer-Encoding: base64\r\n";

$encodedBody = chunk_split(base64_encode($body), 76, "\r\n");
$sent = mail(MAIL_TO, $encodedSubject, $encodedBody, $headers);
if (!$sent) respond(500, false, '送信に失敗しました。お手数ですがお電話でご連絡ください。');
respond(200, true);
