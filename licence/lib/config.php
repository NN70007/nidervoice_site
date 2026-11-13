<?php
/**
 * Licences NiderVoice — réglages du serveur (nidervoice.com).
 *
 * Aucun secret ici : la clé de signature et la base de données sont créées
 * par le serveur lui-même, dans un dossier situé HORS du dossier public du
 * site (jamais sur GitHub, jamais téléchargeable).
 */
declare(strict_types=1);

const NV_ADMIN_EMAILS = [
    'jb.niedercorn@gmail.com',
    'jb@niedercorn.com',
    'solenne@niedercorn.com',
    's.niedercorn@gmail.com',
];
const NV_MAIL_FROM = 'NiderVoice <licences@nidervoice.com>';

/** Validité d'un jeton : le logiciel fonctionne 30 jours sans vérification. */
const NV_TOKEN_DAYS = 30;
/** Statistiques détaillées par jour : 13 mois, puis totaux anonymes par mois. */
const NV_DETAIL_DAYS = 396;
/** Installation effacée 12 mois après sa dernière vérification. */
const NV_INACTIVE_DAYS = 365;
/** Totaux anonymes par mois : 5 ans. */
const NV_MONTHLY_KEEP_MONTHS = 60;

const NV_EDITIONS = ['distribuee'];
const NV_ADMIN_SESSION_HOURS = 12;
const NV_CODE_MINUTES = 10;

/**
 * Dossier des données, hors du dossier public : à côté de public_html chez
 * Hostinger. Sinon (hébergement différent, essais locaux), un dossier
 * « donnees » protégé par .htaccess.
 */
function nv_data_dir(): string
{
    static $dir = null;
    if ($dir !== null) {
        return $dir;
    }
    $env = getenv('NV_LICENCE_DATA');
    if ($env) {
        $dir = rtrim($env, '/');
    } else {
        $public = dirname(__DIR__, 2); // …/public_html
        $outside = dirname($public) . '/nidervoice_licences';
        if ((is_dir($outside) || @mkdir($outside, 0700, true)) && is_writable($outside)) {
            $dir = $outside;
        } else {
            $dir = dirname(__DIR__) . '/donnees';
            if (!is_dir($dir)) {
                @mkdir($dir, 0700, true);
            }
            if (!is_file($dir . '/.htaccess')) {
                @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
            }
        }
    }
    if (!is_dir($dir) || !is_writable($dir)) {
        throw new RuntimeException('Dossier des données inaccessible');
    }
    return $dir;
}
