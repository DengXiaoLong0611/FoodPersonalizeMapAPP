const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
}
const files = [
  "project.config.json",
  "package.json",
  "database.rules.json",
  "storage.rules.json",
  ...walk("miniprogram"),
  ...walk("cloudfunctions"),
  ...walk("tests"),
  ...walk("scripts"),
];
for (const file of files) {
  if (file.endsWith(".json")) JSON.parse(fs.readFileSync(file, "utf8"));
  if (file.endsWith(".js"))
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  if (
    /\.(js|wxml|wxss|json)$/.test(file) &&
    fs.readFileSync(file, "utf8").includes(String.fromCharCode(0xfffd))
  )
    throw Error("文件编码错误 " + file);
}
const app = JSON.parse(fs.readFileSync("miniprogram/app.json"));
for (const page of app.pages)
  for (const extension of ["js", "json", "wxml", "wxss"]) {
    if (!fs.existsSync("miniprogram/" + page + "." + extension))
      throw Error("缺少页面文件 " + page + "." + extension);
  }
if (
  fs.readFileSync("miniprogram/utils/domain.js", "utf8") !==
  fs.readFileSync("cloudfunctions/api/domain.js", "utf8")
)
  throw Error("客户端与云端校验逻辑不同步");
console.log(
  "JS 语法、JSON、页面入口、编码及共享逻辑检查通过，共 " +
    files.length +
    " 个文件",
);
