<?php
/**
 * 引越受付フォーム メール送信
 * index.html の #entryForm から POST される想定
 */
declare(strict_types=1);

mb_language('Japanese');
mb_internal_encoding('UTF-8');
header('Content-Type: application/json; charset=utf-8');

/* ===== 設定 ===== */
$TO      = 'hikaricenter@012grp.co.jp';   // 宛先
$SUBJECT = '【インターネット引越し受付】フォームからのお問い合わせ';   // 件名
$FROM = 'contact-net-hikkoshi-navi@net.hikkoshi-navi.jp';   // ★このサイトのドメインのアドレスに変更してください
$SITE    = 'インターネット引越し受付.com';

/* ===== POST以外は拒否 ===== */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ===== ボット対策（隠しフィールドに入力があれば無視） ===== */
if (!empty($_POST['company'] ?? '')) {
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ===== 入力値 ===== */
$name  = trim((string)($_POST['name']  ?? ''));
$tel   = trim((string)($_POST['tel']   ?? ''));
$email = trim((string)($_POST['email'] ?? ''));
$agree = (string)($_POST['agree'] ?? '');

/* ===== サーバー側バリデーション ===== */
$errors = [];
if ($name === '' || mb_strlen($name) > 50) {
    $errors[] = 'お名前';
}
$telDigits = preg_replace('/[-\s]/u', '', $tel);
if (!preg_match('/\A0\d{9,10}\z/', (string)$telDigits)) {
    $errors[] = '電話番号';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'メールアドレス';
}
if ($agree === '') {
    $errors[] = 'プライバシーポリシーへの同意';
}
if ($errors) {
    http_response_code(422);
    echo json_encode([
        'ok'      => false,
        'message' => implode('、', $errors) . 'をご確認ください',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ===== ヘッダインジェクション対策（改行除去） ===== */
$strip = static function (string $v): string {
    return str_replace(["\r", "\n", "%0d", "%0a"], '', $v);
};
$name  = $strip($name);
$tel   = $strip($tel);
$email = $strip($email);

/* ===== 本文 ===== */
$now = (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Y/m/d H:i:s');
$ip  = $_SERVER['REMOTE_ADDR'] ?? '-';
$ua  = $_SERVER['HTTP_USER_AGENT'] ?? '-';

$body  = "{$SITE} のフォームからお問い合わせがありました。\n\n";
$body .= "──────────────────\n";
$body .= "■ お名前　　　　：{$name}\n";
$body .= "■ 電話番号　　　：{$tel}\n";
$body .= "■ メールアドレス：{$email}\n";
$body .= "──────────────────\n\n";
$body .= "受信日時：{$now}\n";
$body .= "IP　　　：{$ip}\n";
$body .= "UA　　　：{$ua}\n";

/* ===== ヘッダ ===== */
$headers  = 'From: ' . mb_encode_mimeheader($SITE) . " <{$FROM}>\r\n";
$headers .= "Reply-To: {$email}\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

/* ===== 送信（-f で Envelope-From を指定。届かない場合は第5引数を外す） ===== */
$sent = mb_send_mail($TO, $SUBJECT, $body, $headers, '-f' . $FROM);

if (!$sent) {
    http_response_code(500);
    echo json_encode([
        'ok'      => false,
        'message' => '送信に失敗しました。お手数ですがお電話でご連絡ください。',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
