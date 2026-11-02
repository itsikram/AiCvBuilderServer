import axios from "axios";
import { integrations } from "./settings.service.js";
import { ApiError } from "../utils/ApiError.js";

const PDFTXT_API_URL = "https://pdftxt.dev";
const MIN_TEXT_LENGTH = 40;

export const SUPPORTED_CV_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

type CvMimeType = (typeof SUPPORTED_CV_MIME_TYPES)[number];

// Browsers often send a generic type for .docx (e.g. on Windows without Office), so the extension counts too
const GENERIC_MIME_TYPES = ["", "application/octet-stream", "binary/octet-stream", "application/zip", "application/x-zip-compressed"];
const EXTENSION_MIME_TYPES: Record<string, CvMimeType> = { pdf: SUPPORTED_CV_MIME_TYPES[0], docx: SUPPORTED_CV_MIME_TYPES[1] };

/** The CV type an upload claims to be: its MIME type, or its extension when the MIME type is generic. */
export const resolveCvMimeType = (mimeType: string, fileName: string): CvMimeType | null => {
  if ((SUPPORTED_CV_MIME_TYPES as readonly string[]).includes(mimeType)) return mimeType as CvMimeType;
  if (!GENERIC_MIME_TYPES.includes(mimeType)) return null;
  return EXTENSION_MIME_TYPES[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? null;
};

/** The type from the file's first bytes, so a mislabelled file is still read correctly. */
const sniffCvMimeType = (buffer: Buffer): CvMimeType | null => {
  if (buffer.subarray(0, 1024).includes("%PDF-")) return SUPPORTED_CV_MIME_TYPES[0];
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return SUPPORTED_CV_MIME_TYPES[1];
  return null;
};

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
const extractPdfRemotely = async (buffer: Buffer, fileName: string, apiKey: string): Promise<string> => {
  const formData = new FormData();
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  formData.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
  const response = await axios.post(`${PDFTXT_API_URL}/extract`, formData, {
    headers: { "X-API-Key": apiKey },
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
  const type = sniffCvMimeType(buffer) ?? resolveCvMimeType(mimeType, fileName);

  if (type === SUPPORTED_CV_MIME_TYPES[0]) {
    try {
      text = await extractPdfLocally(buffer);
    } catch (error) {
      console.warn("Local PDF extraction failed:", (error as Error).message);
    }
    const { apiKey } = await integrations.pdftxt();
    if (text.length < MIN_TEXT_LENGTH && apiKey) {
      try {
        text = await extractPdfRemotely(buffer, fileName, apiKey);
      } catch (error) {
        console.warn("pdftxt.dev extraction failed:", axios.isAxiosError(error) ? error.response?.status ?? error.code : (error as Error).message);
      }
    }
  } else if (type === SUPPORTED_CV_MIME_TYPES[1]) {
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
