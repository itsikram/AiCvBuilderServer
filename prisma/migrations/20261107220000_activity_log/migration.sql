-- User activity shown in Admin -> Activity (ActivityLog in schema.prisma).
-- One statement with the foreign key inline, so a failed deploy leaves nothing half-made
-- (MySQL can't roll back DDL) and IF NOT EXISTS lets a retried deploy run it again.

-- CreateTable
CREATE TABLE IF NOT EXISTS `activity_logs` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NULL,
    `type` VARCHAR(40) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `metadata` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_logs_createdAt_idx`(`createdAt`),
    INDEX `activity_logs_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `activity_logs_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `activity_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
