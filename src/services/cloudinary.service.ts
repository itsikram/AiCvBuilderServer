import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import type { UploadApiOptions, UploadApiResponse } from "cloudinary";
import { integrations } from "./settings.service.js";

let applied = "";

/** Applies the Cloudinary credentials from Admin -> Settings (env fallback); false when unset. */
const ensureConfigured = async (): Promise<boolean> => {
  const { cloudName, apiKey, apiSecret } = await integrations.cloudinary();
  if (!cloudName || !apiKey || !apiSecret) return false;
  const signature = `${cloudName}|${apiKey}|${apiSecret}`;
  if (signature !== applied) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    applied = signature;
  }
  return true;
};

export const initCloudinary = (): void => {
  ensureConfigured().catch(() => undefined);
};

const uploadBufferToCloudinary = async (
  buffer: Buffer,
  folder: string,
  resourceType: "image" | "raw" | "video",
  options: UploadApiOptions = {}
): Promise<{ url: string; publicId: string } | null> => {
  if (!(await ensureConfigured())) return null;

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        ...options,
      },
      (error, uploadResult) => {
        if (error) {
          reject(error);
          return;
        }

        if (!uploadResult) {
          reject(new Error("Cloudinary upload failed"));
          return;
        }

        resolve(uploadResult);
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });

  return { url: result.secure_url, publicId: result.public_id };
};

export const uploadImage = async (
  filePath: string,
  folder = "aicvbuilderbd"
): Promise<{ url: string; publicId: string } | null> => {
  if (!(await ensureConfigured())) return null;
  const result = await cloudinary.uploader.upload(filePath, { folder, resource_type: "image" });
  return { url: result.secure_url, publicId: result.public_id };
};

export const uploadBuffer = async (
  buffer: Buffer,
  folder = "aicvbuilderbd",
  resourceType: "image" | "raw" | "video" = "image",
  options: UploadApiOptions = {}
): Promise<{ url: string; publicId: string } | null> => {
  return uploadBufferToCloudinary(buffer, folder, resourceType, options);
};

export const deleteImage = async (publicId: string): Promise<void> => {
  if (!(await ensureConfigured())) return;
  await cloudinary.uploader.destroy(publicId);
};
