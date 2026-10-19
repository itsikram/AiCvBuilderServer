import axios from "axios";
import { config } from "../config/index.js";
import { ApiError } from "../utils/ApiError.js";

const PDFTXT_API_URL = "https://pdftxt.dev";
const MIN_TEXT_LENGTH = 40;

export const SUPPORTED_CV_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const normalize = (text: string) =>
  text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Local PDF text extraction (pdf.js via unpdf); works offline and on shared hosting. */
const extractPdfLocally = async (buffer: Buffer): Promise<string> => {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return normalize(Array.isArray(text) ? text.join("\n") : text);
};

/** Optional remote extraction via pdftxt.dev (better for some complex layouts). */
const extractPdfRemotely = async (buffer: Buffer, fileName: string): Promise<string> => {
  const formData = new FormData();
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  formData.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
  const response = await axios.post(`${PDFTXT_API_URL}/extract`, formData, {
    headers: { "X-API-Key": config.pdftxt.apiKey },
    maxBodyLength: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  return normalize(String(response.data?.text ?? ""));
};

const extractDocx = async (buffer: Buffer): Promise<string> => {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return normalize(value);
};

/**
 * Extracts plain text from an uploaded CV (PDF or DOCX). PDFs are read locally
 * first; pdftxt.dev is used as a fallback only when PDFTXT_API_KEY is set.
 */
export const extractCvText = async (buffer: Buffer, fileName: string, mimeType: string): Promise<string> => {
  let text = "";

  if (mimeType === "application/pdf") {
    try {
      text = await extractPdfLocally(buffer);
    } catch (error) {
      console.warn("Local PDF extraction failed:", (error as Error).message);
    }
    if (text.length < MIN_TEXT_LENGTH && config.pdftxt.apiKey) {
      try {
        text = await extractPdfRemotely(buffer, fileName);
      } catch (error) {
        console.warn("pdftxt.dev extraction failed:", axios.isAxiosError(error) ? error.response?.status ?? error.code : (error as Error).message);
      }
    }
  } else if (mimeType === SUPPORTED_CV_MIME_TYPES[1]) {
    try {
      text = await extractDocx(buffer);
    } catch {
      throw new ApiError(422, "We couldn't read this Word file. Please save it as PDF and try again.");
    }
  } else {
    throw new ApiError(415, "Please upload a PDF or Word (.docx) file.");
  }

  if (text.length < MIN_TEXT_LENGTH) {
    throw new ApiError(
      422,
      "We couldn't find any text in this file. If it's a scanned image, please upload a text-based PDF or Word file."
    );
  }
  return text;
};
