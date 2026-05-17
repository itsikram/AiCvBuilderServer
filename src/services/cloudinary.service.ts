import { v2 as cloudinary } from "cloudinary";
import { config } from "../config/index.js";

let configured = false;

export const initCloudinary = (): void => {
  if (config.cloudinary.cloudName && config.cloudinary.apiKey) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
    });
    configured = true;
  }
};

export const uploadImage = async (
  filePath: string,
  folder = "chakricv"
): Promise<{ url: string; publicId: string } | null> => {
  if (!configured) return null;
  const result = await cloudinary.uploader.upload(filePath, { folder });
  return { url: result.secure_url, publicId: result.public_id };
};

export const deleteImage = async (publicId: string): Promise<void> => {
  if (!configured) return;
  await cloudinary.uploader.destroy(publicId);
};
