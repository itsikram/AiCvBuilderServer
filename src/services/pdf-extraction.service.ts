import axios from "axios";
import { config } from "../config/index.js";
import { ApiError } from "../utils/ApiError.js";

const PDFTXT_API_URL = "https://pdftxt.dev";

/**
 * Extract text from PDF using the pdftxt.dev API.
 * @param pdfBuffer - PDF file buffer
 * @param fileName - Original filename
 * @returns Extracted text from PDF
 */
export const extractPdfText = async (pdfBuffer: Buffer, fileName: string): Promise<string> => {
  try {
    if (!config.pdftxt.apiKey) {
      throw new ApiError(500, "PDF extraction API key is not configured");
    }

    const formData = new FormData();
    const pdfBytes = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    formData.append("file", blob, fileName);

    const response = await axios.post(`${PDFTXT_API_URL}/extract`, formData, {
      headers: {
        "X-API-Key": config.pdftxt.apiKey,
      },
      maxBodyLength: 10 * 1024 * 1024,
      timeout: 30000,
    });

    const text = response.data?.text?.trim();

    if (!text) {
      throw new ApiError(502, "Failed to extract text from PDF: No text content returned");
    }

    return text;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED") {
        throw new ApiError(504, "PDF extraction timed out. The file may be too large.");
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new ApiError(502, "PDF extraction failed: invalid pdftxt.dev API key");
      }

      if (error.response?.status === 413) {
        throw new ApiError(413, "PDF file is too large. pdftxt.dev supports files up to 10MB.");
      }

      if (error.response?.status === 429) {
        throw new ApiError(429, "PDF extraction limit reached for this pdftxt.dev API key.");
      }

      if (error.response?.status) {
        throw new ApiError(
          502,
          `Failed to extract text from PDF: pdftxt.dev returned status ${error.response.status}`
        );
      }
    }

    throw new ApiError(502, `Failed to extract text from PDF "${fileName}": ${errorMessage}`);
  }
};
