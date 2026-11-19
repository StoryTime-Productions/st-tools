/**
 * Drive credential spike: can a Google service account read the group's shared photo folder?
 *
 * Usage (never commit the key file; it stays outside the repo):
 *   DRIVE_SA_KEY_FILE=C:/path/to/key.json DRIVE_FOLDER_ID=<folder id> pnpm tsx scripts/drive-spike.ts
 *
 * Read-only. Prints names, counts, status codes and timings; never the key or the access token.
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
}

const keyFile = process.env.DRIVE_SA_KEY_FILE;
const folderId = process.env.DRIVE_FOLDER_ID;
if (!keyFile || !folderId) {
  console.error("Set DRIVE_SA_KEY_FILE (path to the service account JSON) and DRIVE_FOLDER_ID.");
  process.exit(1);
}

const key = JSON.parse(readFileSync(keyFile, "utf8")) as ServiceAccountKey;
const tokenUri = key.token_uri ?? "https://oauth2.googleapis.com/token";
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`Token request failed: ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function list(token: string, parent: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${parent}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, thumbnailLink)",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(
        `Drive list failed for ${parent}: ${response.status} ${await response.text()}`
      );
    }
    const page = (await response.json()) as { files: DriveFile[]; nextPageToken?: string };
    files.push(...page.files);
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

async function main() {
  console.log(`Service account: ${key.client_email}`);
  const started = Date.now();
  const token = await accessToken();
  console.log(`1. Token ok (${Date.now() - started} ms)`);

  const meta = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,driveId&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (meta.ok) {
    const info = (await meta.json()) as { name: string; mimeType: string; driveId?: string };
    console.log(
      `   Folder is visible to the service account: "${info.name}" (${info.mimeType}, ${info.driveId ? "shared drive" : "My Drive"})`
    );
  } else {
    console.log(
      `   Folder is NOT visible to the service account (${meta.status}): it is not shared with ${key.client_email}, or the ID is wrong.`
    );
  }

  const top = await list(token, folderId!);
  const folders = top.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
  const images = top.filter((f) => f.mimeType.startsWith("image/"));
  console.log(
    `2. Folder lists ${top.length} entries: ${folders.length} subfolders, ${images.length} images at the top`
  );

  for (const folder of folders.slice(0, 5)) {
    const inside = await list(token, folder.id);
    const pics = inside.filter((f) => f.mimeType.startsWith("image/"));
    console.log(`   - "${folder.name}": ${inside.length} entries, ${pics.length} images`);
  }

  const sample =
    images[0] ??
    (folders[0]
      ? (await list(token, folders[0].id)).find((f) => f.mimeType.startsWith("image/"))
      : undefined);
  if (!sample) {
    console.log("3. No image found to test thumbnails with.");
    return;
  }
  if (sample.thumbnailLink) {
    const bare = await fetch(sample.thumbnailLink);
    const authed = await fetch(sample.thumbnailLink, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(
      `3. Thumbnail link: without auth ${bare.status}, with auth ${authed.status} (links expire after a while)`
    );
  } else {
    console.log("3. The sample image has no thumbnailLink.");
  }
  const media = await fetch(
    `https://www.googleapis.com/drive/v3/files/${sample.id}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const bytes = media.ok ? (await media.arrayBuffer()).byteLength : 0;
  console.log(`4. Full image download: ${media.status}, ${bytes} bytes`);
  console.log(
    "Quota note: the Drive API default is about 12,000 requests per minute per project; this spike used a handful."
  );
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});
