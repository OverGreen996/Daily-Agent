import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const digest = (data) => createHash("sha256").update(data).digest("hex");
export class AppearanceTransfer {
  constructor(dir) {
    this.dir = path.join(dir, "mobile-appearance");
    fs.mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, "current.json");
  }
  current() {
    return fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : { available: false };
  }
  publish({ name, animated, image }) {
    if (
      typeof image !== "string" ||
      image.length > 5600000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image)
    )
      throw Error("外觀圖片格式或大小錯誤。");
    const bytes = Buffer.from(image, "base64");
    if (
      bytes.length < 40 ||
      bytes.length > 4 * 1024 * 1024 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.subarray(12, 16).toString() !== "IHDR"
    )
      throw Error("手機外觀僅接受 PNG。");
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (
      !width ||
      !height ||
      width > 4096 ||
      height > 4096 ||
      width * height > 4194304
    )
      throw Error("外觀尺寸超過限制。");
    if (
      typeof animated !== "boolean" ||
      (animated && (width % 8 || height % 11 || width < 128 || height < 176))
    )
      throw Error("動畫須為 8 欄 × 11 列 v2 精靈圖。");
    const sha256 = digest(bytes),
      label = String(name || "桌寵")
        .replace(/[\x00-\x1f]/g, " ")
        .slice(0, 64);
    const meta = {
      available: true,
      name: label,
      animated,
      width,
      height,
      size: bytes.length,
      sha256,
      version: digest(sha256 + label + animated),
      updated_at: new Date().toISOString(),
    };
    const target = path.join(this.dir, sha256 + ".png");
    fs.writeFileSync(target + ".tmp", bytes);
    fs.renameSync(target + ".tmp", target);
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(meta));
    fs.renameSync(this.file + ".tmp", this.file);
    for (const f of fs.readdirSync(this.dir))
      if (/^[a-f0-9]{64}\.png$/.test(f) && f !== sha256 + ".png")
        fs.unlinkSync(path.join(this.dir, f));
    return meta;
  }
  image(version) {
    const meta = this.current();
    if (!meta.available || version !== meta.version)
      throw Error("外觀已更新，請重新讀取版本。");
    if (!/^[a-f0-9]{64}$/.test(meta.sha256)) throw Error("外觀索引錯誤。");
    return fs.readFileSync(path.join(this.dir, meta.sha256 + ".png"));
  }
}
