export type StorageMode = "local" | "gcs";

export interface HostedUser {
  email: string;
  authenticated: boolean;
}

export interface HostingConfig {
  storageMode: StorageMode;
  hostedMode: boolean;
  workspaceName: string;
  backlogObjectPath: string | null;
  uploadsPrefix: string | null;
  uploadsPath: string | null;
  configObjectPath: string | null;
  bucketName: string | null;
  objectName: string | null;
  requireAuth: boolean;
  allowedEmailDomains: string[];
  allowedEmails: string[];
}

function parseCsv(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const storageMode = process.env.BACKLOG_STORAGE_MODE?.trim().toLowerCase() === "gcs" ? "gcs" : "local";
const bucketName = process.env.GCS_BACKLOG_BUCKET?.trim() || null;
const objectName = process.env.GCS_BACKLOG_OBJECT?.trim() || null;
const objectDirectory = objectName ? objectName.split("/").slice(0, -1).join("/") : "";
const uploadsPrefix = bucketName && objectName ? [objectDirectory, "uploaded-backlogs"].filter(Boolean).join("/") : null;
const configObjectName = bucketName && objectName ? [objectDirectory, ".hosted-workspace-config.json"].filter(Boolean).join("/") : null;

export const hostingConfig: HostingConfig = {
  storageMode,
  hostedMode: storageMode === "gcs",
  workspaceName: process.env.WORKSPACE_NAME?.trim() || "Hosted workspace",
  backlogObjectPath: bucketName && objectName ? `gs://${bucketName}/${objectName}` : null,
  uploadsPrefix,
  uploadsPath: bucketName && uploadsPrefix ? `gs://${bucketName}/${uploadsPrefix}` : null,
  configObjectPath: bucketName && configObjectName ? `gs://${bucketName}/${configObjectName}` : null,
  bucketName,
  objectName,
  requireAuth: process.env.HOSTED_AUTH_REQUIRED?.trim() !== "false",
  allowedEmailDomains: parseCsv(process.env.HOSTED_ALLOWED_EMAIL_DOMAINS),
  allowedEmails: parseCsv(process.env.HOSTED_ALLOWED_EMAILS),
};

function normalizeEmail(value: string | undefined) {
  return String(value ?? "")
    .replace(/^accounts\.google\.com:/, "")
    .replace(/^https?:\/\/accounts\.google\.com:/, "")
    .trim()
    .toLowerCase();
}

export function extractHostedUser(headers: Record<string, string | string[] | undefined>): HostedUser | null {
  const headerValue = [
    headers["x-goog-authenticated-user-email"],
    headers["x-forwarded-email"],
    headers["x-auth-request-email"],
  ].find(Boolean);

  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const email = normalizeEmail(raw);
  if (!email) return null;
  return {
    email,
    authenticated: true,
  };
}

export function isHostedUserAllowed(user: HostedUser | null) {
  if (!hostingConfig.hostedMode || !hostingConfig.requireAuth) return true;
  if (!user?.email) return false;
  if (hostingConfig.allowedEmails.length > 0 && hostingConfig.allowedEmails.includes(user.email)) return true;
  if (hostingConfig.allowedEmailDomains.length > 0) {
    const domain = user.email.split("@")[1] ?? "";
    return hostingConfig.allowedEmailDomains.includes(domain);
  }
  return true;
}
