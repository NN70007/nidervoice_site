<?php
/** Envoie un fichier CHIFFRÉ du modèle (ou le verrou cle.json), seulement à une session ouverte. */
declare(strict_types=1);
require_once __DIR__ . '/lib/base.php';

nv_headers("default-src 'none'; frame-ancestors 'none'");
try {
    if (!nv_session()) {
        http_response_code(403);
        exit;
    }
    $n = (string) ($_GET['n'] ?? '');
    if (!preg_match('/^(manifest\.json|cle\.json|m[0-9]_[0-9]{4}\.bin)$/', $n)) {
        http_response_code(404);
        exit;
    }
    $path = nv_data_dir() . '/modele/' . $n;
    if (!is_file($path)) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: ' . (str_ends_with($n, '.json') ? 'application/json' : 'application/octet-stream'));
    header('Content-Length: ' . filesize($path));
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    readfile($path);
} catch (Throwable $e) {
    error_log('Dictée NiderVoice (f) : ' . $e->getMessage());
    http_response_code(500);
}
