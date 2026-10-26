// One-off copy of the old MongoDB data into MySQL.
//
//   MONGODB_URI="mongodb+srv://..." npm run migrate:mongo
//
// MySQL is the one in DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD.
// Apply the schema first (npm run db:deploy). Rows keep their MongoDB ObjectId as id,
// so links between them survive. Rows that already exist are skipped, so the script
// can be re-run after a partial failure. MongoDB is only read, never changed.
import "dotenv/config";
import { MongoClient, ObjectId, type Db, type Document } from "mongodb";
import { prisma } from "../src/config/database.js";
import { normalizeLanguage } from "../src/utils/language.js";
import { withContentDefaults, DEFAULT_SECTION_ORDER, DEFAULT_THEME, asJson } from "../src/models/Resume.js";

const BATCH = 500;

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("Set MONGODB_URI to the MongoDB database to copy from.");
  process.exit(1);
}

const id = (value: unknown): string => (value instanceof ObjectId ? value.toHexString() : String(value));
const optionalId = (value: unknown) => (value == null ? null : id(value));
const date = (value: unknown, fallback: Date | null = null): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }
  return fallback;
};
const str = (value: unknown, fallback = "") => (value == null ? fallback : String(value));
const optionalStr = (value: unknown) => (value == null || value === "" ? null : String(value));
const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const bool = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Plain JSON: ObjectIds become strings, and Mongoose's per-item `_id`s are dropped */
const plain = (value: unknown): unknown => {
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "_id" && key !== "__v")
        .map(([key, v]) => [key, plain(v)])
    );
  }
  return value;
};
const stringArray = (value: unknown) => (Array.isArray(value) ? value.filter((v) => v != null).map(String) : []);
const stringMap = (value: unknown) =>
  value && typeof value === "object"
    ? Object.fromEntries(Object.entries(plain(value) as Record<string, unknown>).map(([k, v]) => [k, str(v)]))
    : {};

const timestamps = (doc: Document) => {
  const createdAt = date(doc.createdAt, (doc._id instanceof ObjectId ? doc._id.getTimestamp() : null) ?? new Date())!;
  return { createdAt, updatedAt: date(doc.updatedAt, createdAt)! };
};

/** Reads a whole collection; the collections here are small enough to hold in memory */
const read = (db: Db, name: string) => db.collection(name).find({}).toArray();

const insert = async <T>(label: string, rows: T[], createMany: (data: T[]) => Promise<{ count: number }>) => {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    inserted += (await createMany(rows.slice(i, i + BATCH))).count;
  }
  console.log(`${label}: ${rows.length} read, ${inserted} inserted, ${rows.length - inserted} already present`);
};

const LANGUAGES = ["en", "bn"] as const;

async function migrate() {
  const mongo = new MongoClient(mongoUri!);
  await mongo.connect();
  const db = mongo.db();
  console.log(`Copying MongoDB database "${db.databaseName}" into MySQL`);

  const users = await read(db, "users");
  const userIds = new Set(users.map((u) => id(u._id)));
  await insert(
    "users",
    users.map((u) => ({
      id: id(u._id),
      name: str(u.name, "User"),
      email: str(u.email).toLowerCase(),
      password: optionalStr(u.password),
      avatar: optionalStr(u.avatar),
      googleId: optionalStr(u.googleId),
      role: oneOf(u.role, ["user", "admin"] as const, "user"),
      language: normalizeLanguage(u.language),
      isEmailVerified: bool(u.isEmailVerified),
      emailVerificationToken: optionalStr(u.emailVerificationToken),
      emailVerificationExpires: date(u.emailVerificationExpires),
      passwordResetToken: optionalStr(u.passwordResetToken),
      passwordResetExpires: date(u.passwordResetExpires),
      subscriptionPlan: oneOf(u.subscription?.plan, ["free", "premium"] as const, "free"),
      subscriptionStatus: oneOf(u.subscription?.status, ["active", "cancelled", "expired", "trial"] as const, "active"),
      subscriptionExpiresAt: date(u.subscription?.expiresAt),
      resumesCreated: num(u.usage?.resumesCreated),
      aiRequestsThisMonth: num(u.usage?.aiRequestsThisMonth),
      lastAiReset: date(u.usage?.lastAiReset, new Date())!,
      aiRequestsToday: num(u.usage?.aiRequestsToday),
      aiDayKey: optionalStr(u.usage?.aiDayKey),
      // Users without a code (very old accounts) get one derived from their id
      referralCode: str(u.referralCode) || `CV${id(u._id).slice(-8).toUpperCase()}`,
      referralCount: num(u.referralCount),
      theme: oneOf(u.theme, ["light", "dark", "system"] as const, "system"),
      lastLoginAt: date(u.lastLoginAt),
      ...timestamps(u),
    })),
    (data) => prisma.user.createMany({ data, skipDuplicates: true })
  );
  // Referrals point at other users, so they are linked once every user exists
  for (const u of users) {
    const referredById = optionalId(u.referredBy);
    if (referredById && userIds.has(referredById)) {
      await prisma.user.updateMany({ where: { id: id(u._id), referredById: null }, data: { referredById } });
    }
  }

  await insert(
    "templates",
    (await read(db, "templates")).map((t) => ({
      id: id(t._id),
      name: str(t.name),
      slug: str(t.slug),
      description: str(t.description),
      category: oneOf(t.category, ["ats", "modern", "bangladeshi", "creative"] as const, "ats"),
      thumbnail: str(t.thumbnail),
      isPremium: bool(t.isPremium),
      isActive: bool(t.isActive, true),
      defaultTheme: stringMap(t.defaultTheme),
      layout: str(t.layout, "single-column"),
      sortOrder: num(t.sortOrder),
      ...timestamps(t),
    })),
    (data) => prisma.template.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "subscription plans",
    (await read(db, "subscriptionplans")).map((p) => ({
      id: id(p._id),
      name: str(p.name),
      slug: str(p.slug),
      description: str(p.description),
      priceMonthly: num(p.priceMonthly),
      priceYearly: num(p.priceYearly),
      currency: str(p.currency, "BDT"),
      features: stringArray(p.features),
      maxResumes: num(p.limits?.maxResumes, 2),
      maxAiRequests: num(p.limits?.maxAiRequests, 5),
      watermarkPdf: bool(p.limits?.watermarkPdf, true),
      premiumTemplates: bool(p.limits?.premiumTemplates),
      atsChecker: bool(p.limits?.atsChecker),
      coverLetters: bool(p.limits?.coverLetters),
      aiOptimization: bool(p.limits?.aiOptimization),
      isActive: bool(p.isActive, true),
      sortOrder: num(p.sortOrder),
      ...timestamps(p),
    })),
    (data) => prisma.subscriptionPlan.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "coupons",
    (await read(db, "coupons")).map((c) => ({
      id: id(c._id),
      code: str(c.code).toUpperCase(),
      description: str(c.description),
      discountType: oneOf(c.discountType, ["percentage", "fixed"] as const, "percentage"),
      discountValue: num(c.discountValue),
      maxUses: num(c.maxUses, 100),
      usedCount: num(c.usedCount),
      validFrom: date(c.validFrom, new Date())!,
      validUntil: date(c.validUntil, new Date())!,
      applicablePlans: stringArray(c.applicablePlans),
      isActive: bool(c.isActive, true),
      ...timestamps(c),
    })),
    (data) => prisma.coupon.createMany({ data, skipDuplicates: true })
  );

  const resumes = (await read(db, "resumes")).filter((r) => userIds.has(id(r.userId)));
  const resumeIds = new Set(resumes.map((r) => id(r._id)));
  await insert(
    "resumes",
    resumes.map((r) => ({
      id: id(r._id),
      userId: id(r.userId),
      title: str(r.title, "My CV").slice(0, 255),
      slug: str(r.slug, id(r._id)).slice(0, 255),
      templateId: str(r.templateId, "modern-ats"),
      format: oneOf(r.format, ["international", "bangladeshi", "ats"] as const, "ats"),
      content: asJson(withContentDefaults(plain(r.content ?? {}) as never)),
      atsScore: typeof r.atsScore === "number" ? Math.round(r.atsScore) : null,
      atsFeedback: stringArray(r.atsFeedback),
      isPublic: bool(r.isPublic),
      publicSlug: optionalStr(r.publicSlug),
      language: normalizeLanguage(r.language),
      theme: r.theme ? stringMap(r.theme) : DEFAULT_THEME,
      sectionOrder: Array.isArray(r.sectionOrder) ? stringArray(r.sectionOrder) : DEFAULT_SECTION_ORDER,
      lastExportedAt: date(r.lastExportedAt),
      viewCount: num(r.viewCount),
      uploadedResumeText: optionalStr(r.uploadedResumeText),
      uploadedFileName: optionalStr(r.uploadedFileName),
      uploadedFilePath: optionalStr(r.uploadedFilePath),
      uploadedFileUrl: optionalStr(r.uploadedFileUrl),
      uploadedFileMimeType: optionalStr(r.uploadedFileMimeType),
      uploadedFileSize: typeof r.uploadedFileSize === "number" ? r.uploadedFileSize : null,
      uploadedAt: date(r.uploadedAt),
      ...timestamps(r),
    })),
    (data) => prisma.resume.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "cover letters",
    (await read(db, "coverletters"))
      .filter((l) => userIds.has(id(l.userId)))
      .map((l) => {
        const resumeId = optionalId(l.resumeId);
        return {
          id: id(l._id),
          userId: id(l.userId),
          title: str(l.title, "Cover Letter").slice(0, 255),
          companyName: str(l.companyName).slice(0, 255),
          jobTitle: str(l.jobTitle).slice(0, 255),
          content: str(l.content),
          language: normalizeLanguage(l.language),
          resumeId: resumeId && resumeIds.has(resumeId) ? resumeId : null,
          ...timestamps(l),
        };
      }),
    (data) => prisma.coverLetter.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "payments",
    (await read(db, "payments")).map((p) => {
      const userId = optionalId(p.userId);
      return {
        id: id(p._id),
        userId: userId && userIds.has(userId) ? userId : null,
        planSlug: str(p.planSlug),
        billingCycle: oneOf(p.billingCycle, ["monthly", "yearly"] as const, "monthly"),
        amount: num(p.amount),
        currency: str(p.currency, "BDT"),
        provider: oneOf(p.provider, ["sslcommerz", "bkash", "nagad"] as const, "bkash"),
        status: oneOf(p.status, ["pending", "completed", "failed", "cancelled", "refunded"] as const, "pending"),
        transactionId: str(p.transactionId, id(p._id)),
        providerSessionId: optionalStr(p.providerSessionId),
        providerData: p.providerData ? asJson(plain(p.providerData)) : undefined,
        couponCode: optionalStr(p.couponCode),
        discountAmount: num(p.discountAmount),
        ...timestamps(p),
      };
    }),
    (data) => prisma.payment.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "blogs",
    (await read(db, "blogs")).map((b) => {
      const authorId = optionalId(b.author);
      return {
        id: id(b._id),
        title: str(b.title).slice(0, 255),
        slug: str(b.slug, id(b._id)).slice(0, 255),
        excerpt: str(b.excerpt),
        content: str(b.content),
        coverImage: optionalStr(b.coverImage),
        authorId: authorId && userIds.has(authorId) ? authorId : null,
        tags: stringArray(b.tags),
        language: normalizeLanguage(b.language),
        isPublished: bool(b.isPublished),
        publishedAt: date(b.publishedAt),
        metaTitle: optionalStr(b.metaTitle),
        metaDescription: optionalStr(b.metaDescription),
        viewCount: num(b.viewCount),
        ...timestamps(b),
      };
    }),
    (data) => prisma.blog.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "contact messages",
    (await read(db, "contactmessages")).map((m) => ({
      id: id(m._id),
      name: str(m.name).slice(0, 100),
      email: str(m.email).slice(0, 200),
      message: str(m.message),
      ip: optionalStr(m.ip),
      handled: bool(m.handled),
      ...timestamps(m),
    })),
    (data) => prisma.contactMessage.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "page contents",
    (await read(db, "pagecontents"))
      .filter((p) => ["home", "about", "contact", "pricing", "blog"].includes(p.pageId))
      .map((p) => ({
        id: id(p._id),
        pageId: p.pageId as "home" | "about" | "contact" | "pricing" | "blog",
        language: oneOf(p.language, LANGUAGES, "en"),
        content: asJson(plain(p.content ?? {})),
        isActive: bool(p.isActive, true),
        ...timestamps(p),
      })),
    (data) => prisma.pageContent.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "payment configs",
    (await read(db, "bkashconfigs")).map((c) => {
      const updatedById = optionalId(c.updatedBy);
      return {
        id: id(c._id),
        provider: oneOf(c.provider, ["sslcommerz", "bkash", "nagad"] as const, "bkash"),
        number: optionalStr(c.number),
        instructions: str(c.instructions),
        enabled: bool(c.enabled, true),
        isActive: bool(c.isActive, true),
        updatedById: updatedById && userIds.has(updatedById) ? updatedById : null,
        ...timestamps(c),
      };
    }),
    (data) => prisma.paymentConfig.createMany({ data, skipDuplicates: true })
  );

  await insert(
    "admin settings",
    (await read(db, "adminsettings")).map((s) => {
      const updatedById = optionalId(s.updatedBy);
      return {
        id: id(s._id),
        key: str(s.key),
        value: str(s.value),
        updatedById: updatedById && userIds.has(updatedById) ? updatedById : null,
        ...timestamps(s),
      };
    }),
    (data) => prisma.adminSetting.createMany({ data, skipDuplicates: true })
  );

  // One row per calendar day; days stored twice (e.g. across a time-zone change) are summed
  type Metric = (typeof METRICS)[number];
  const days = new Map<string, { id: string; metrics: Record<Metric, number> }>();
  const METRICS = [
    "newUsers",
    "activeUsers",
    "resumesCreated",
    "resumesUploaded",
    "aiRequests",
    "pdfExports",
    "revenue",
    "premiumConversions",
  ] as const;
  for (const row of await read(db, "analytics")) {
    const day = date(row.date);
    if (!day) continue;
    const key = day.toISOString().slice(0, 10);
    const entry = days.get(key) ?? {
      id: id(row._id),
      metrics: Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>,
    };
    for (const metric of METRICS) entry.metrics[metric] += num(row.metrics?.[metric]);
    days.set(key, entry);
  }
  await insert(
    "analytics days",
    [...days].map(([key, entry]) => ({ id: entry.id, ...entry.metrics, date: new Date(`${key}T00:00:00.000Z`) })),
    (data) => prisma.analytics.createMany({ data, skipDuplicates: true })
  );

  await mongo.close();
  console.log("Done. MongoDB was not modified.");
}

migrate()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
