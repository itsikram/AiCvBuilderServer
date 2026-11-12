import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSettingValues } from "./settingEncoding.js";

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

test("passes values through when no encoding is given", () => {
  const entries: Array<[string, unknown]> = [["SITE_NAME", "AI CV Builder BD"]];
  assert.deepEqual(decodeSettingValues(entries, undefined), entries);
});

test("decodes base64 values, including a private key and Bangla text", () => {
  const key = JSON.stringify({ type: "service_account", private_key: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n" });
  const decoded = decodeSettingValues(
    [
      ["SEARCH_CONSOLE_CREDENTIALS", b64(key)],
      ["SITE_TAGLINE", b64("বাংলা সিভি")],
      ["EMPTY", ""],
    ],
    "base64"
  );
  assert.deepEqual(decoded, [
    ["SEARCH_CONSOLE_CREDENTIALS", key],
    ["SITE_TAGLINE", "বাংলা সিভি"],
    ["EMPTY", ""],
  ]);
});

test("rejects unknown encodings and malformed base64", () => {
  assert.throws(() => decodeSettingValues([["A", "x"]], "hex"), /Unsupported/);
  assert.throws(() => decodeSettingValues([["A", "not base64!"]], "base64"), /not valid base64/);
});
