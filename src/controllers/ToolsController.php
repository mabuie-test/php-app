<?php
namespace App\Controllers;

use App\Helpers\Auth;
use App\Helpers\Response;
use App\Helpers\AuditHelper;

class ToolsController
{
    public static function track(): void
    {
        $user = null;
        try {
            $user = Auth::requireUser();
        } catch (\Throwable $e) {
            // anónimo aceitável — continuamos
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $tool = $data['tool'] ?? ($data['tool_id'] ?? 'unknown');
        $userId = $user['id'] ?? null;

        // regista no audit para métricas (facilita visualização no admin -> audits)
        AuditHelper::log($userId, 'tool:use', ['tool' => $tool]);

        Response::json(['message' => 'tracked']);
    }
}