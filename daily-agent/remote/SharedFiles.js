import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { FileTools } from "../tools/BasicTools.js";
const forbidden =
  /^(?:\.(?:env|git|ssh|aws|azure|daily-runtime|codex)(?:\.|$)|credentials|secrets?|private[-_]key|id_rsa|id_ed25519|remote-devices\.json)/i;
export class SharedFiles extends FileTools {
  constructor(dir) {
    super([]);
    this.file = path.join(dir, "shared-folders.json");
    this.roots = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : [];
  }
  async add(folder) {
    const real = await fsp.realpath(folder);
    if (!(await fsp.stat(real)).isDirectory()) throw Error("請指定資料夾。");
    if (real === path.parse(real).root)
      throw Error("請分享特定資料夾，不分享整個磁碟。");
    if (!this.roots.includes(real)) this.roots.push(real);
    this.save();
    return real;
  }
  clear() {
    this.roots = [];
    this.save();
  }
  save() {
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.roots));
    fs.renameSync(this.file + ".tmp", this.file);
  }
  async allowed(file) {
    if (!this.roots.length)
      throw Error(
        "電腦尚未設定手機可讀資料夾。請在電腦說「分享資料夾 路徑」。",
      );
    const real = await super.allowed(file);
    if (
      real.split(/[\\/]/).some((p) => forbidden.test(p)) ||
      /\.(pem|key|pfx|p12|kdbx|sqlite|db)$/i.test(real)
    )
      throw Error("此檔案類型不提供遠端讀取。");
    return real;
  }
  async search({ query = "" }) {
    if (!this.roots.length) throw Error("電腦尚未設定手機可讀資料夾。");
    const results = [];
    for (const root of this.roots) {
      for (const file of await super.search({ query, root })) {
        try {
          await this.allowed(file);
          results.push(file);
        } catch {}
      }
      if (results.length >= 50) break;
    }
    return results.slice(0, 50);
  }
}
