<?php
namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\AuditHelper;

class MarketingController
{
    public static function captureLead(): void
    {
        $raw = file_get_contents('php://input') ?: '';
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = $_POST;
        }

        $name = trim((string)($data['name'] ?? ''));
        $email = trim((string)($data['email'] ?? ''));
        $phone = trim((string)($data['phone'] ?? ''));
        $interest = trim((string)($data['interest'] ?? 'lead_magnet_tcc'));
        $source = trim((string)($data['source'] ?? 'website_home'));

        if ($name === '' || $email === '') {
            Response::json(['message' => 'Nome e email são obrigatórios.'], 422);
            return;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::json(['message' => 'Email inválido.'], 422);
            return;
        }

        AuditHelper::log(null, 'marketing:lead', [
            'name' => $name,
            'email' => $email,
            'phone' => $phone ?: null,
            'interest' => $interest,
            'source' => $source,
        ]);

        Response::json([
            'message' => 'Lead registado com sucesso.',
            'next' => '/assets/checklist-tcc.txt'
        ]);
    }
}
