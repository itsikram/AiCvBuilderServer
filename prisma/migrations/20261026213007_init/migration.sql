-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NULL,
    `avatar` TEXT NULL,
    `googleId` VARCHAR(191) NULL,
    `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    `language` ENUM('en', 'bn') NOT NULL DEFAULT 'en',
    `isEmailVerified` BOOLEAN NOT NULL DEFAULT false,
    `emailVerificationToken` VARCHAR(128) NULL,
    `emailVerificationExpires` DATETIME(3) NULL,
    `passwordResetToken` VARCHAR(128) NULL,
    `passwordResetExpires` DATETIME(3) NULL,
    `subscriptionPlan` ENUM('free', 'premium') NOT NULL DEFAULT 'free',
    `subscriptionStatus` ENUM('active', 'cancelled', 'expired', 'trial') NOT NULL DEFAULT 'active',
    `subscriptionExpiresAt` DATETIME(3) NULL,
    `resumesCreated` INTEGER NOT NULL DEFAULT 0,
    `aiRequestsThisMonth` INTEGER NOT NULL DEFAULT 0,
    `lastAiReset` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aiRequestsToday` INTEGER NOT NULL DEFAULT 0,
    `aiDayKey` VARCHAR(10) NULL,
    `referralCode` VARCHAR(32) NOT NULL,
    `referredById` VARCHAR(36) NULL,
    `referralCount` INTEGER NOT NULL DEFAULT 0,
    `theme` ENUM('light', 'dark', 'system') NOT NULL DEFAULT 'system',
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_referralCode_key`(`referralCode`),
    INDEX `users_googleId_idx`(`googleId`),
    INDEX `users_emailVerificationToken_idx`(`emailVerificationToken`),
    INDEX `users_passwordResetToken_idx`(`passwordResetToken`),
    INDEX `users_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resumes` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `templateId` VARCHAR(80) NOT NULL DEFAULT 'modern-ats',
    `format` ENUM('international', 'bangladeshi', 'ats') NOT NULL DEFAULT 'ats',
    `content` JSON NOT NULL,
    `atsScore` INTEGER NULL,
    `atsFeedback` JSON NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `publicSlug` VARCHAR(255) NULL,
    `language` ENUM('en', 'bn') NOT NULL DEFAULT 'en',
    `theme` JSON NOT NULL,
    `sectionOrder` JSON NOT NULL,
    `lastExportedAt` DATETIME(3) NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `uploadedResumeText` LONGTEXT NULL,
    `uploadedFileName` VARCHAR(255) NULL,
    `uploadedFilePath` VARCHAR(500) NULL,
    `uploadedFileUrl` TEXT NULL,
    `uploadedFileMimeType` VARCHAR(191) NULL,
    `uploadedFileSize` INTEGER NULL,
    `uploadedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `resumes_publicSlug_key`(`publicSlug`),
    INDEX `resumes_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `resumes_userId_updatedAt_idx`(`userId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cover_letters` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `companyName` VARCHAR(255) NOT NULL,
    `jobTitle` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `language` ENUM('en', 'bn') NOT NULL DEFAULT 'en',
    `resumeId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cover_letters_userId_updatedAt_idx`(`userId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NULL,
    `planSlug` VARCHAR(80) NOT NULL,
    `billingCycle` ENUM('monthly', 'yearly') NOT NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'BDT',
    `provider` ENUM('sslcommerz', 'bkash', 'nagad') NOT NULL,
    `status` ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
    `transactionId` VARCHAR(191) NOT NULL,
    `providerSessionId` VARCHAR(191) NULL,
    `providerData` JSON NULL,
    `couponCode` VARCHAR(40) NULL,
    `discountAmount` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_transactionId_key`(`transactionId`),
    INDEX `payments_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `payments_provider_status_createdAt_idx`(`provider`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `priceMonthly` DOUBLE NOT NULL,
    `priceYearly` DOUBLE NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'BDT',
    `features` JSON NOT NULL,
    `maxResumes` INTEGER NOT NULL DEFAULT 2,
    `maxAiRequests` INTEGER NOT NULL DEFAULT 5,
    `watermarkPdf` BOOLEAN NOT NULL DEFAULT true,
    `premiumTemplates` BOOLEAN NOT NULL DEFAULT false,
    `atsChecker` BOOLEAN NOT NULL DEFAULT false,
    `coverLetters` BOOLEAN NOT NULL DEFAULT false,
    `aiOptimization` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscription_plans_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `discountType` ENUM('percentage', 'fixed') NOT NULL,
    `discountValue` DOUBLE NOT NULL,
    `maxUses` INTEGER NOT NULL DEFAULT 100,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `validFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validUntil` DATETIME(3) NOT NULL,
    `applicablePlans` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `templates` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `category` ENUM('ats', 'modern', 'bangladeshi', 'creative') NOT NULL DEFAULT 'ats',
    `thumbnail` VARCHAR(500) NOT NULL DEFAULT '',
    `isPremium` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `defaultTheme` JSON NOT NULL,
    `layout` VARCHAR(40) NOT NULL DEFAULT 'single-column',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `templates_slug_key`(`slug`),
    INDEX `templates_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blogs` (
    `id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `excerpt` TEXT NOT NULL,
    `content` LONGTEXT NOT NULL,
    `coverImage` TEXT NULL,
    `authorId` VARCHAR(36) NULL,
    `tags` JSON NOT NULL,
    `language` ENUM('en', 'bn') NOT NULL DEFAULT 'en',
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `metaTitle` VARCHAR(255) NULL,
    `metaDescription` TEXT NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `blogs_slug_key`(`slug`),
    INDEX `blogs_isPublished_publishedAt_idx`(`isPublished`, `publishedAt`),
    INDEX `blogs_slug_language_idx`(`slug`, `language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_messages` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `ip` VARCHAR(64) NULL,
    `handled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_contents` (
    `id` VARCHAR(36) NOT NULL,
    `pageId` ENUM('home', 'about', 'contact', 'pricing', 'blog') NOT NULL,
    `language` ENUM('en', 'bn') NOT NULL DEFAULT 'en',
    `content` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `page_contents_pageId_language_key`(`pageId`, `language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_configs` (
    `id` VARCHAR(36) NOT NULL,
    `provider` ENUM('sslcommerz', 'bkash', 'nagad') NOT NULL DEFAULT 'bkash',
    `number` VARCHAR(40) NULL,
    `instructions` TEXT NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payment_configs_provider_isActive_updatedAt_idx`(`provider`, `isActive`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_settings` (
    `id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL DEFAULT '',
    `updatedById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analytics` (
    `id` VARCHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `newUsers` INTEGER NOT NULL DEFAULT 0,
    `activeUsers` INTEGER NOT NULL DEFAULT 0,
    `resumesCreated` INTEGER NOT NULL DEFAULT 0,
    `resumesUploaded` INTEGER NOT NULL DEFAULT 0,
    `aiRequests` INTEGER NOT NULL DEFAULT 0,
    `pdfExports` INTEGER NOT NULL DEFAULT 0,
    `revenue` DOUBLE NOT NULL DEFAULT 0,
    `premiumConversions` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `analytics_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_referredById_fkey` FOREIGN KEY (`referredById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resumes` ADD CONSTRAINT `resumes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cover_letters` ADD CONSTRAINT `cover_letters_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cover_letters` ADD CONSTRAINT `cover_letters_resumeId_fkey` FOREIGN KEY (`resumeId`) REFERENCES `resumes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blogs` ADD CONSTRAINT `blogs_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_configs` ADD CONSTRAINT `payment_configs_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_settings` ADD CONSTRAINT `admin_settings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
