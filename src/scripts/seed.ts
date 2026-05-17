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
    thumbnail: "/templates/modern-ats.png",
    isPremium: false,
    sortOrder: 1,
    layout: "single-column",
  },
  {
    name: "Professional BD",
    slug: "professional-bd",
    description: "Bangladeshi corporate CV format",
    category: "bangladeshi" as const,
    thumbnail: "/templates/professional-bd.png",
    isPremium: false,
    sortOrder: 2,
    layout: "two-column",
  },
  {
    name: "Executive Pro",
    slug: "executive-pro",
    description: "Premium executive resume template",
    category: "modern" as const,
    thumbnail: "/templates/executive-pro.png",
    isPremium: true,
    sortOrder: 3,
    layout: "single-column",
  },
  {
    name: "Creative Portfolio",
    slug: "creative-portfolio",
    description: "For designers and creative professionals",
    category: "creative" as const,
    thumbnail: "/templates/creative.png",
    isPremium: true,
    sortOrder: 4,
    layout: "sidebar",
  },
  {
    name: "International Standard",
    slug: "international",
    description: "Global standard resume for remote jobs",
    category: "ats" as const,
    thumbnail: "/templates/international.png",
    isPremium: false,
    sortOrder: 5,
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
