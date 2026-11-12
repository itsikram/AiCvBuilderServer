import { ApiError } from "./ApiError.js";

/**
 * Admin -> Settings sends values base64-encoded (body.encoding === "base64") because web
 * application firewalls in front of the API drop requests whose body contains text such as
 * "-----BEGIN PRIVATE KEY-----" (a service account JSON key), so such a save never arrives.
 * Requests without an encoding are passed through unchanged.
 */
export const decodeSettingValues = (entries: Array<[string, unknown]>, encoding: unknown): Array<[string, unknown]> => {
  if (encoding === undefined || encoding === null || encoding === "") return entries;
  if (encoding !== "base64") throw new ApiError(400, "Unsupported setting value encoding");
  return entries.map(([key, raw]) => {
    if (typeof raw !== "string") return [key, raw];
    if (raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) {
      throw new ApiError(400, `Setting ${key} is not valid base64`);
    }
    return [key, Buffer.from(raw, "base64").toString("utf8")];
  });
};
