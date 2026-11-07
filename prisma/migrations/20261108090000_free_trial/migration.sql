-- Free Premium trial: how long the trial is (per plan, set in Admin -> Plans) and when each
-- user used theirs (one trial per account).

-- AlterTable
ALTER TABLE `users` ADD COLUMN `trialStartedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `subscription_plans` ADD COLUMN `trialDays` INTEGER NOT NULL DEFAULT 0;

-- Premium starts with a 7-day trial; admins change or remove it in Admin -> Plans
UPDATE `subscription_plans` SET `trialDays` = 7 WHERE `slug` = 'premium';
