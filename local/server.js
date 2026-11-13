const express = require("express");
const multer = require("multer");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { openStore, profileId, problem } = require("./store");

function createApp({ dataDir = path.join(__dirname, "..", ".local") } = {}) {
  const store = openStore(dataDir);
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.get("X-Food-Map") !== "local"
      )
        return res.status(403).json({ error: "请从本地美食地图操作" });
    }
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.get("/api/status", (req, res) =>
    res.json({
      storage: "sqlite",
      location: "local",
      profiles: store.profiles(),
    }),
  );
  app.get("/api/records", (req, res) =>
    res.json({ records: store.list(req.query.profile) }),
  );
  app.get("/api/records/:id", (req, res) =>
    res.json({ record: store.get(req.params.id, req.query.profile) }),
  );
  app.post("/api/records", (req, res) =>
    res.status(201).json({ record: store.save(req.body) }),
  );
  app.put("/api/records/:id", (req, res) =>
    res.json({ record: store.save({ ...req.body, id: req.params.id }) }),
  );
  app.delete("/api/records/:id", (req, res) => {
    store.remove(req.params.id, req.body.profile, req.body.version);
    res.json({ ok: true });
  });
  const allowed = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const upload = multer({
    storage: multer.diskStorage({
      destination: path.join(dataDir, "uploads"),
      filename(req, file, done) {
        done(null, randomUUID() + allowed[file.mimetype]);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter(req, file, done) {
      done(
        allowed[file.mimetype]
          ? null
          : problem("请选择 JPG、PNG、WebP 或 GIF 图片"),
        !!allowed[file.mimetype],
      );
    },
  });
  app.post(
    "/api/uploads",
    (req, res, next) => {
      try {
        profileId(req.query.profile);
        next();
      } catch (error) {
        next(error);
      }
    },
    upload.single("photo"),
    (req, res) => {
      if (!req.file) throw problem("请先选择一张照片");
      try {
        res.status(201).json({
          url: store.addUpload(
            req.query.profile,
            req.file.filename,
            req.file.mimetype,
          ),
        });
      } catch (error) {
        fs.unlinkSync(req.file.path);
        throw error;
      }
    },
  );
  app.post("/api/uploads/release", (req, res) =>
    res.json({
      released: store.releaseUploads(req.body.profile, req.body.urls),
    }),
  );
  app.get("/media/:id", (req, res) => {
    const file = store.getUpload(req.params.id);
    if (!file) throw problem("照片不存在", 404);
    res
      .type(file.mime)
      .sendFile(path.resolve(dataDir, "uploads", file.filename));
  });
  const root = path.join(__dirname, "..");
  app.use(
    "/vendor/leaflet",
    express.static(path.join(root, "node_modules", "leaflet", "dist")),
  );
  app.use("/assets", express.static(path.join(root, "miniprogram", "assets")));
  app.get("/domain.js", (req, res) => {
    const source = fs.readFileSync(
      path.join(root, "miniprogram", "utils", "domain.js"),
      "utf8",
    );
    res
      .type("application/javascript")
      .send(
        "(function(){const module={exports:{}};\n" +
          source +
          "\nwindow.FoodDomain=module.exports;})();",
      );
  });
  app.use(express.static(path.join(__dirname, "public")));
  app.use((error, req, res, next) => {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.status || 500;
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "每张照片请小于 8 MB"
        : status < 500
          ? error.message
          : "本地服务处理失败，请稍后重试";
    if (status >= 500) console.error(error);
    res.status(status).json({ error: message });
  });
  return { app, close: () => store.close() };
}
if (require.main === module) {
  const service = createApp();
  const port = Number(process.env.PORT || 3000);
  const server = service.app.listen(port, "127.0.0.1", () =>
    console.log("饭饭小地图已启动 http://localhost:" + port),
  );
  server.on("error", (error) => {
    console.error(error.message);
    service.close();
    process.exit(1);
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(() => {
        service.close();
        process.exit(0);
      }),
    );
}
module.exports = { createApp };
