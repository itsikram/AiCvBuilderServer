import mongoose from "mongoose";
import dotenv from "dotenv";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { User } from "../models/User.js";
import { Template } from "../models/Template.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { Coupon } from "../models/Coupon.js";
import { Blog } from "../models/Blog.js";

dotenv.config();

const templates = [
  {
    name: "Modern ATS",
    slug: "modern-ats",
    description: "Clean ATS-friendly single column layout",
    category: "ats" as const,
    thumbnail: "/templates/modern-ats.svg",
    isPremium: false,
    sortOrder: 1,
    layout: "single-column",
  },
  {
    name: "Professional BD",
    slug: "professional-bd",
    description: "Bangladeshi corporate CV format",
    category: "bangladeshi" as const,
    thumbnail: "/templates/professional-bd.svg",
    isPremium: false,
    sortOrder: 2,
    layout: "two-column",
  },
  {
    name: "Executive Pro",
    slug: "executive-pro",
    description: "Premium executive resume template",
    category: "modern" as const,
    thumbnail: "/templates/executive-pro.svg",
    isPremium: true,
    sortOrder: 3,
    layout: "single-column",
  },
  {
    name: "Creative Portfolio",
    slug: "creative-portfolio",
    description: "For designers and creative professionals",
    category: "creative" as const,
    thumbnail: "/templates/creative.svg",
    isPremium: true,
    sortOrder: 4,
    layout: "sidebar",
  },
  {
    name: "International Standard",
    slug: "international",
    description: "Global standard resume for remote jobs",
    category: "ats" as const,
    thumbnail: "/templates/international.svg",
    isPremium: false,
    sortOrder: 5,
    layout: "single-column",
  },
  {
    name: "Minimalist Clean",
    slug: "minimalist-clean",
    description: "Simple and clean design for tech professionals",
    category: "modern" as const,
    thumbnail: "/templates/minimalist.svg",
    isPremium: false,
    sortOrder: 6,
    layout: "single-column",
  },
  {
    name: "Tech Professional",
    slug: "tech-professional",
    description: "Optimized for software engineers and IT roles",
    category: "ats" as const,
    thumbnail: "/templates/tech-pro.svg",
    isPremium: false,
    sortOrder: 7,
    layout: "two-column",
  },
  {
    name: "Bangladeshi Government",
    slug: "bd-government",
    description: "Standard format for government job applications",
    category: "bangladeshi" as const,
    thumbnail: "/templates/bd-gov.svg",
    isPremium: false,
    sortOrder: 8,
    layout: "single-column",
  },
  {
    name: "Bold Modern",
    slug: "bold-modern",
    description: "Eye-catching design for marketing and sales roles",
    category: "creative" as const,
    thumbnail: "/templates/bold-modern.svg",
    isPremium: true,
    sortOrder: 9,
    layout: "two-column",
  },
  {
    name: "Academic CV",
    slug: "academic-cv",
    description: "For researchers, professors, and academic positions",
    category: "ats" as const,
    thumbnail: "/templates/academic.svg",
    isPremium: false,
    sortOrder: 10,
    layout: "single-column",
  },
  {
    name: "Startup Ready",
    slug: "startup-ready",
    description: "Modern design perfect for startup applications",
    category: "modern" as const,
    thumbnail: "/templates/startup.svg",
    isPremium: true,
    sortOrder: 11,
    layout: "sidebar",
  },
  {
    name: "Classic Professional",
    slug: "classic-professional",
    description: "Timeless design suitable for all industries",
    category: "ats" as const,
    thumbnail: "/templates/classic.svg",
    isPremium: false,
    sortOrder: 12,
    layout: "single-column",
  },
  {
    name: "Global Corporate",
    slug: "global-corporate",
    description: "International corporate layout with structured sections and clean typography",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 13,
    layout: "single-column",
  },
  {
    name: "Finance Forward",
    slug: "finance-forward",
    description: "Professional finance and analyst resume built for global teams",
    category: "ats" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 14,
    layout: "single-column",
  },
  {
    name: "Consulting Elite",
    slug: "consulting-elite",
    description: "Executive-ready format for strategy, consulting, and advisory roles",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: true,
    sortOrder: 15,
    layout: "single-column",
  },
  {
    name: "Product Strategy",
    slug: "product-strategy",
    description: "Balanced layout for product and strategy professionals",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 16,
    layout: "sidebar",
  },
  {
    name: "Data Analytics",
    slug: "data-analytics",
    description: "Clean data, analytics, and insights-focused international CV",
    category: "ats" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 17,
    layout: "sidebar",
  },
  {
    name: "Sales Growth",
    slug: "sales-growth",
    description: "High-impact resume for sales, account management, and growth roles",
    category: "creative" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: true,
    sortOrder: 18,
    layout: "single-column",
  },
  {
    name: "Customer Success",
    slug: "customer-success",
    description: "Structured design for customer-facing and retention teams",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 19,
    layout: "single-column",
  },
  {
    name: "Remote Global",
    slug: "remote-global",
    description: "International-friendly design optimized for remote and distributed roles",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 20,
    layout: "single-column",
  },
  {
    name: "Legal Counsel",
    slug: "legal-counsel",
    description: "Professional legal format with strong hierarchy and readability",
    category: "ats" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 21,
    layout: "single-column",
  },
  {
    name: "Healthcare Operations",
    slug: "healthcare-operations",
    description: "Calm, clean format for healthcare and operations professionals",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 22,
    layout: "single-column",
  },
  {
    name: "Public Sector",
    slug: "public-sector",
    description: "Balanced and formal resume for public and government careers",
    category: "ats" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 23,
    layout: "single-column",
  },
  {
    name: "Humanitarian Program",
    slug: "humanitarian-program",
    description: "Human-centered layout for NGOs, development, and program teams",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 24,
    layout: "sidebar",
  },
  {
    name: "Communications Director",
    slug: "communications-director",
    description: "Visual, editorial resume for communication and brand roles",
    category: "creative" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: true,
    sortOrder: 25,
    layout: "single-column",
  },
  {
    name: "Engineering Architecture",
    slug: "engineering-architecture",
    description: "Professional resume for engineering and technical leadership",
    category: "ats" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 26,
    layout: "sidebar",
  },
  {
    name: "Cloud Platform",
    slug: "cloud-platform",
    description: "Tech-forward format for cloud, infrastructure, and platform roles",
    category: "ats" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 27,
    layout: "single-column",
  },
  {
    name: "Venture Capital",
    slug: "venture-capital",
    description: "Confident format for investment, VC, and finance communication roles",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: true,
    sortOrder: 28,
    layout: "single-column",
  },
  {
    name: "Operations Precision",
    slug: "operations-precision",
    description: "Structured operational CV for process, logistics, and delivery roles",
    category: "ats" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 29,
    layout: "single-column",
  },
  {
    name: "Nonprofit Impact",
    slug: "nonprofit-impact",
    description: "Impact-focused design for nonprofit and social impact roles",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 30,
    layout: "single-column",
  },
  {
    name: "Recruiter Friendly",
    slug: "recruiter-friendly",
    description: "Clean, recruiter-optimized format for high-volume hiring pipelines",
    category: "ats" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 31,
    layout: "sidebar",
  },
  {
    name: "Sustainability Lead",
    slug: "sustainability-lead",
    description: "International-friendly resume for sustainability and ESG roles",
    category: "modern" as const,
    thumbnail: "/templates/fallback.svg",
    isPremium: false,
    sortOrder: 32,
    layout: "single-column",
  },
];

const plans = [
  {
    name: "Free",
    slug: "free",
    description: "Get started with basic resume building",
    priceMonthly: 0,
    priceYearly: 0,
    features: ["2 resumes", "Basic templates", "PDF export with watermark", "5 AI requests/month"],
    limits: {
      maxResumes: 2,
      maxAiRequests: 5,
      watermarkPdf: true,
      premiumTemplates: false,
      atsChecker: false,
      coverLetters: false,
      aiOptimization: false,
    },
    sortOrder: 1,
  },
  {
    name: "Premium",
    slug: "premium",
    description: "Unlimited resumes and full AI power",
    priceMonthly: 499,
    priceYearly: 4990,
    features: [
      "Unlimited resumes",
      "Premium templates",
      "No watermark PDF",
      "ATS checker",
      "AI cover letters",
      "AI optimization",
      "100 AI requests/month",
    ],
    limits: {
      maxResumes: -1,
      maxAiRequests: 100,
      watermarkPdf: false,
      premiumTemplates: true,
      atsChecker: true,
      coverLetters: true,
      aiOptimization: true,
    },
    sortOrder: 2,
  },
];

async function seed() {
  await connectDatabase();

  await Template.deleteMany({});
  await SubscriptionPlan.deleteMany({});
  await Coupon.deleteMany({});

  await Template.insertMany(templates);
  await SubscriptionPlan.insertMany(plans);

  await Coupon.create({
    code: "CHAKRI20",
    description: "20% off Premium plan",
    discountType: "percentage",
    discountValue: 20,
    maxUses: 1000,
    validUntil: new Date("2027-12-31"),
    applicablePlans: ["premium"],
  });

  let admin = await User.findOne({ email: "admin@chakricv.com" });
  if (!admin) {
    admin = await User.create({
      name: "Admin",
      email: "admin@chakricv.com",
      password: "Admin@123456",
      role: "admin",
      isEmailVerified: true,
      referralCode: "CVADMIN001",
    });
    console.log("Admin created: admin@chakricv.com / Admin@123456");
  }

  const blogCount = await Blog.countDocuments();
  if (blogCount === 0) {
    await Blog.create({
      title: "How to Write an ATS-Friendly Resume in Bangladesh (2026 Guide)",
      slug: "ats-friendly-resume-bangladesh-2026",
      excerpt:
        "Learn how to optimize your resume for Bangladesh's top companies and international remote jobs using ATS best practices.",
      content: `<h2>Why ATS Matters in Bangladesh</h2><p>Most large employers in Bangladesh including BRAC, Grameenphone, and multinational companies use Applicant Tracking Systems...</p>`,
      author: admin._id,
      tags: ["ATS", "Resume Tips", "Bangladesh Jobs"],
      language: "en",
      isPublished: true,
      publishedAt: new Date(),
      metaTitle: "ATS Resume Guide Bangladesh 2026 | ChakriCV",
      metaDescription: "Complete guide to writing ATS-friendly resumes for Bangladesh job market",
    });
  }

  console.log("Seed completed successfully");
  await disconnectDatabase();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
