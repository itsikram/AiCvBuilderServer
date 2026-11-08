-- Keywords tracked in Admin -> SEO & keywords (SeoKeyword in schema.prisma), seeded with the
-- primary keywords from the client's docs/SEO_KEYWORDS.md. Admins add, edit and remove them;
-- INSERT IGNORE skips any that already exist, so a retried deploy runs this again safely.

-- CreateTable
CREATE TABLE IF NOT EXISTS `seo_keywords` (
    `id` VARCHAR(36) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `language` ENUM('en', 'bn') NOT NULL DEFAULT 'en',
    `targetPath` VARCHAR(191) NULL,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `seo_keywords_keyword_key`(`keyword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed
INSERT IGNORE INTO `seo_keywords` (`id`, `keyword`, `language`, `targetPath`, `notes`, `createdAt`, `updatedAt`) VALUES
    ('seokw001', 'free cv maker bd', 'en', '/', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw002', 'ai cv maker', 'en', '/', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw003', 'resume builder bangladesh', 'en', '/', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw004', 'ফ্রি সিভি তৈরি', 'bn', '/bn', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw005', 'সিভি মেকার', 'bn', '/bn', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw006', 'cv format bd', 'en', '/cv-format-bangladesh', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw007', 'cv format for job in bangladesh', 'en', '/cv-format-bangladesh', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw008', 'সিভি ফরমেট', 'bn', '/bn/cv-format-bangladesh', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw009', 'চাকরির সিভি ফরমেট', 'bn', '/bn/cv-format-bangladesh', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw010', 'fresher cv format bd', 'en', '/fresher-cv-format', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw011', 'ফ্রেশার সিভি ফরমেট', 'bn', '/bn/fresher-cv-format', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw012', 'cv for government job bangladesh', 'en', '/government-job-cv', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw013', 'সরকারি চাকরির সিভি ফরমেট', 'bn', '/bn/government-job-cv', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw014', 'bdjobs cv format', 'en', '/bdjobs-cv-format', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw015', 'বিডিজবস সিভি ফরমেট', 'bn', '/bn/bdjobs-cv-format', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw016', 'biodata format for job', 'en', '/biodata-format', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw017', 'বায়োডাটা ফরমেট', 'bn', '/bn/biodata-format', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw018', 'how to write a cv bangladesh', 'en', '/cv-writing-tips', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw019', 'জীবন বৃত্তান্ত লেখার নিয়ম', 'bn', '/bn/cv-writing-tips', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw020', 'cv format pdf download', 'en', '/cv-format-pdf-download', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw021', 'সিভি ফরমেট pdf', 'bn', '/bn/cv-format-pdf-download', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw022', 'cv format for bank job in bangladesh', 'en', '/bank-job-cv', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw023', 'ব্যাংক জবের সিভি ফরমেট', 'bn', '/bn/bank-job-cv', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw024', 'ats friendly cv', 'en', '/ats-friendly-cv', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw025', 'cv for abroad job from bangladesh', 'en', '/abroad-job-cv', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw026', 'বিদেশে চাকরির সিভি', 'bn', '/bn/abroad-job-cv', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw027', 'cover letter bd', 'en', '/cover-letter-bangladesh', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw028', 'কভার লেটার লেখার নিয়ম', 'bn', '/bn/cover-letter-bangladesh', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw029', 'cv template bangladesh', 'en', '/templates', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw030', 'সিভি টেমপ্লেট', 'bn', '/bn/templates', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw031', 'best free cv maker', 'en', '/best-free-cv-maker', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw032', 'সেরা ফ্রি সিভি মেকার', 'bn', '/bn/best-free-cv-maker', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw033', 'photo and signature resize', 'en', '/photo-signature-resizer', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw034', 'ছবি ও স্বাক্ষর রিসাইজ', 'bn', '/bn/photo-signature-resizer', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw035', 'marriage biodata format', 'en', '/marriage-biodata-maker', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw036', 'বিয়ের বায়োডাটা ফরমেট', 'bn', '/bn/marriage-biodata-maker', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw037', 'job circular bd', 'en', '/jobs', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('seokw038', 'চাকরির খবর', 'bn', '/bn/jobs', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
