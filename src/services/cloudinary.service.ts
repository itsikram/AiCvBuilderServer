import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import type { UploadApiOptions, UploadApiResponse } from "cloudinary";
import { config } from "../config/index.js";

let configured = false;

export const initCloudinary = (): void => {
  if (config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
    });
    configured = true;
  }
};

const uploadBufferToCloudinary = async (
  buffer: Buffer,
  folder: string,
  resourceType: "image" | "raw" | "video",
  options: UploadApiOptions = {}
): Promise<{ url: string; publicId: string } | null> => {
  if (!configured) return null;

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
  folder = "chakricv"
): Promise<{ url: string; publicId: string } | null> => {
  if (!configured) return null;
  const result = await cloudinary.uploader.upload(filePath, { folder, resource_type: "image" });
  return { url: result.secure_url, publicId: result.public_id };
};

export const uploadBuffer = async (
  buffer: Buffer,
  folder = "chakricv",
  resourceType: "image" | "raw" | "video" = "image",
  options: UploadApiOptions = {}
): Promise<{ url: string; publicId: string } | null> => {
  return uploadBufferToCloudinary(buffer, folder, resourceType, options);
};

export const deleteImage = async (publicId: string): Promise<void> => {
  if (!configured) return;
  await cloudinary.uploader.destroy(publicId);
};
