import { resolveTxt } from "node:dns/promises";
import { nanoid } from "nanoid";
import { normalizeHostname } from "@/lib/routing/hostname";

const DEFAULT_TXT_PREFIX = "_redirect";

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level](JSON.stringify({ timestamp, level, message, ...meta }));
}

export function createVerificationRecord(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const token = nanoid(32);
  const prefix = process.env.DNS_TXT_PREFIX ?? DEFAULT_TXT_PREFIX;

  const record = {
    verificationToken: token,
    dnsTxtName: `${prefix}.${normalized}`,
    dnsTxtValue: `redirect-platform-verification=${token}`,
  };

  log("info", "verification_record_created", { hostname: normalized, dnsTxtName: record.dnsTxtName });

  return record;
}

export async function hasVerificationTxtRecord(
  dnsTxtName: string,
  dnsTxtValue: string,
) {
  log("info", "dns_verification_check", { dnsTxtName, expectedValue: dnsTxtValue });

  try {
    const records = await resolveTxt(dnsTxtName);
    const found = records.some((chunks) => chunks.join("") === dnsTxtValue);

    log("info", "dns_verification_result", {
      dnsTxtName,
      found,
      recordCount: records.length,
    });

    return found;
  } catch (error) {
    const err = error as { code?: string; message?: string };

    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      log("info", "dns_no_records_found", { dnsTxtName, code: err.code });
      return false;
    }

    log("error", "dns_verification_failed", {
      dnsTxtName,
      code: err.code,
      message: err.message,
    });

    throw error;
  }
}
