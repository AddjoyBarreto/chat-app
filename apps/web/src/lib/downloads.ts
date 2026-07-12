import { existsSync } from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";

export type DownloadPlatform = {
  filename: string;
  label: string;
  available: boolean;
  href: string;
  present: boolean;
};

export type DownloadsManifest = {
  version: string;
  updatedAt: string;
  note: string;
  mac: DownloadPlatform;
  windows: DownloadPlatform;
};

type RawManifest = {
  version: string;
  updatedAt: string;
  note: string;
  mac: { filename: string; label: string; available: boolean };
  windows: { filename: string; label: string; available: boolean };
};

function downloadsDir() {
  return path.join(process.cwd(), "public", "downloads");
}

export async function getDownloadsManifest(): Promise<DownloadsManifest> {
  const dir = downloadsDir();
  const raw = JSON.parse(
    await readFile(path.join(dir, "manifest.json"), "utf8")
  ) as RawManifest;

  function resolve(entry: RawManifest["mac"]): DownloadPlatform {
    const present = existsSync(path.join(dir, entry.filename));
    return {
      ...entry,
      href: `/downloads/${entry.filename}`,
      present,
      available: entry.available && present,
    };
  }

  return {
    version: raw.version,
    updatedAt: raw.updatedAt,
    note: raw.note,
    mac: resolve(raw.mac),
    windows: resolve(raw.windows),
  };
}
