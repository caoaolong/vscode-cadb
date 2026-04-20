/**
 * 将 Webview 依赖从 node_modules 复制到 resources/panels/common/vendor，
 * 经 {{resources-uri}} 引用；避免经 node_modules 的 asWebviewUri 在安装版或新版 VS Code 下 404
 *（与 codicons / chatarea 的处理一致）。
 * 需在 copy-layui-modules 之后执行，以便 vendor/layui 含完整 dist/modules。
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const nm = path.join(root, "node_modules");
const commonVendor = path.join(root, "resources", "panels", "common", "vendor");

function rmVendorSub(rel) {
  const p = path.join(commonVendor, rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(nm)) {
    console.error("[copy-webview-vendor] 未找到 node_modules，请先执行 npm install。");
    process.exit(1);
  }

  const jFrom = path.join(nm, "jquery", "dist", "jquery.min.js");
  if (!fs.existsSync(jFrom)) {
    console.error("[copy-webview-vendor] 缺少", jFrom);
    process.exit(1);
  }
  rmVendorSub("jquery");
  const jToDir = path.join(commonVendor, "jquery");
  fs.mkdirSync(jToDir, { recursive: true });
  fs.copyFileSync(jFrom, path.join(jToDir, "jquery.min.js"));

  const layFrom = path.join(nm, "layui", "dist");
  if (!fs.existsSync(path.join(layFrom, "layui.js"))) {
    console.error("[copy-webview-vendor] 缺少", path.join(layFrom, "layui.js"));
    process.exit(1);
  }
  rmVendorSub("layui");
  fs.mkdirSync(commonVendor, { recursive: true });
  fs.cpSync(layFrom, path.join(commonVendor, "layui"), { recursive: true });

  const jeDist = path.join(nm, "jsoneditor", "dist");
  const jeJs = path.join(jeDist, "jsoneditor.min.js");
  const jeCss = path.join(jeDist, "jsoneditor.min.css");
  if (!fs.existsSync(jeJs) || !fs.existsSync(jeCss)) {
    console.error("[copy-webview-vendor] 缺少 jsoneditor dist（jsoneditor.min.js / jsoneditor.min.css）");
    process.exit(1);
  }
  rmVendorSub("jsoneditor");
  const jeTo = path.join(commonVendor, "jsoneditor");
  fs.mkdirSync(jeTo, { recursive: true });
  fs.copyFileSync(jeJs, path.join(jeTo, "jsoneditor.min.js"));
  fs.copyFileSync(jeCss, path.join(jeTo, "jsoneditor.min.css"));
  const jeImg = path.join(jeDist, "img");
  if (fs.existsSync(jeImg)) {
    fs.cpSync(jeImg, path.join(jeTo, "img"), { recursive: true });
  }

  console.log("[copy-webview-vendor] 已写入", commonVendor, "下的 jquery、layui、jsoneditor");
}

main();
