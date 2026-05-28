/**
 * 将 sqlite3 运行时所需文件复制到 build/sqlite3/，
 * 避免将整个 node_modules/sqlite3（~80MB）打包进 VSIX。
 *
 * 同时重写 sqlite3-binding.js，用相对路径直接加载 .node 文件，
 * 不再依赖 bindings 模块。
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const nm = path.join(root, "node_modules");
const buildSqlite3 = path.join(root, "build", "sqlite3");

function main() {
  const sqlite3Nm = path.join(nm, "sqlite3");
  if (!fs.existsSync(path.join(sqlite3Nm, "lib", "sqlite3.js"))) {
    console.error(
      "[copy-sqlite3-runtime] 未找到 node_modules/sqlite3，请先 npm install。"
    );
    process.exit(1);
  }

  const nativeBinary = path.join(
    sqlite3Nm,
    "build",
    "Release",
    "node_sqlite3.node"
  );
  if (!fs.existsSync(nativeBinary)) {
    console.error(
      "[copy-sqlite3-runtime] 缺少 node_modules/sqlite3/build/Release/node_sqlite3.node，需要先编译 sqlite3。"
    );
    process.exit(1);
  }

  // 清理目标目录
  if (fs.existsSync(buildSqlite3)) {
    fs.rmSync(buildSqlite3, { recursive: true, force: true });
  }
  fs.mkdirSync(buildSqlite3, { recursive: true });

  // 1. 复制 package.json
  fs.copyFileSync(
    path.join(sqlite3Nm, "package.json"),
    path.join(buildSqlite3, "package.json")
  );

  // 2. 复制 lib/ 目录（JS 绑定）
  const libDir = path.join(buildSqlite3, "lib");
  fs.mkdirSync(libDir, { recursive: true });
  for (const file of fs.readdirSync(path.join(sqlite3Nm, "lib"))) {
    fs.copyFileSync(
      path.join(sqlite3Nm, "lib", file),
      path.join(libDir, file)
    );
  }

  // 3. 复制 native binary（保持 build/Release/ 路径结构，bindings 兼容）
  const releaseDir = path.join(buildSqlite3, "build", "Release");
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.copyFileSync(nativeBinary, path.join(releaseDir, "node_sqlite3.node"));

  // 4. 重写 sqlite3-binding.js，直接用相对路径加载 .node 文件
  //    避免依赖 bindings 模块（该模块已随 node_modules 被排除）
  fs.writeFileSync(
    path.join(libDir, "sqlite3-binding.js"),
    "module.exports = require('../build/Release/node_sqlite3.node');\n"
  );

  const totalSize =
    fs.statSync(path.join(buildSqlite3, "package.json")).size +
    fs.readdirSync(libDir).reduce(
      (sum, f) => sum + fs.statSync(path.join(libDir, f)).size,
      0
    ) +
    fs.statSync(path.join(releaseDir, "node_sqlite3.node")).size;

  console.log(
    `[copy-sqlite3-runtime] 已复制到 ${buildSqlite3}（${(totalSize / 1024 / 1024).toFixed(1)} MB）`
  );
}

main();
