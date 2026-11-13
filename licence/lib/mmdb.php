<?php
/**
 * Lecteur minimal du format MaxMind DB (« .mmdb »), utilisé pour la base
 * gratuite « IP to City Lite » de DB-IP (licence CC BY 4.0).
 * Spécification : https://maxmind.github.io/MaxMind-DB/
 * Lecture seule, en mémoire ; aucune donnée n'est envoyée nulle part.
 */
declare(strict_types=1);

final class NvMmdb
{
    private const MARKER = "\xAB\xCD\xEFMaxMind.com";
    private string $buf;
    private int $nodeCount;
    private int $recordSize;
    private int $nodeBytes;
    private int $treeSize;
    private int $dataStart;
    private int $ipVersion;
    private int $ipv4Start = 0;
    public array $metadata;

    public function __construct(string $path)
    {
        $buf = @file_get_contents($path);
        if ($buf === false || $buf === '') {
            throw new RuntimeException('Base de géolocalisation illisible');
        }
        $this->buf = $buf;
        // Les métadonnées sont après le dernier marqueur, dans les 128 derniers Kio.
        $pos = strrpos($buf, self::MARKER);
        if ($pos !== false && $pos < strlen($buf) - 131072) {
            $pos = false;
        }
        if ($pos === false) {
            throw new RuntimeException('Base de géolocalisation invalide');
        }
        $metaStart = $pos + strlen(self::MARKER);
        [$meta] = $this->decode($metaStart, $metaStart);
        if (!is_array($meta) || !isset($meta['node_count'], $meta['record_size'], $meta['ip_version'])) {
            throw new RuntimeException('Métadonnées invalides');
        }
        $this->metadata = $meta;
        $this->nodeCount = (int) $meta['node_count'];
        $this->recordSize = (int) $meta['record_size'];
        if (!in_array($this->recordSize, [24, 28, 32], true)) {
            throw new RuntimeException('Taille d\'enregistrement non prise en charge');
        }
        $this->nodeBytes = intdiv($this->recordSize * 2, 8);
        $this->treeSize = $this->nodeBytes * $this->nodeCount;
        $this->dataStart = $this->treeSize + 16;
        $this->ipVersion = (int) $meta['ip_version'];
        if ($this->ipVersion === 6) {
            $node = 0;
            for ($i = 0; $i < 96 && $node < $this->nodeCount; $i++) {
                $node = $this->readNode($node, 0);
            }
            $this->ipv4Start = $node;
        }
    }

    /** Renvoie l'enregistrement associé à l'adresse, ou null. */
    public function get(string $ip): ?array
    {
        $packed = @inet_pton($ip);
        if ($packed === false) {
            return null;
        }
        $bits = strlen($packed) * 8;
        if ($bits === 32) {
            if ($this->ipVersion === 4) {
                $node = 0;
            } else {
                $node = $this->ipv4Start;
            }
        } else {
            if ($this->ipVersion === 4) {
                return null;
            }
            $node = 0;
        }
        for ($i = 0; $i < $bits && $node < $this->nodeCount; $i++) {
            $bit = (ord($packed[$i >> 3]) >> (7 - ($i & 7))) & 1;
            $node = $this->readNode($node, $bit);
        }
        if ($node === $this->nodeCount) {
            return null;
        }
        if ($node < $this->nodeCount) {
            throw new RuntimeException('Arbre de recherche invalide');
        }
        $offset = $node - $this->nodeCount - 16 + $this->dataStart;
        [$value] = $this->decode($offset, $this->dataStart);
        return is_array($value) ? $value : null;
    }

    private function readNode(int $node, int $index): int
    {
        $base = $node * $this->nodeBytes;
        $b = substr($this->buf, $base, $this->nodeBytes);
        switch ($this->recordSize) {
            case 24:
                $s = $index === 0 ? substr($b, 0, 3) : substr($b, 3, 3);
                return unpack('N', "\0" . $s)[1];
            case 28:
                if ($index === 0) {
                    $mid = (ord($b[3]) & 0xF0) >> 4;
                    return ($mid << 24) | unpack('N', "\0" . substr($b, 0, 3))[1];
                }
                $mid = ord($b[3]) & 0x0F;
                return ($mid << 24) | unpack('N', "\0" . substr($b, 4, 3))[1];
            default:
                return unpack('N', substr($b, $index * 4, 4))[1];
        }
    }

    /**
     * Décode une valeur à $offset ; $base est le début de la section de
     * données (les pointeurs y sont relatifs). Renvoie [valeur, offset suivant].
     */
    private function decode(int $offset, int $base): array
    {
        $ctrl = ord($this->buf[$offset++]);
        $type = $ctrl >> 5;
        if ($type === 1) {
            $ss = ($ctrl >> 3) & 0x3;
            $vvv = $ctrl & 0x7;
            switch ($ss) {
                case 0:
                    $p = ($vvv << 8) | ord($this->buf[$offset]);
                    $offset += 1;
                    break;
                case 1:
                    $p = (($vvv << 16) | unpack('n', substr($this->buf, $offset, 2))[1]) + 2048;
                    $offset += 2;
                    break;
                case 2:
                    $p = (($vvv << 24) | unpack('N', "\0" . substr($this->buf, $offset, 3))[1]) + 526336;
                    $offset += 3;
                    break;
                default:
                    $p = unpack('N', substr($this->buf, $offset, 4))[1];
                    $offset += 4;
            }
            [$value] = $this->decode($base + $p, $base);
            return [$value, $offset];
        }
        if ($type === 0) {
            $type = 7 + ord($this->buf[$offset++]);
        }
        $size = $ctrl & 0x1F;
        if ($size >= 29) {
            if ($size === 29) {
                $size = 29 + ord($this->buf[$offset]);
                $offset += 1;
            } elseif ($size === 30) {
                $size = 285 + unpack('n', substr($this->buf, $offset, 2))[1];
                $offset += 2;
            } else {
                $size = 65821 + unpack('N', "\0" . substr($this->buf, $offset, 3))[1];
                $offset += 3;
            }
        }
        switch ($type) {
            case 2: // chaîne UTF-8
            case 4: // octets
                return [substr($this->buf, $offset, $size), $offset + $size];
            case 3: // double
                return [unpack('E', substr($this->buf, $offset, 8))[1], $offset + 8];
            case 15: // float
                return [unpack('G', substr($this->buf, $offset, 4))[1], $offset + 4];
            case 5: // uint16
            case 6: // uint32
            case 9: // uint64
            case 10: // uint128
                $v = 0;
                for ($i = 0; $i < $size; $i++) {
                    $v = ($v * 256) + ord($this->buf[$offset + $i]);
                }
                return [$size <= 7 ? (int) $v : $v, $offset + $size];
            case 8: // int32
                $s = str_pad(substr($this->buf, $offset, $size), 4, "\0", STR_PAD_LEFT);
                $v = unpack('N', $s)[1];
                if ($size === 4 && $v >= 0x80000000) {
                    $v -= 0x100000000;
                }
                return [$v, $offset + $size];
            case 7: // map
                $map = [];
                for ($i = 0; $i < $size; $i++) {
                    [$k, $offset] = $this->decode($offset, $base);
                    [$v, $offset] = $this->decode($offset, $base);
                    $map[(string) $k] = $v;
                }
                return [$map, $offset];
            case 11: // tableau
                $arr = [];
                for ($i = 0; $i < $size; $i++) {
                    [$v, $offset] = $this->decode($offset, $base);
                    $arr[] = $v;
                }
                return [$arr, $offset];
            case 14: // booléen
                return [$size !== 0, $offset];
            default:
                throw new RuntimeException('Type de donnée non pris en charge : ' . $type);
        }
    }
}
