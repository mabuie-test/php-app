<?php
namespace App\Helpers;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use App\Config\Config;
use App\Models\User;

class Auth
{
    public static function issueToken(array $user): string
    {
        $payload = [
            'sub' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'iat' => time(),
            'exp' => time() + 60 * 60 * 24 * 3
        ];
        return JWT::encode($payload, Config::get('JWT_SECRET'), 'HS256');
    }

    public static function requireUser(): array
    {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (!str_starts_with($authHeader, 'Bearer ')) {
            Response::json(['message' => 'Token não fornecido'], 401);
            exit;
        }
        $token = substr($authHeader, 7);
        try {
            $decoded = JWT::decode($token, new Key(Config::get('JWT_SECRET'), 'HS256'));
            $user = User::findById($decoded->sub);
            if (!$user || !$user['active']) {
                Response::json(['message' => 'Conta inativa ou inexistente'], 401);
                exit;
            }
            return $user;
        } catch (\Throwable $e) {
            Response::json(['message' => 'Token inválido', 'detail' => $e->getMessage()], 401);
            exit;
        }
    }

    public static function requireAdmin(): array
    {
        $user = self::requireUser();
        if ($user['role'] !== 'admin') {
            Response::json(['message' => 'Acesso restrito a administradores'], 403);
            exit;
        }
        return $user;
    }
}
