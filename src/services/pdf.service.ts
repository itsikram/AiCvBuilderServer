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
  fontFamily?: string;
  headerBackground?: string;
  headerTextColor?: string;
};

const defaultTheme = {
  accentColor: "#2563eb",
  headingColor: "#111827",
  textColor: "#111827",
  backgroundColor: "#ffffff",
  fontFamily: "Inter, ui-sans-serif, system-ui",
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

const drawSectionTitle = (doc: InstanceType<typeof PDFDocument>, title: string, color: string, pageWidth: number) => {
  const y = doc.y;
  
  // Draw accent line above title
  doc.fillColor(color);
  doc.rect(50, y - 2, pageWidth, 2).fill();
  
  // Draw title
  doc.fillColor(color);
  doc.fontSize(12).font("Helvetica-Bold").text(title, 50, y + 5, { width: pageWidth });
  
  // Move down past the title
  doc.y = y + 25;
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

const renderSummary = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.personalInfo.summary) {
    return;
  }

  drawSectionTitle(doc, "PROFESSIONAL SUMMARY", style.accentColor, pageWidth);
  doc.fillColor(style.textColor);
  doc.fontSize(10).font("Helvetica").text(content.personalInfo.summary, 50, doc.y, { width: pageWidth, lineGap: 2 });
  doc.moveDown(1);
};

const renderExperience = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.experience.length) {
    return;
  }

  drawSectionTitle(doc, "EXPERIENCE", style.accentColor, pageWidth);
  content.experience.forEach((exp, idx) => {
    // Job header with position and company on one line, date on the right
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(exp.position, 50, doc.y, { width: pageWidth * 0.6 });
    
    // Company name below position
    doc.fillColor(style.textColor);
    doc.fontSize(10).font("Helvetica").text(exp.company, 50, doc.y);
    
    // Date range on the right
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(drawDateRange(exp.startDate, exp.endDate, exp.current), 
      50 + pageWidth * 0.6, doc.y - 15, { width: pageWidth * 0.4, align: 'right' });
    
    if (exp.location) {
      doc.fontSize(9).font("Helvetica").text(exp.location, 50, doc.y);
    }
    
    // Bullet points
    doc.moveDown(0.3);
    exp.bullets.filter(Boolean).forEach((bullet) => {
      doc.fontSize(10).font("Helvetica").text(`• ${bullet}`, 50, doc.y, { width: pageWidth, lineGap: 1 });
      doc.moveDown(0.1);
    });
    
    // Add separator between experiences (except last)
    if (idx < content.experience.length - 1) {
      doc.moveDown(0.3);
      doc.fillColor('#e5e7eb');
      doc.rect(50, doc.y, pageWidth, 1).fill();
      doc.moveDown(0.5);
    }
  });
  doc.moveDown(0.5);
};

const renderEducation = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.education.length) {
    return;
  }

  drawSectionTitle(doc, "EDUCATION", style.accentColor, pageWidth);
  content.education.forEach((edu) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(`${edu.degree}${edu.field ? ` in ${edu.field}` : ""}`, 50, doc.y, { width: pageWidth * 0.6 });
    
    // Date on the right
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${edu.startDate} - ${edu.endDate || ""}`, 
      50 + pageWidth * 0.6, doc.y - 12, { width: pageWidth * 0.4, align: 'right' });
    
    doc.fillColor(style.textColor);
    doc.fontSize(10).font("Helvetica").text(`${edu.institution}${edu.gpa ? ` | GPA: ${edu.gpa}` : ""}`, 50, doc.y);
    doc.moveDown(0.5);
  });
};

const renderSkills = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.skills.length) {
    return;
  }

  drawSectionTitle(doc, "SKILLS", style.accentColor, pageWidth);
  doc.fillColor(style.textColor);
  
  // Render skills as individual items with better formatting
  const skills = content.skills.filter(Boolean);
  let x = 50;
  let y = doc.y;
  const maxWidth = pageWidth;
  
  doc.fontSize(10).font("Helvetica");
  skills.forEach((skill, idx) => {
    const text = idx === 0 ? skill.trim() : `• ${skill.trim()}`;
    const textWidth = doc.widthOfString(text);
    
    if (x + textWidth > 50 + maxWidth) {
      x = 50;
      y += 15;
    }
    
    doc.fillColor(idx === 0 ? style.textColor : style.accentColor);
    doc.text(text, x, y, { width: maxWidth, continued: false });
    x += textWidth + 5;
  });
  
  doc.y = y + 20;
};

const renderProjects = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.projects.length) {
    return;
  }

  drawSectionTitle(doc, "PROJECTS", style.accentColor, pageWidth);
  content.projects.forEach((project) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(project.name, 50, doc.y, { width: pageWidth });
    
    doc.fillColor(style.textColor);
    doc.fontSize(10).font("Helvetica").text(project.description, 50, doc.y, { width: pageWidth, lineGap: 1 });
    
    if (project.technologies.length) {
      doc.fontSize(9).font("Helvetica").text(`Technologies: ${project.technologies.join(", ")}`, 50, doc.y, { width: pageWidth });
    }
    doc.moveDown(0.5);
  });
};

const renderLanguages = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.languages.length) {
    return;
  }

  drawSectionTitle(doc, "LANGUAGES", style.accentColor, pageWidth);
  doc.fillColor(style.textColor);
  doc.fontSize(10).font("Helvetica").text(
    content.languages.map((lang) => `${lang.name} (${lang.proficiency})`).join("  •  "), 50, doc.y, { width: pageWidth }
  );
  doc.moveDown(1);
};

const renderCertifications = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.certifications.length) {
    return;
  }

  drawSectionTitle(doc, "CERTIFICATIONS", style.accentColor, pageWidth);
  content.certifications.forEach((cert) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(cert.name, 50, doc.y, { width: pageWidth * 0.6 });
    
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${cert.issuer} | ${cert.date}`, 
      50 + pageWidth * 0.6, doc.y - 12, { width: pageWidth * 0.4, align: 'right' });
    doc.moveDown(0.5);
  });
};

const renderAwards = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.awards.length) {
    return;
  }

  drawSectionTitle(doc, "AWARDS", style.accentColor, pageWidth);
  content.awards.forEach((award) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(award.title, 50, doc.y, { width: pageWidth * 0.6 });
    
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${award.issuer} | ${award.date}`, 
      50 + pageWidth * 0.6, doc.y - 12, { width: pageWidth * 0.4, align: 'right' });
    
    if (award.description) {
      doc.fillColor(style.textColor);
      doc.fontSize(10).font("Helvetica").text(award.description, 50, doc.y, { width: pageWidth });
    }
    doc.moveDown(0.5);
  });
};

const renderPublications = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.publications.length) {
    return;
  }

  drawSectionTitle(doc, "PUBLICATIONS", style.accentColor, pageWidth);
  content.publications.forEach((publication) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(publication.title, 50, doc.y, { width: pageWidth * 0.6 });
    
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${publication.publisher} | ${publication.date}`, 
      50 + pageWidth * 0.6, doc.y - 12, { width: pageWidth * 0.4, align: 'right' });
    
    if (publication.description) {
      doc.fillColor(style.textColor);
      doc.fontSize(10).font("Helvetica").text(publication.description, 50, doc.y, { width: pageWidth });
    }
    doc.moveDown(0.5);
  });
};

const renderVolunteer = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.volunteerExperience.length) {
    return;
  }

  drawSectionTitle(doc, "VOLUNTEER EXPERIENCE", style.accentColor, pageWidth);
  content.volunteerExperience.forEach((volunteer) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(volunteer.role, 50, doc.y, { width: pageWidth * 0.6 });
    
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${volunteer.organization} | ${drawDateRange(volunteer.startDate, volunteer.endDate, volunteer.current)}`, 
      50 + pageWidth * 0.6, doc.y - 12, { width: pageWidth * 0.4, align: 'right' });
    
    if (volunteer.description) {
      doc.fillColor(style.textColor);
      doc.fontSize(10).font("Helvetica").text(volunteer.description, 50, doc.y, { width: pageWidth });
    }
    doc.moveDown(0.5);
  });
};

const renderReferences = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.references.length) {
    return;
  }

  drawSectionTitle(doc, "REFERENCES", style.accentColor, pageWidth);
  content.references.forEach((reference) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(reference.name, 50, doc.y, { width: pageWidth });
    
    doc.fillColor(style.textColor);
    doc.fontSize(10).font("Helvetica").text(`${reference.position} at ${reference.company}`, 50, doc.y);
    
    if (reference.email || reference.phone) {
      doc.fontSize(9).font("Helvetica").text([reference.email, reference.phone].filter(Boolean).join(" | "), 50, doc.y);
    }
    doc.moveDown(0.5);
  });
};

const renderInterests = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.interests.length) {
    return;
  }

  drawSectionTitle(doc, "INTERESTS", style.accentColor, pageWidth);
  doc.fillColor(style.textColor);
  doc.fontSize(10).font("Helvetica").text(formatList(content.interests), 50, doc.y, { width: pageWidth });
  doc.moveDown(1);
};

const renderCourses = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.courses.length) {
    return;
  }

  drawSectionTitle(doc, "COURSES", style.accentColor, pageWidth);
  content.courses.forEach((course) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(course.name, 50, doc.y, { width: pageWidth * 0.6 });
    
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${course.provider} | ${course.date}`, 
      50 + pageWidth * 0.6, doc.y - 12, { width: pageWidth * 0.4, align: 'right' });
    doc.moveDown(0.5);
  });
};

const renderMemberships = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.memberships.length) {
    return;
  }

  drawSectionTitle(doc, "MEMBERSHIPS", style.accentColor, pageWidth);
  content.memberships.forEach((membership) => {
    doc.fillColor(style.headingColor);
    doc.fontSize(11).font("Helvetica-Bold").text(membership.organization, 50, doc.y, { width: pageWidth });
    
    doc.fillColor(style.textColor);
    doc.fontSize(9).font("Helvetica").text(`${membership.role || "Member"}${membership.startDate ? ` | ${membership.startDate}` : ""}${membership.current ? " - Present" : membership.endDate ? ` - ${membership.endDate}` : ""}`, 50, doc.y);
    doc.moveDown(0.5);
  });
};

const renderCustomSections = (doc: InstanceType<typeof PDFDocument>, content: IResumeContent, style: PdfTemplateStyle, pageWidth: number) => {
  if (!content.customSections.length) {
    return;
  }

  content.customSections.forEach((section) => {
    drawSectionTitle(doc, section.title.toUpperCase(), style.accentColor, pageWidth);
    doc.fillColor(style.textColor);
    doc.fontSize(10).font("Helvetica").text(section.content, 50, doc.y, { width: pageWidth, lineGap: 1 });
    doc.moveDown(1);
  });
};

const getFontFamily = (fontFamily?: string) => {
  const normalized = (fontFamily || "").toLowerCase();
  if (normalized.includes("times") || normalized.includes("georgia") || normalized.includes("garamond")) {
    return {
      regular: "Times-Roman",
      bold: "Times-Bold",
    };
  }

  return {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
  };
};

const setFont = (
  doc: InstanceType<typeof PDFDocument>,
  font: { regular: string; bold: string },
  size: number,
  weight: "regular" | "bold" = "regular"
) => {
  doc.fontSize(size).font(weight === "bold" ? font.bold : font.regular);
};

const A4_HEIGHT = 841.89; // A4 height in points
const A4_WIDTH = 595.28; // A4 width in points
const MARGIN = 45;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2; // ~505 points

const addPageBreakIfNeeded = (
  doc: InstanceType<typeof PDFDocument>,
  neededSpace: number,
  margin = MARGIN
) => {
  if (doc.y + neededSpace > doc.page.height - margin) {
    doc.addPage();
    doc.y = MARGIN;
  }
};

/**
 * Calculate the height needed for text content
 */
const calculateTextHeight = (
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  width: number,
  fontSize: number = 10,
  lineGap: number = 3
): number => {
  const lines = doc.heightOfString(text, { width, align: "left" });
  return lines;
};

/**
 * Ensure an entire section stays together on one page.
 * If the section doesn't fit on the current page, start a new page.
 */
const ensureSectionFits = (
  doc: InstanceType<typeof PDFDocument>,
  sectionHeight: number,
  margin = MARGIN
) => {
  if (doc.y + sectionHeight > doc.page.height - margin) {
    doc.addPage();
    doc.y = margin;
  }
};

const drawTextBlock = (
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  width: number,
  options?: {
    align?: "left" | "center" | "right";
    lineGap?: number;
    color?: string;
  }
) => {
  doc.fillColor(options?.color || "#111827");
  doc.text(text, 45, doc.y, {
    width,
    align: options?.align || "left",
    lineGap: options?.lineGap ?? 3,
  });
};

const drawSectionHeading = (
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  accentColor: string,
  font: { regular: string; bold: string },
  x = 45,
  width = 520
) => {
  addPageBreakIfNeeded(doc, 28);
  doc.fillColor(accentColor);
  doc.rect(x, doc.y, width, 2).fill();
  doc.fillColor(accentColor);
  setFont(doc, font, 11, "bold");
  doc.text(title.toUpperCase(), x, doc.y + 6, { width });
  doc.y += 22;
};

const drawSummary = (
  doc: InstanceType<typeof PDFDocument>,
  content: IResumeContent,
  font: { regular: string; bold: string },
  accentColor: string,
  width = 520
) => {
  if (!content.personalInfo.summary) {
    return;
  }

  drawSectionHeading(doc, "Professional Summary", accentColor, font);
  setFont(doc, font, 11);
  drawTextBlock(doc, content.personalInfo.summary, width, { lineGap: 4 });
  doc.moveDown(0.5);
};

/**
 * Calculate the height needed for an experience entry
 */
const calculateExperienceHeight = (
  doc: InstanceType<typeof PDFDocument>,
  exp: IResumeContent["experience"][0],
  width: number
): number => {
  let height = 0;
  
  // Position line
  height += doc.heightOfString(exp.position, { width: width * 0.68 }) + 2;
  
  // Company line
  height += doc.heightOfString(exp.company, { width: width * 0.68 }) + 2;
  
  // Location if exists
  if (exp.location) {
    height += 14;
  }
  
  // Bullet points
  exp.bullets.filter(Boolean).forEach((bullet) => {
    height += doc.heightOfString(`• ${bullet}`, { width: width - 20, lineGap: 3 }) + 2;
  });
  
  // Separator line (except last)
  height += 10;
  
  return height;
};

const drawExperience = (
  doc: InstanceType<typeof PDFDocument>,
  content: IResumeContent,
  font: { regular: string; bold: string },
  accentColor: string,
  width = 520
) => {
  if (!content.experience.length) {
    return;
  }

  drawSectionHeading(doc, "Experience", accentColor, font);

  content.experience.forEach((exp, index) => {
    // Calculate total height needed for this experience entry
    const expHeight = calculateExperienceHeight(doc, exp, width);
    
    // Ensure the entire experience entry fits on one page
    addPageBreakIfNeeded(doc, expHeight + 10);
    
    setFont(doc, font, 11, "bold");
    doc.fillColor("#111827");
    doc.text(exp.position, 45, doc.y, { width: width * 0.68 });

    const afterPositionY = doc.y;
    setFont(doc, font, 10);
    doc.fillColor("#374151");
    doc.text(exp.company, 45, doc.y + 14, { width: width * 0.68 });

    setFont(doc, font, 9);
    doc.text(drawDateRange(exp.startDate, exp.endDate, exp.current), 45 + width * 0.68, doc.y - 10, {
      width: width * 0.32,
      align: "right",
    });

    if (exp.location) {
      doc.text(exp.location, 45, doc.y + 14, { width: width * 0.68 });
    }

    doc.y += 20;
    setFont(doc, font, 10);
    exp.bullets.filter(Boolean).forEach((bullet) => {
      doc.text(`• ${bullet}`, 55, doc.y, { width: width - 20, lineGap: 3 });
      doc.moveDown(0.2);
    });

    if (index < content.experience.length - 1) {
      doc.fillColor("#e5e7eb");
      doc.rect(45, doc.y + 6, width, 1).fill();
      doc.y += 10;
    }
  });

  doc.moveDown(0.4);
};

const drawEducation = (
  doc: InstanceType<typeof PDFDocument>,
  content: IResumeContent,
  font: { regular: string; bold: string },
  accentColor: string,
  width = 520
) => {
  if (!content.education.length) {
    return;
  }

  drawSectionHeading(doc, "Education", accentColor, font);

  content.education.forEach((edu) => {
    addPageBreakIfNeeded(doc, 24);
    setFont(doc, font, 11, "bold");
    doc.fillColor("#111827");
    doc.text(`${edu.degree}${edu.field ? ` in ${edu.field}` : ""}`, 45, doc.y, { width: width * 0.68 });

    setFont(doc, font, 9);
    doc.text(`${edu.startDate} - ${edu.endDate || ""}`, 45 + width * 0.68, doc.y, {
      width: width * 0.32,
      align: "right",
    });

    setFont(doc, font, 10);
    doc.fillColor("#374151");
    doc.text(`${edu.institution}${edu.gpa ? ` | GPA: ${edu.gpa}` : ""}`, 45, doc.y + 14, { width });
    doc.y += 20;
  });
};

const drawProjects = (
  doc: InstanceType<typeof PDFDocument>,
  content: IResumeContent,
  font: { regular: string; bold: string },
  accentColor: string,
  width = 520
) => {
  if (!content.projects.length) {
    return;
  }

  drawSectionHeading(doc, "Projects", accentColor, font);

  content.projects.forEach((project) => {
    addPageBreakIfNeeded(doc, 24);
    setFont(doc, font, 11, "bold");
    doc.fillColor("#111827");
    doc.text(project.name, 45, doc.y, { width });

    setFont(doc, font, 10);
    doc.fillColor("#374151");
    doc.text(project.description, 45, doc.y + 14, { width, lineGap: 3 });
    doc.y += 12;

    if (project.technologies.length) {
      setFont(doc, font, 9);
      doc.text(`Technologies: ${project.technologies.join(", ")}`, 45, doc.y, { width });
      doc.y += 12;
    }
  });
};

const drawSidebarBlocks = (
  doc: InstanceType<typeof PDFDocument>,
  content: IResumeContent,
  font: { regular: string; bold: string },
  accentColor: string
) => {
  const width = 220;

  if (content.skills.length) {
    drawSectionHeading(doc, "Skills", accentColor, font, 45, width);
    setFont(doc, font, 10);
    doc.fillColor("#374151");
    doc.text(content.skills.filter(Boolean).join(" • "), 45, doc.y, { width, lineGap: 3 });
    doc.y += 18;
  }

  if (content.languages.length) {
    drawSectionHeading(doc, "Languages", accentColor, font, 45, width);
    setFont(doc, font, 10);
    doc.fillColor("#374151");
    doc.text(
      content.languages.map((language) => `${language.name} (${language.proficiency})`).join(" • "),
      45,
      doc.y,
      { width, lineGap: 3 }
    );
    doc.y += 18;
  }

  if (content.certifications.length) {
    drawSectionHeading(doc, "Certifications", accentColor, font, 45, width);
    setFont(doc, font, 10);
    content.certifications.forEach((cert) => {
      addPageBreakIfNeeded(doc, 18);
      setFont(doc, font, 10, "bold");
      doc.fillColor("#111827");
      doc.text(cert.name, 45, doc.y, { width });
      setFont(doc, font, 9);
      doc.fillColor("#374151");
      doc.text(`${cert.issuer} | ${cert.date}`, 45, doc.y + 14, { width });
      doc.y += 24;
    });
  }
};

const drawAdditionalSections = (
  doc: InstanceType<typeof PDFDocument>,
  content: IResumeContent,
  font: { regular: string; bold: string },
  accentColor: string,
  width = 520
) => {
  const sectionRenderers = [
    {
      condition: content.awards.length > 0,
      title: "Awards",
      render: () => {
        content.awards.forEach((award) => {
          addPageBreakIfNeeded(doc, 20);
          setFont(doc, font, 11, "bold");
          doc.fillColor("#111827");
          doc.text(award.title, 45, doc.y, { width: width * 0.68 });
          setFont(doc, font, 9);
          doc.fillColor("#374151");
          doc.text(`${award.issuer} | ${award.date}`, 45 + width * 0.68, doc.y, {
            width: width * 0.32,
            align: "right",
          });
          if (award.description) {
            setFont(doc, font, 10);
            doc.fillColor("#374151");
            doc.text(award.description, 45, doc.y + 14, { width, lineGap: 3 });
            doc.y += 12;
          }
          doc.y += 12;
        });
      },
    },
    {
      condition: content.publications.length > 0,
      title: "Publications",
      render: () => {
        content.publications.forEach((publication) => {
          addPageBreakIfNeeded(doc, 20);
          setFont(doc, font, 11, "bold");
          doc.fillColor("#111827");
          doc.text(publication.title, 45, doc.y, { width: width * 0.68 });
          setFont(doc, font, 9);
          doc.fillColor("#374151");
          doc.text(`${publication.publisher} | ${publication.date}`, 45 + width * 0.68, doc.y, {
            width: width * 0.32,
            align: "right",
          });
          if (publication.description) {
            setFont(doc, font, 10);
            doc.fillColor("#374151");
            doc.text(publication.description, 45, doc.y + 14, { width, lineGap: 3 });
            doc.y += 12;
          }
          doc.y += 12;
        });
      },
    },
    {
      condition: content.volunteerExperience.length > 0,
      title: "Volunteer Experience",
      render: () => {
        content.volunteerExperience.forEach((volunteer) => {
          addPageBreakIfNeeded(doc, 20);
          setFont(doc, font, 11, "bold");
          doc.fillColor("#111827");
          doc.text(volunteer.role, 45, doc.y, { width: width * 0.68 });
          setFont(doc, font, 9);
          doc.fillColor("#374151");
          doc.text(`${volunteer.organization} | ${drawDateRange(volunteer.startDate, volunteer.endDate, volunteer.current)}`, 45 + width * 0.68, doc.y, {
            width: width * 0.32,
            align: "right",
          });
          if (volunteer.description) {
            setFont(doc, font, 10);
            doc.fillColor("#374151");
            doc.text(volunteer.description, 45, doc.y + 14, { width, lineGap: 3 });
            doc.y += 12;
          }
          doc.y += 12;
        });
      },
    },
    {
      condition: content.references.length > 0,
      title: "References",
      render: () => {
        content.references.forEach((reference) => {
          addPageBreakIfNeeded(doc, 18);
          setFont(doc, font, 11, "bold");
          doc.fillColor("#111827");
          doc.text(reference.name, 45, doc.y, { width });
          setFont(doc, font, 10);
          doc.fillColor("#374151");
          doc.text(`${reference.position} at ${reference.company}`, 45, doc.y + 14, { width });
          if (reference.email || reference.phone) {
            setFont(doc, font, 9);
            doc.text([reference.email, reference.phone].filter(Boolean).join(" | "), 45, doc.y + 28, { width });
            doc.y += 8;
          }
          doc.y += 12;
        });
      },
    },
    {
      condition: content.interests.length > 0,
      title: "Interests",
      render: () => {
        setFont(doc, font, 10);
        doc.fillColor("#374151");
        doc.text(content.interests.filter(Boolean).join(" • "), 45, doc.y, { width, lineGap: 3 });
        doc.y += 12;
      },
    },
    {
      condition: content.courses.length > 0,
      title: "Courses",
      render: () => {
        content.courses.forEach((course) => {
          addPageBreakIfNeeded(doc, 18);
          setFont(doc, font, 11, "bold");
          doc.fillColor("#111827");
          doc.text(course.name, 45, doc.y, { width: width * 0.68 });
          setFont(doc, font, 9);
          doc.fillColor("#374151");
          doc.text(`${course.provider} | ${course.date}`, 45 + width * 0.68, doc.y, {
            width: width * 0.32,
            align: "right",
          });
          doc.y += 14;
        });
      },
    },
    {
      condition: content.memberships.length > 0,
      title: "Memberships",
      render: () => {
        content.memberships.forEach((membership) => {
          addPageBreakIfNeeded(doc, 18);
          setFont(doc, font, 11, "bold");
          doc.fillColor("#111827");
          doc.text(membership.organization, 45, doc.y, { width });
          setFont(doc, font, 9);
          doc.fillColor("#374151");
          doc.text(
            `${membership.role || "Member"}${membership.startDate ? ` | ${membership.startDate}` : ""}${membership.current ? " - Present" : membership.endDate ? ` - ${membership.endDate}` : ""}`,
            45,
            doc.y + 14,
            { width }
          );
          doc.y += 20;
        });
      },
    },
    {
      condition: content.customSections.length > 0,
      title: "Custom Sections",
      render: () => {
        content.customSections.forEach((section) => {
          addPageBreakIfNeeded(doc, 18);
          drawSectionHeading(doc, section.title, accentColor, font);
          setFont(doc, font, 10);
          doc.fillColor("#374151");
          doc.text(section.content, 45, doc.y, { width, lineGap: 3 });
          doc.y += 12;
        });
      },
    },
  ];

  sectionRenderers.forEach((section) => {
    if (!section.condition) {
      return;
    }

    drawSectionHeading(doc, section.title, accentColor, font);
    section.render();
    doc.moveDown(0.3);
  });
};

const drawPdfHeader = async (
  doc: InstanceType<typeof PDFDocument>,
  content: IResumeContent,
  style: PdfTemplateStyle,
  font: { regular: string; bold: string }
) => {
  const { personalInfo } = content;
  const photoResult = await drawProfilePhoto(doc, content, style);
  const topPadding = photoResult.photoDrawn ? 60 : 45;

  if (photoResult.photoDrawn) {
    doc.y = topPadding;
  } else {
    doc.y = 45;
  }

  if (style.layout === "bold") {
    doc.fillColor(style.headerBackground || style.accentColor);
    doc.rect(45, doc.y, 520, 100).fill();
    doc.fillColor(style.headerTextColor || "#ffffff");
    setFont(doc, font, 24, "bold");
    doc.text(personalInfo.fullName || "Your Name", 60, doc.y + 16, { width: 500 });
    setFont(doc, font, 10);
    doc.text([personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join("  |  "), 60, doc.y + 50, { width: 500 });
    const links = [personalInfo.linkedin, personalInfo.portfolio, personalInfo.github, personalInfo.website].filter(Boolean).join("  |  ");
    if (links) {
      doc.text(links, 60, doc.y + 70, { width: 500 });
    }
    doc.y = doc.y + 110;
    return;
  }

  setFont(doc, font, 24, "bold");
  doc.fillColor(style.headingColor);
  doc.text(personalInfo.fullName || "Your Name", 45, doc.y, { width: 520, align: style.headerAlign });
  doc.y += 16;
  setFont(doc, font, 10);
  doc.fillColor(style.textColor);
  doc.text([personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join("  |  "), 45, doc.y, { width: 520, align: style.headerAlign });

  const links = [personalInfo.linkedin, personalInfo.portfolio, personalInfo.github, personalInfo.website].filter(Boolean).join("  |  ");
  if (links) {
    doc.text(links, 45, doc.y + 14, { width: 520, align: style.headerAlign });
    doc.y += 12;
  } else {
    doc.y += 12;
  }

  if (style.headerAlign === "left") {
    doc.fillColor(style.accentColor);
    doc.rect(45, doc.y, 520, 1.5).fill();
    doc.y += 12;
  }
};

export const generateResumePDF = async (
  content: IResumeContent,
  options: { watermark?: boolean; format?: string; templateId?: string; theme?: Record<string, string> } = {}
): Promise<Buffer> => {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const style = getTemplateStyle(options.templateId, options.theme);
    const font = getFontFamily(style.fontFamily);
    const pageWidth = 520;

    doc.fillColor(style.backgroundColor);
    doc.rect(0, 0, doc.page.width, doc.page.height).fill();

    await drawPdfHeader(doc, content, style, font);
    drawSummary(doc, content, font, style.accentColor, pageWidth);
    drawExperience(doc, content, font, style.accentColor, pageWidth);
    drawEducation(doc, content, font, style.accentColor, pageWidth);

    if (style.layout === "sidebar") {
      drawSidebarBlocks(doc, content, font, style.accentColor);
    }

    drawProjects(doc, content, font, style.accentColor, pageWidth);

    if (style.layout !== "sidebar") {
      drawSidebarBlocks(doc, content, font, style.accentColor);
    }

    drawAdditionalSections(doc, content, font, style.accentColor, pageWidth);

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
