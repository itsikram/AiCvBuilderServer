-- Growth features: Premium passes and expiry reminders, one-time products and orders,
-- organisation access codes, referral rewards, job circulars and employer CV screening.
-- New tables have their foreign keys inline and use IF NOT EXISTS, so a retried deploy is safe.
-- AlterTable
ALTER TABLE `users` ADD COLUMN `bonusAiExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `bonusAiRequests` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `expiryReminderSentAt` DATETIME(3) NULL,
    ADD COLUMN `pdfCredits` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `qualifiedReferrals` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `referralQualifiedAt` DATETIME(3) NULL,
    ADD COLUMN `screeningCredits` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `productSlug` VARCHAR(80) NULL,
    MODIFY `billingCycle` ENUM('weekly', 'monthly', 'yearly') NULL;

-- AlterTable
ALTER TABLE `subscription_plans` ADD COLUMN `priceWeekly` DOUBLE NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS `products` (
    `id` VARCHAR(36) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `kind` ENUM('pdf_credits', 'ai_credits', 'screening_credits', 'service') NOT NULL,
    `price` DOUBLE NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'BDT',
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `validDays` INTEGER NOT NULL DEFAULT 0,
    `deliveryDays` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_slug_key`(`slug`),
    INDEX `products_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `orders` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NULL,
    `productId` VARCHAR(36) NOT NULL,
    `paymentId` VARCHAR(36) NULL,
    `status` ENUM('awaiting_payment', 'paid', 'in_progress', 'delivered', 'cancelled') NOT NULL DEFAULT 'awaiting_payment',
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'BDT',
    `notes` TEXT NULL,
    `resumeId` VARCHAR(36) NULL,
    `deliveryMessage` TEXT NULL,
    `deliveredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `orders_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `orders_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `orders_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `orders_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `access_codes` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `label` VARCHAR(150) NOT NULL,
    `premiumDays` INTEGER NOT NULL,
    `maxUses` INTEGER NOT NULL DEFAULT 100,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `access_codes_code_key`(`code`),
    PRIMARY KEY (`id`),
    CONSTRAINT `access_codes_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `access_code_redemptions` (
    `id` VARCHAR(36) NOT NULL,
    `codeId` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `access_code_redemptions_userId_idx`(`userId`),
    UNIQUE INDEX `access_code_redemptions_codeId_userId_key`(`codeId`, `userId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `access_code_redemptions_codeId_fkey` FOREIGN KEY (`codeId`) REFERENCES `access_codes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `access_code_redemptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `job_circulars` (
    `id` VARCHAR(36) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `organization` VARCHAR(255) NOT NULL,
    `category` ENUM('government', 'bank', 'private', 'ngo', 'international', 'other') NOT NULL DEFAULT 'government',
    `language` ENUM('en', 'bn') NOT NULL DEFAULT 'bn',
    `summary` TEXT NOT NULL,
    `vacancies` INTEGER NULL,
    `location` VARCHAR(255) NULL,
    `salary` VARCHAR(255) NULL,
    `education` VARCHAR(500) NULL,
    `applyStart` DATETIME(3) NULL,
    `deadline` DATETIME(3) NULL,
    `applyUrl` TEXT NULL,
    `sourceUrl` TEXT NULL,
    `photoSpec` VARCHAR(255) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `authorId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_circulars_slug_key`(`slug`),
    INDEX `job_circulars_isPublished_publishedAt_idx`(`isPublished`, `publishedAt`),
    INDEX `job_circulars_isPublished_deadline_idx`(`isPublished`, `deadline`),
    PRIMARY KEY (`id`),
    CONSTRAINT `job_circulars_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `screenings` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `jobDescription` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `screenings_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `screenings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `screening_candidates` (
    `id` VARCHAR(36) NOT NULL,
    `screeningId` VARCHAR(36) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NULL,
    `score` INTEGER NOT NULL,
    `strengths` JSON NOT NULL,
    `gaps` JSON NOT NULL,
    `summary` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `screening_candidates_screeningId_score_idx`(`screeningId`, `score`),
    PRIMARY KEY (`id`),
    CONSTRAINT `screening_candidates_screeningId_fkey` FOREIGN KEY (`screeningId`) REFERENCES `screenings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7-day Premium pass at BDT 99 (Admin -> Plans; 0 hides it)
UPDATE `subscription_plans` SET `priceWeekly` = 99 WHERE `slug` = 'premium' AND `priceWeekly` = 0;

-- Paid Premium now ends on its expiry date. Paid users whose date has already passed (or is
-- days away) get 7 more days from this release, so nobody loses Premium without notice.
UPDATE `users`
SET `subscriptionExpiresAt` = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY)
WHERE `subscriptionPlan` = 'premium'
  AND `subscriptionStatus` = 'active'
  AND `subscriptionExpiresAt` IS NOT NULL
  AND `subscriptionExpiresAt` < DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY);
