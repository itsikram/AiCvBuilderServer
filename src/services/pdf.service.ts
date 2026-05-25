import PDFDocument from "pdfkit";
import { IResumeContent } from "../models/Resume.js";

export const generateResumePDF = (
  content: IResumeContent,
  options: { watermark?: boolean; format?: string; templateId?: string } = {}
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { personalInfo, experience, education, skills, projects } = content;

    doc.fontSize(22).font("Helvetica-Bold").text(personalInfo.fullName, { align: "center" });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(
        [personalInfo.email, personalInfo.phone, personalInfo.location]
          .filter(Boolean)
          .join("  |  "),
        { align: "center" }
      );

    if (personalInfo.linkedin || personalInfo.portfolio) {
      doc.text(
        [personalInfo.linkedin, personalInfo.portfolio].filter(Boolean).join("  |  "),
        { align: "center" }
      );
    }

    doc.moveDown();

    if (personalInfo.summary) {
      doc.fontSize(12).font("Helvetica-Bold").text("PROFESSIONAL SUMMARY");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").text(personalInfo.summary);
      doc.moveDown();
    }

    if (experience.length) {
      doc.fontSize(12).font("Helvetica-Bold").text("EXPERIENCE");
      doc.moveDown(0.3);
      experience.forEach((exp) => {
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .text(`${exp.position} — ${exp.company}`);
        doc
          .fontSize(9)
          .font("Helvetica")
          .text(
            `${exp.startDate} - ${exp.current ? "Present" : exp.endDate || ""}${exp.location ? `  |  ${exp.location}` : ""}`
          );
        exp.bullets.forEach((bullet) => {
          doc.fontSize(10).text(`• ${bullet}`, { indent: 15 });
        });
        doc.moveDown(0.5);
      });
    }

    if (education.length) {
      doc.fontSize(12).font("Helvetica-Bold").text("EDUCATION");
      doc.moveDown(0.3);
      education.forEach((edu) => {
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .text(`${edu.degree}${edu.field ? ` in ${edu.field}` : ""}`);
        doc
          .fontSize(10)
          .font("Helvetica")
          .text(`${edu.institution}  |  ${edu.startDate} - ${edu.endDate || ""}`);
        doc.moveDown(0.3);
      });
    }

    if (skills.length) {
      doc.fontSize(12).font("Helvetica-Bold").text("SKILLS");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").text(skills.join("  •  "));
      doc.moveDown();
    }

    if (projects.length) {
      doc.fontSize(12).font("Helvetica-Bold").text("PROJECTS");
      doc.moveDown(0.3);
      projects.forEach((proj) => {
        doc.fontSize(11).font("Helvetica-Bold").text(proj.name);
        doc.fontSize(10).font("Helvetica").text(proj.description);
        if (proj.technologies.length) {
          doc.fontSize(9).text(`Tech: ${proj.technologies.join(", ")}`);
        }
        doc.moveDown(0.3);
      });
    }

    if (options.watermark) {
      doc.save();
      doc.rotate(-45, { origin: [300, 400] });
      doc
        .fontSize(60)
        .fillColor("#cccccc", 0.3)
        .text("ChakriCV Free", 100, 400, { align: "center" });
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
