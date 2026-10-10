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

function validPhone(string $tel): bool {
    if (preg_match('/^(070|080|090)/', $tel)) {
        return (bool)preg_match('/^(070|080|090)\d{8}$/', $tel);
    }
    return (bool)preg_match('/^0\d{9,10}$/', $tel);
}

$procedure = clean('procedure', 50);
$formType = clean('form_type', 30);
$isCallback = $formType === 'callback';
$isArea = $formType === 'area';
$isConsultation = $formType === 'consultation';
$currentLine = clean('current_line', 100);
$movingPlan = clean('moving_plan', 50);
$inquiryLine = clean('carrier', 100);
$inquiryLines = ['SoftBank 光', 'SoftBank Air', 'BIGLOBE光', 'フレッツ光', 'ドコモ光', 'auひかり', 'J:COM', 'So-net 光'];
$isCarrierInquiry = in_array($inquiryLine, $inquiryLines, true);

$name = clean('name', 50);
$preferredTime = clean('preferred_time', 30);
$tel = preg_replace('/\D+/', '', mb_convert_kana(clean('tel', 40), 'n', 'UTF-8')) ?? '';
$postal = preg_replace('/\D+/', '', clean('postal')) ?? '';
$address = clean('address', 200);
$email = clean('email', 254);

$errors = [];
if ($isCallback) {
    if ($name === '') $errors[] = 'お名前';
    if (!in_array($preferredTime, ['いつでも', '10-12時頃', '12-15時頃', '15-18時頃', '18時以降'], true)) $errors[] = 'ご案内希望時間帯';
}
if ($isArea) {
    if ($name === '') $errors[] = 'お名前';
    if (!preg_match('/^\d{7}$/', $postal)) $errors[] = '郵便番号';
    if ($address === '') $errors[] = '住所';
    if (!in_array($preferredTime, ['いつでも', '10-12時頃', '12-15時頃', '15-18時頃', '18時以降'], true)) $errors[] = 'ご希望の連絡時間帯';
}
if ($isConsultation) {
    if ($name === '') $errors[] = 'お名前';
    if (!preg_match('/^\d{7}$/', $postal)) $errors[] = '郵便番号';
    if ($address === '') $errors[] = '住所';
    if (!in_array($movingPlan, ['引越し済み（ネットはこれから）', '2週間以内に引っ越す', '1か月以内に引っ越す', '1か月以上先に引っ越す', '引っ越す予定はない（今の住まいで使う）'], true)) $errors[] = 'お引越しのご予定';
    if ($preferredTime !== '' && !in_array($preferredTime, ['いつでも', '10-12時頃', '12-15時頃', '15-18時頃', '18時以降'], true)) $errors[] = 'ご希望の連絡時間帯';
}
if (!$isCallback && !$isArea && !$isConsultation) {
    if (!in_array($procedure, ['引越し・移転', '引越しに伴う他社乗り換え', '新居で新規申し込み'], true)) $errors[] = '希望する手続き';
    if (!$isCarrierInquiry && $currentLine === '') $errors[] = '現在利用中の回線';
    if ($name === '') $errors[] = 'お名前';
    if (!preg_match('/^\d{7}$/', $postal)) $errors[] = '郵便番号';
    if ($address === '') $errors[] = '住所';
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'メールアドレス';
}
if (!validPhone($tel)) $errors[] = '電話番号';
if ($errors) respond(422, false, implode('、', $errors) . 'をご確認ください。');

$postalFormatted = substr($postal, 0, 3) . '-' . substr($postal, 3);
$trackingKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gad_source','gad_campaignid','gclid','gbraid','wbraid','yclid','msclkid','fbclid','entry_url','submit_url','referrer','lp_name','carrier','device','entry_time'];

$mailType = $isCallback ? '電話予約' : ($isArea ? 'エリアチェック' : 'お申し込み');
$body = "{$mailType}【インターネット引越し受付.com】がありました。\n\n---\n\n";
$body .= "[お名前] {$name}\n";
$body .= "[電話番号] {$tel}\n";
if (!$isCallback) {
    $body .= "[郵便番号] {$postalFormatted}\n";
    $body .= "[住所] {$address}\n";
}
if ($isCallback || ($isArea && $preferredTime !== '')) {
    $body .= "[ご案内希望時間帯] {$preferredTime}\n";
} elseif ($isConsultation) {
    $body .= "[お引越しのご予定] {$movingPlan}\n";
    if ($preferredTime !== '') $body .= "[ご希望の連絡時間帯] {$preferredTime}\n";
} elseif (!$isArea) {
    $body .= "[メールアドレス] {$email}\n\n";
    if ($isCarrierInquiry) {
        $body .= "[お問合せの回線] {$inquiryLine}\n";
    }
    $body .= "[希望する手続き] {$procedure}\n";
    if (!$isCarrierInquiry) $body .= "[現在利用中の回線] {$currentLine}\n";
}
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
if (!$isCallback && !$isArea && $email !== '') $headers .= "Reply-To: {$email}\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Content-Transfer-Encoding: base64\r\n";

$encodedBody = chunk_split(base64_encode($body), 76, "\r\n");
$sent = mail(MAIL_TO, $encodedSubject, $encodedBody, $headers);
if (!$sent) respond(500, false, '送信できませんでした。時間をおいて再度お試しください。');

// メールアドレスが入力された受付にだけ、お客様向けの受付完了メールを送信する。
if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $customerSubject = '【お申し込み受付完了】お問合せいただきありがとうございます。';
    $customerBody = "{$name} 様\n\n";
    $customerBody .= "この度はお問い合わせいただき、ありがとうございます。\n\n";
    $customerBody .= "ご入力いただいた内容で受付いたしました。\n";
    $customerBody .= "専門スタッフより順次ご連絡いたします。\n\n";
    $customerBody .= "【ご入力内容】\n";
    $customerBody .= "お名前：{$name}\n";
    $customerBody .= "電話番号：{$tel}\n";
    if (!$isCallback) {
        $customerBody .= "郵便番号：{$postalFormatted}\n";
        $customerBody .= "住所：{$address}\n";
    }
    $customerBody .= "メールアドレス：{$email}\n";
    if ($isCallback) {
        $customerBody .= "ご案内希望時間帯：{$preferredTime}\n";
    } elseif (!$isArea) {
        if (!$isCarrierInquiry) $customerBody .= "現在利用中の回線：{$currentLine}\n";
    }
    $customerBody .= "\n※本メールは配信専用のメールアドレスから送信しています。\n";
    $customerBody .= "こちらのメールにご返信いただいても、回答することができません。\n\n";
    $customerBody .= "インターネット引越し窓口\n";
    $customerBody .= "TEL：050-5291-8061\n";
    $customerBody .= "URL：https://net.hikkoshi-navi.jp/guide/\n";
    $customerBody .= "営業時間：10:00〜20:00（年中無休）\n";

    $customerEncodedSubject = '=?UTF-8?B?' . base64_encode($customerSubject) . '?=';
    $customerFromName = '=?UTF-8?B?' . base64_encode('インターネット引越し窓口') . '?=';
    $customerHeaders = "From: {$customerFromName} <" . MAIL_FROM . ">\r\n";
    $customerHeaders .= "MIME-Version: 1.0\r\n";
    $customerHeaders .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $customerHeaders .= "Content-Transfer-Encoding: base64\r\n";
    $customerEncodedBody = chunk_split(base64_encode($customerBody), 76, "\r\n");
    if (!mail($email, $customerEncodedSubject, $customerEncodedBody, $customerHeaders)) {
        error_log('Customer acknowledgement mail failed: ' . $email);
    }
}
respond(200, true);
