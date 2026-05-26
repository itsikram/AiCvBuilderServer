import PDFDocument from "pdfkit";
import { IResumeContent } from "../models/Resume.js";
import axios from "axios";

type PdfLayout = "classic" | "sidebar" | "compact" | "bold";

type PdfTemplateStyle = {
  layout: PdfLayout;
  accentColor: string;
  headingColor: string;
  textColor: string;
  backgroundColor: string;
  headerAlign: "left" | "center";
  headerBackground?: string;
  headerTextColor?: string;
};

const defaultTheme = {
  accentColor: "#2563eb",
  headingColor: "#111827",
  textColor: "#111827",
  backgroundColor: "#ffffff",
};

const pdfTemplateStyles: Record<string, PdfTemplateStyle> = {
  "modern-ats": {
    layout: "classic",
    accentColor: "#2563eb",
    headingColor: "#1e3a8a",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "center",
  },
  "professional-bd": {
    layout: "classic",
    accentColor: "#047857",
    headingColor: "#065f46",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "executive-pro": {
    layout: "compact",
    accentColor: "#27272a",
    headingColor: "#18181b",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "creative-portfolio": {
    layout: "sidebar",
    accentColor: "#be123c",
    headingColor: "#9f1239",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  international: {
    layout: "classic",
    accentColor: "#4338ca",
    headingColor: "#3730a3",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "center",
  },
  "minimalist-clean": {
    layout: "compact",
    accentColor: "#374151",
    headingColor: "#111827",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "tech-professional": {
    layout: "sidebar",
    accentColor: "#155e75",
    headingColor: "#0f172a",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "bd-government": {
    layout: "classic",
    accentColor: "#15803d",
    headingColor: "#166534",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "center",
  },
  "bold-modern": {
    layout: "bold",
    accentColor: "#6d28d9",
    headingColor: "#4c1d95",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
    headerBackground: "#1f133e",
    headerTextColor: "#ffffff",
  },
  "academic-cv": {
    layout: "classic",
    accentColor: "#57534e",
    headingColor: "#292524",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "startup-ready": {
    layout: "sidebar",
    accentColor: "#0369a1",
    headingColor: "#0c4a6e",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "classic-professional": {
    layout: "classic",
    accentColor: "#334155",
    headingColor: "#0f172a",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "center",
  },
  "global-corporate": {
    layout: "classic",
    accentColor: "#334155",
    headingColor: "#0f172a",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "finance-forward": {
    layout: "compact",
    accentColor: "#1d4ed8",
    headingColor: "#1e3a8a",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "consulting-elite": {
    layout: "classic",
    accentColor: "#4338ca",
    headingColor: "#312e81",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "product-strategy": {
    layout: "sidebar",
    accentColor: "#0f766e",
    headingColor: "#115e59",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "data-analytics": {
    layout: "sidebar",
    accentColor: "#0891b2",
    headingColor: "#155e75",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "sales-growth": {
    layout: "bold",
    accentColor: "#b45309",
    headingColor: "#78350f",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
    headerBackground: "#78350f",
    headerTextColor: "#ffffff",
  },
  "customer-success": {
    layout: "classic",
    accentColor: "#047857",
    headingColor: "#065f46",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "remote-global": {
    layout: "compact",
    accentColor: "#7c3aed",
    headingColor: "#5b21b6",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "legal-counsel": {
    layout: "classic",
    accentColor: "#3f3f46",
    headingColor: "#18181b",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "center",
  },
  "healthcare-operations": {
    layout: "classic",
    accentColor: "#0f766e",
    headingColor: "#115e59",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "public-sector": {
    layout: "compact",
    accentColor: "#15803d",
    headingColor: "#14532d",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "humanitarian-program": {
    layout: "sidebar",
    accentColor: "#e11d48",
    headingColor: "#be123c",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "communications-director": {
    layout: "bold",
    accentColor: "#db2777",
    headingColor: "#9d174d",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
    headerBackground: "#831843",
    headerTextColor: "#ffffff",
  },
  "engineering-architecture": {
    layout: "sidebar",
    accentColor: "#0369a1",
    headingColor: "#075985",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "cloud-platform": {
    layout: "classic",
    accentColor: "#1d4ed8",
    headingColor: "#1e3a8a",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "venture-capital": {
    layout: "bold",
    accentColor: "#b45309",
    headingColor: "#78350f",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
    headerBackground: "#92400e",
    headerTextColor: "#ffffff",
  },
  "operations-precision": {
    layout: "compact",
    accentColor: "#4b5563",
    headingColor: "#111827",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "nonprofit-impact": {
    layout: "classic",
    accentColor: "#047857",
    headingColor: "#064e3b",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "recruiter-friendly": {
    layout: "sidebar",
    accentColor: "#ea580c",
    headingColor: "#9a3412",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
  "sustainability-lead": {
    layout: "classic",
    accentColor: "#65a30d",
    headingColor: "#365314",
    textColor: "#111827",
    backgroundColor: "#ffffff",
    headerAlign: "left",
  },
};

const formatList = (items: string[]) => items.filter(Boolean).join(" • ");

const hexToRgb = (hex: string) => {
  const cleaned = hex.replace("#", "");
  const normalized = cleaned.length === 3
    ? cleaned.split("").map((char) => char + char).join("")
    : cleaned;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const getTemplateStyle = (templateId: string | undefined, theme?: Record<string, string>) => {
  const preset = pdfTemplateStyles[templateId || "modern-ats"] || pdfTemplateStyles["modern-ats"];
  return {
    ...defaultTheme,
    ...preset,
    ...(theme || {}),
  };
};

const drawSectionTitle = (doc: InstanceType<typeof PDFDocument>, title: string, color: string) => {
  doc.fillColor(color);
  doc.fontSize(12).font("Helvetica-Bold").text(title);
  doc.moveDown(0.2);
};

const drawDateRange = (startDate: string, endDate: string | undefined, current: boolean) => {
  return `${startDate} - ${current ? "Present" : endDate || ""}`;
};

const drawProfilePhoto = async (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle): Promise<{ photoDrawn: boolean; photoHeight: number }> => {
  const { personalInfo } = content;
  if (!personalInfo.profilePhoto) {
    return { photoDrawn: false, photoHeight: 0 };
  }

  try {
    let photoSize = 80; // medium size
    if (personalInfo.profilePhotoSize === "large") photoSize = 100;
    if (personalInfo.profilePhotoSize === "small") photoSize = 60;

    let imageData: Buffer | null = null;
    
    // Handle base64 data URL
    if (personalInfo.profilePhoto.startsWith('data:')) {
      const matches = personalInfo.profilePhoto.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches && matches[2]) {
        imageData = Buffer.from(matches[2], 'base64');
      }
    } else {
      // Handle URL
      try {
        const response = await axios.get(personalInfo.profilePhoto, { 
          responseType: 'arraybuffer',
          timeout: 5000
        });
        imageData = Buffer.from(response.data);
      } catch (error) {
        console.error('Failed to fetch profile photo:', error);
        return { photoDrawn: false, photoHeight: 0 };
      }
    }

    if (!imageData) {
      return { photoDrawn: false, photoHeight: 0 };
    }

    // Calculate position based on alignment
    let photoX = doc.page.width / 2 - photoSize / 2; // center
    if (personalInfo.profilePhotoAlignment === "left") {
      photoX = 50;
    } else if (personalInfo.profilePhotoAlignment === "right") {
      photoX = doc.page.width - 50 - photoSize;
    }

    const photoY = 50;

    // Draw circular photo (using clip path)
    doc.save();
    doc.roundedRect(photoX, photoY, photoSize, photoSize, photoSize / 2);
    doc.clip();
    doc.image(imageData, photoX, photoY, { width: photoSize, height: photoSize });
    doc.restore();

    // Add border
    doc.lineWidth(2);
    doc.strokeColor(style.accentColor);
    doc.roundedRect(photoX, photoY, photoSize, photoSize, photoSize / 2);
    doc.stroke();

    return { photoDrawn: true, photoHeight: photoSize + 20 };
  } catch (error) {
    console.error('Error drawing profile photo:', error);
    return { photoDrawn: false, photoHeight: 0 };
  }
};

const drawHeader = async (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  const { personalInfo } = content;
  const fullName = personalInfo.fullName || "Your Name";
  const contactLine = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join("  |  ");
  const links = [personalInfo.linkedin, personalInfo.portfolio, personalInfo.github, personalInfo.website].filter(Boolean).join("  |  ");

  // Draw profile photo first if exists
  const photoResult = await drawProfilePhoto(doc, content, style);
  
  // Adjust starting Y position if photo was drawn
  if (photoResult.photoDrawn) {
    doc.moveDown(photoResult.photoHeight / 12);
  }

  if (style.layout === "bold") {
    const headerStartY = photoResult.photoDrawn ? doc.y : 50;
    doc.fillColor(style.headerBackground || style.accentColor);
    doc.rect(40, headerStartY, 520, 100).fill();
    doc.fillColor(style.headerTextColor || "#ffffff");
    doc.fontSize(24).font("Helvetica-Bold").text(fullName, 55, headerStartY + 15, { width: 490 });
    doc.fontSize(10).font("Helvetica").text(contactLine, 55, headerStartY + 50, { width: 490 });
    if (links) {
      doc.text(links, 55, headerStartY + 70, { width: 490 });
    }
    doc.y = headerStartY + 110;
    doc.moveDown(0.5);
    return;
  }

  doc.fillColor(style.headingColor);
  doc.fontSize(24).font("Helvetica-Bold").text(fullName, { align: style.headerAlign });
  doc.moveDown(0.2);
  doc.fillColor(style.textColor);
  doc.fontSize(10).font("Helvetica").text(contactLine, { align: style.headerAlign });
  if (links) {
    doc.text(links, { align: style.headerAlign });
  }
  doc.moveDown(0.5);

  if (style.headerAlign === "left") {
    doc.strokeColor(style.accentColor).lineWidth(1).moveTo(50, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.5);
  }
};

const renderSummary = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.personalInfo.summary) {
    return;
  }

  drawSectionTitle(doc, "PROFESSIONAL SUMMARY", style.accentColor);
  doc.fillColor(style.textColor);
  doc.fontSize(10).font("Helvetica").text(content.personalInfo.summary, { width: 500 });
  doc.moveDown(0.5);
};

const renderExperience = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.experience.length) {
    return;
  }

  drawSectionTitle(doc, "EXPERIENCE", style.accentColor);
  content.experience.forEach((exp) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(`${exp.position} — ${exp.company}`);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(drawDateRange(exp.startDate, exp.endDate, exp.current));
    if (exp.location) {
      doc.text(exp.location);
    }
    exp.bullets.filter(Boolean).forEach((bullet) => {
      doc.fontSize(10).text(`• ${bullet}`, { indent: 15 });
    });
    doc.moveDown(0.4);
  });
};

const renderEducation = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.education.length) {
    return;
  }

  drawSectionTitle(doc, "EDUCATION", style.accentColor);
  content.education.forEach((edu) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(`${edu.degree}${edu.field ? ` in ${edu.field}` : ""}`);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${edu.institution} | ${edu.startDate} - ${edu.endDate || ""}`);
    if (edu.gpa) {
      doc.text(`GPA: ${edu.gpa}`);
    }
    doc.moveDown(0.3);
  });
};

const renderSkills = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.skills.length) {
    return;
  }

  drawSectionTitle(doc, "SKILLS", style.accentColor);
  doc.fillColor(style.textColor);
  doc.fontSize(10).font("Helvetica").text(formatList(content.skills));
  doc.moveDown(0.5);
};

const renderProjects = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.projects.length) {
    return;
  }

  drawSectionTitle(doc, "PROJECTS", style.accentColor);
  content.projects.forEach((project) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(project.name);
    doc.fillColor(style.textColor);
    doc.fontSize(10).font("Helvetica").text(project.description);
    if (project.technologies.length) {
      doc.text(`Technologies: ${project.technologies.join(", ")}`);
    }
    doc.moveDown(0.3);
  });
};

const renderLanguages = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.languages.length) {
    return;
  }

  drawSectionTitle(doc, "LANGUAGES", style.accentColor);
  doc.fillColor(style.textColor);
  doc.fontSize(10).font("Helvetica").text(
    content.languages.map((lang) => `${lang.name} (${lang.proficiency})`).join(" • ")
  );
  doc.moveDown(0.5);
};

const renderCertifications = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.certifications.length) {
    return;
  }

  drawSectionTitle(doc, "CERTIFICATIONS", style.accentColor);
  content.certifications.forEach((cert) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(cert.name);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${cert.issuer} | ${cert.date}`);
    doc.moveDown(0.3);
  });
};

const renderAwards = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.awards.length) {
    return;
  }

  drawSectionTitle(doc, "AWARDS", style.accentColor);
  content.awards.forEach((award) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(award.title);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${award.issuer} | ${award.date}`);
    if (award.description) {
      doc.text(award.description);
    }
    doc.moveDown(0.3);
  });
};

const renderPublications = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.publications.length) {
    return;
  }

  drawSectionTitle(doc, "PUBLICATIONS", style.accentColor);
  content.publications.forEach((publication) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(publication.title);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${publication.publisher} | ${publication.date}`);
    if (publication.description) {
      doc.text(publication.description);
    }
    doc.moveDown(0.3);
  });
};

const renderVolunteer = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.volunteerExperience.length) {
    return;
  }

  drawSectionTitle(doc, "VOLUNTEER EXPERIENCE", style.accentColor);
  content.volunteerExperience.forEach((volunteer) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(volunteer.role);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${volunteer.organization} | ${drawDateRange(volunteer.startDate, volunteer.endDate, volunteer.current)}`);
    if (volunteer.description) {
      doc.text(volunteer.description);
    }
    doc.moveDown(0.3);
  });
};

const renderReferences = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.references.length) {
    return;
  }

  drawSectionTitle(doc, "REFERENCES", style.accentColor);
  content.references.forEach((reference) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(reference.name);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${reference.position} at ${reference.company}`);
    if (reference.email || reference.phone) {
      doc.text([reference.email, reference.phone].filter(Boolean).join(" | "));
    }
    doc.moveDown(0.3);
  });
};

const renderInterests = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.interests.length) {
    return;
  }

  drawSectionTitle(doc, "INTERESTS", style.accentColor);
  doc.fillColor(style.textColor);
  doc.fontSize(10).font("Helvetica").text(formatList(content.interests));
  doc.moveDown(0.5);
};

const renderCourses = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.courses.length) {
    return;
  }

  drawSectionTitle(doc, "COURSES", style.accentColor);
  content.courses.forEach((course) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(course.name);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${course.provider} | ${course.date}`);
    doc.moveDown(0.3);
  });
};

const renderMemberships = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.memberships.length) {
    return;
  }

  drawSectionTitle(doc, "MEMBERSHIPS", style.accentColor);
  content.memberships.forEach((membership) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(membership.organization);
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${membership.role || "Member"}${membership.startDate ? ` | ${membership.startDate}` : ""}${membership.current ? " - Present" : membership.endDate ? ` - ${membership.endDate}` : ""}`);
    doc.moveDown(0.3);
  });
};

const renderCustomSections = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle) => {
  if (!content.customSections.length) {
    return;
  }

  content.customSections.forEach((section) => {
    drawSectionTitle(doc, section.title.toUpperCase(), style.accentColor);
    doc.fillColor(style.textColor);
    doc.fontSize(10).font("Helvetica").text(section.content, { width: 500 });
    doc.moveDown(0.5);
  });
};

export const generateResumePDF = async (
  content: IResumeContent,
  options: { watermark?: boolean; format?: string; templateId?: string; theme?: Record<string, string> } = {}
): Promise<Buffer> => {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const style = getTemplateStyle(options.templateId, options.theme);
    const pageWidth = doc.page.width - 100;

    doc.fillColor(style.backgroundColor);
    doc.rect(0, 0, doc.page.width, doc.page.height).fill();

    // Draw header with profile photo (async)
    await drawHeader(doc, content, style);

    if (style.layout === "sidebar") {
      renderSkills(doc, content, style);
      renderLanguages(doc, content, style);
      renderCertifications(doc, content, style);
      doc.moveDown(0.5);
    }

    renderSummary(doc, content, style);
    renderExperience(doc, content, style);
    renderEducation(doc, content, style);
    renderProjects(doc, content, style);

    if (style.layout !== "sidebar") {
      renderSkills(doc, content, style);
      renderLanguages(doc, content, style);
      renderCertifications(doc, content, style);
    }

    renderAwards(doc, content, style);
    renderPublications(doc, content, style);
    renderVolunteer(doc, content, style);
    renderReferences(doc, content, style);
    renderInterests(doc, content, style);
    renderCourses(doc, content, style);
    renderMemberships(doc, content, style);
    renderCustomSections(doc, content, style);

    if (options.watermark) {
      doc.save();
      doc.rotate(-45, { origin: [300, 400] });
      doc.fontSize(60).fillColor("#cccccc", 0.3).text("ChakriCV Free", 100, 400, { align: "center" });
      doc.restore();
    }

    doc.end();
  });
};

export const generateCoverLetterPDF = (
  content: string,
  meta: { name: string; company: string; jobTitle: string }
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(12).font("Helvetica").text(new Date().toLocaleDateString("en-BD"));
    doc.moveDown(2);
    doc.text(`Hiring Manager`);
    doc.text(meta.company);
    doc.moveDown(2);
    doc.text(`Re: Application for ${meta.jobTitle}`);
    doc.moveDown();
    doc.text(content, { align: "justify", lineGap: 4 });
    doc.moveDown(2);
    doc.text("Sincerely,");
    doc.text(meta.name);

    doc.end();
  });
};
