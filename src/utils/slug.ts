import slugify from "slugify";
import { v4 as uuidv4 } from "uuid";

export const generateUniqueSlug = (title: string): string => {
  const base = slugify(title, { lower: true, strict: true }) || "resume";
  return `${base}-${uuidv4().slice(0, 8)}`;
};
