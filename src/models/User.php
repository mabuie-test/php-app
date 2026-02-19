<?php
namespace App\Models;

use App\Config\Database;
use PDO;

class User
{
    public static function findByReferralCode(string $code): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM users WHERE referral_code = :code LIMIT 1');
        $stmt->execute([':code' => $code]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private static function generateReferralCode(): string
    {
        do {
            $candidate = strtoupper(bin2hex(random_bytes(4)));
        } while (self::findByReferralCode($candidate));
        return $candidate;
    }

    public static function create(array $data): int
    {
        $pdo = Database::pdo();
        $stmt = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, active, referral_code, referred_by) VALUES (:name, :email, :password_hash, :role, 1, :referral_code, :referred_by)');
        $stmt->execute([
            ':name' => $data['name'],
            ':email' => $data['email'],
            ':password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
            ':role' => $data['role'] ?? 'cliente',
            ':referral_code' => $data['referral_code'] ?? self::generateReferralCode(),
            ':referred_by' => $data['referred_by'] ?? null,
        ]);
        return (int) $pdo->lastInsertId();
    }

    public static function findByEmail(string $email): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM users WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function listAll(bool $includeInactive = false): array
    {
        $sql = 'SELECT id, name, email, role, active, referral_code, referred_by, created_at FROM users';
        if (!$includeInactive) {
            $sql .= ' WHERE active = 1';
        }
        $sql .= ' ORDER BY id DESC';
        $stmt = Database::pdo()->query($sql);
        return $stmt->fetchAll();
    }

    public static function adminEmails(): array
    {
        $stmt = Database::pdo()->query("SELECT email FROM users WHERE role='admin' AND active=1");
        return array_column($stmt->fetchAll(), 'email');
    }

    public static function updatePassword(int $id, string $password): void
    {
        $stmt = Database::pdo()->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $stmt->execute([':hash' => password_hash($password, PASSWORD_BCRYPT), ':id' => $id]);
    }


    public static function deleteNonAdmin(int $id): bool
    {
        $stmt = Database::pdo()->prepare("DELETE FROM users WHERE id = :id AND role != 'admin'");
        return $stmt->execute([':id' => $id]);
    }

    public static function firstAdminId(): ?int
    {
        $stmt = Database::pdo()->query("SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1");
        $id = $stmt->fetchColumn();
        return $id ? (int) $id : null;
    }

    public static function setActive(int $id, bool $active): void
    {
        $stmt = Database::pdo()->prepare('UPDATE users SET active = :active WHERE id = :id');
        $stmt->execute([':active' => $active ? 1 : 0, ':id' => $id]);
    }


    public static function dependencyCounts(int $id): array
    {
        $pdo = Database::pdo();
        $counts = [
            'orders' => 0,
            'invoices' => 0,
            'feedback' => 0,
            'payouts' => 0,
            'services' => 0,
        ];
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE user_id = :id');
        $stmt->execute([':id' => $id]);
        $counts['orders'] = (int) $stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM invoices WHERE user_id = :id');
        $stmt->execute([':id' => $id]);
        $counts['invoices'] = (int) $stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM feedback WHERE user_id = :id');
        $stmt->execute([':id' => $id]);
        $counts['feedback'] = (int) $stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM affiliate_payouts WHERE user_id = :id');
        $stmt->execute([':id' => $id]);
        $counts['payouts'] = (int) $stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM service_requests WHERE user_id = :id');
        $stmt->execute([':id' => $id]);
        $counts['services'] = (int) $stmt->fetchColumn();

        return $counts;
    }

    public static function anonymize(int $id): void
    {
        $safe = 'anon+' . $id . '@example.local';
        $name = 'Utilizador Anonimizado #' . $id;
        $stmt = Database::pdo()->prepare("UPDATE users SET name = :name, email = :email, active = 0, referred_by = NULL WHERE id = :id AND role != 'admin'");
        $stmt->execute([':name' => $name, ':email' => $safe, ':id' => $id]);
    }

}
