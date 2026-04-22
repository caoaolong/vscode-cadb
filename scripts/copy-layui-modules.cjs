/**
 * Layui 的 npm 包仅含 dist/layui.js 等，不含 dist/modules/*.js；
 * layui.use() 会按 layui.js 所在目录动态加载 modules，缺失时表单/设计页脚本永远不就绪。
 * 官方 Release 的 layui-v*.zip 同样不含 modules，故从 GitHub 标签源码包 archive/*.zip 的
 * src/modules/*.js 解压到 node_modules/layui/dist/modules（与 layui.js 运行时路径一致）。
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

let AdmZip;
try {
  AdmZip = require("adm-zip");
} catch (e) {
  console.error(
    "[copy-layui-modules] 需要 devDependency adm-zip，请先执行 npm install。"
  );
  process.exit(1);
}

const root = path.join(__dirname, "..");
const nm = path.join(root, "node_modules");
const layuiDist = path.join(nm, "layui", "dist");
const modulesDir = path.join(layuiDist, "modules");

function readLayuiVersion() {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const raw = (pkg.dependencies && pkg.dependencies.layui) || "2.13.2";
  return String(raw).replace(/^[\^~>=<]/, "").trim() || "2.13.2";
}

/**
 * 使用系统工具下载，避免部分环境下 Node https 证书链与代理不一致导致失败。
 */
function downloadToFile(urlStr, destFile) {
  const escPs = (s) => s.replace(/'/g, "''");
  if (process.platform === "win32") {
    const cmd = `Invoke-WebRequest -Uri '${escPs(
      urlStr
    )}' -OutFile '${escPs(destFile)}' -UseBasicParsing`;
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", cmd], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      throw new Error(
        r.stderr || r.stdout || "PowerShell 下载 Layui zip 失败"
      );
    }
    return;
  }
  const r = spawnSync("curl", ["-fL", "--retry", "3", "-o", destFile, urlStr], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "curl 下载 Layui zip 失败");
  }
}

function extractModulesFromSrcZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  let count = 0;
  const marker = "/src/modules/";
  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }
    const norm = entry.entryName.replace(/\\/g, "/");
    const idx = norm.indexOf(marker);
    if (idx === -1) {
      continue;
    }
    const rel = norm.slice(idx + marker.length);
    if (!rel || rel.includes("/")) {
      continue;
    }
    const dest = path.join(modulesDir, rel);
    fs.writeFileSync(dest, entry.getData());
    count++;
  }
  return count;
}

function main() {
  if (!fs.existsSync(path.join(nm, "layui", "dist", "layui.js"))) {
    console.error(
      "[copy-layui-modules] 未找到 node_modules/layui/dist/layui.js，请先 npm install。"
    );
    process.exit(1);
  }

  if (fs.existsSync(path.join(modulesDir, "form.js"))) {
    console.log("[copy-layui-modules] dist/modules 已存在，跳过。");
    return;
  }

  const version = readLayuiVersion();
  const verNorm = version.replace(/^v/i, "");
  const tag = `v${verNorm}`;
  const zipUrl = `https://github.com/layui/layui/archive/refs/tags/${tag}.zip`;
  const tmpZip = path.join(
    os.tmpdir(),
    `cadb-layui-src-${verNorm}-${Date.now()}.zip`
  );

  console.log("[copy-layui-modules] 下载", zipUrl);
  try {
    downloadToFile(zipUrl, tmpZip);
  } catch (e) {
    console.error(
      "[copy-layui-modules] 下载失败:",
      e && e.message ? e.message : e
    );
    process.exit(1);
  }

  fs.rmSync(modulesDir, { recursive: true, force: true });
  fs.mkdirSync(modulesDir, { recursive: true });

  let n;
  try {
    n = extractModulesFromSrcZip(tmpZip);
  } finally {
    try {
      fs.unlinkSync(tmpZip);
    } catch {
      /* 忽略 */
    }
  }

  if (n === 0 || !fs.existsSync(path.join(modulesDir, "form.js"))) {
    console.error(
      "[copy-layui-modules] 源码包内未找到 src/modules（至少应有 form.js），请检查 Layui 版本与 GitHub 标签是否存在。"
    );
    process.exit(1);
  }

  console.log("[copy-layui-modules] 已解压", n, "个文件到", modulesDir);
}

main();
