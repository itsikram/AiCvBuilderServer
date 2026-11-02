import PDFDocument from "pdfkit";

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
