const { DatabaseSync } = require("node:sqlite");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const domain = require("../miniprogram/utils/domain");

function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function profileId(value) {
  if (!["link", "zelda"].includes(value)) throw problem("请选择一个本地档案");
  return value;
}
function openStore(directory) {
  fs.mkdirSync(path.join(directory, "uploads"), { recursive: true });
  const db = new DatabaseSync(path.join(directory, "food-map.sqlite"));
  db.exec(`PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, nickname TEXT NOT NULL);
    INSERT OR IGNORE INTO profiles VALUES ('link', '小勇者'), ('zelda', '小公主');
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, profile TEXT NOT NULL REFERENCES profiles(id),
      data TEXT NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_profile ON records(profile, updated_at);
    CREATE TABLE IF NOT EXISTS requests (
      profile TEXT NOT NULL, request_id TEXT NOT NULL, response TEXT NOT NULL,
      PRIMARY KEY(profile, request_id)
    );
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY, profile TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL
    );`);
  function decode(row) {
    if (!row) return null;
    return {
      ...JSON.parse(row.data),
      id: row.id,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      coordinateSystem: "wgs84",
    };
  }
  function list(profile) {
    return db
      .prepare(
        "SELECT * FROM records WHERE profile = ? ORDER BY updated_at DESC",
      )
      .all(profileId(profile))
      .map(decode);
  }
  function get(id, profile) {
    const record = decode(
      db
        .prepare("SELECT * FROM records WHERE id = ? AND profile = ?")
        .get(id, profileId(profile)),
    );
    if (!record) throw problem("这份记录不存在，请刷新列表", 404);
    return record;
  }
  function removeUnused(urls) {
    const used = new Set(
      db
        .prepare("SELECT data FROM records")
        .all()
        .flatMap((row) => domain.photos(JSON.parse(row.data))),
    );
    for (const url of urls) {
      if (used.has(url)) continue;
      const upload = db
        .prepare("SELECT * FROM uploads WHERE id = ?")
        .get(url.replace("/media/", ""));
      if (!upload) continue;
      try {
        fs.unlinkSync(path.join(directory, "uploads", upload.filename));
      } catch (error) {
        if (error.code !== "ENOENT") continue;
      }
      db.prepare("DELETE FROM uploads WHERE id = ?").run(upload.id);
    }
  }
  function save({ id, profile, record, version, requestId }) {
    profileId(profile);
    if (typeof requestId !== "string" || !/^[\w-]{8,100}$/.test(requestId))
      throw problem("保存编号无效，请刷新后重试");
    let result;
    let oldPhotos = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      const receipt = db
        .prepare(
          "SELECT response FROM requests WHERE profile = ? AND request_id = ?",
        )
        .get(profile, requestId);
      if (receipt) {
        result = JSON.parse(receipt.response);
      } else {
        let clean;
        try {
          clean = domain.validate(record || {});
        } catch (error) {
          throw problem(error.message);
        }
        for (const url of domain.photos(clean)) {
          if (typeof url !== "string" || !/^\/media\/[\w-]+$/.test(url))
            throw problem("照片地址无效，请重新上传");
          if (
            !db
              .prepare("SELECT id FROM uploads WHERE id = ? AND profile = ?")
              .get(url.slice(7), profile)
          )
            throw problem("照片不属于当前档案");
        }
        const old = id ? get(id, profile) : null;
        if (old && old.version !== version)
          throw problem("记录已更新，请重新打开后编辑", 409);
        const now = Date.now();
        const recordId = id || randomUUID();
        const nextVersion = old ? old.version + 1 : 1;
        db.prepare(
          `INSERT INTO records VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data, version=excluded.version, updated_at=excluded.updated_at`,
        ).run(
          recordId,
          profile,
          JSON.stringify(clean),
          nextVersion,
          old ? old.createdAt : now,
          now,
        );
        result = get(recordId, profile);
        db.prepare("INSERT INTO requests VALUES (?, ?, ?)").run(
          profile,
          requestId,
          JSON.stringify(result),
        );
        oldPhotos = old
          ? domain
              .photos(old)
              .filter((url) => !domain.photos(clean).includes(url))
          : [];
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    removeUnused(oldPhotos);
    return result;
  }
  function remove(id, profile, version) {
    const record = get(id, profile);
    const result = db
      .prepare(
        "DELETE FROM records WHERE id = ? AND profile = ? AND version = ?",
      )
      .run(id, profile, version);
    if (!result.changes) throw problem("记录已更新，请重新打开后删除", 409);
    removeUnused(domain.photos(record));
  }
  return {
    list,
    get,
    save,
    remove,
    profiles: () =>
      db.prepare("SELECT id, nickname FROM profiles ORDER BY id").all(),
    addUpload(profile, file, mime) {
      profileId(profile);
      const id = randomUUID();
      db.prepare("INSERT INTO uploads VALUES (?, ?, ?, ?)").run(
        id,
        profile,
        file,
        mime,
      );
      return "/media/" + id;
    },
    releaseUploads(profile, urls) {
      profileId(profile);
      if (!Array.isArray(urls) || urls.length > 100)
        throw problem("待清理照片列表无效");
      const owned = urls
        .filter(
          (url) => typeof url === "string" && /^\/media\/[\w-]+$/.test(url),
        )
        .filter((url) => {
          const upload = db
            .prepare("SELECT profile FROM uploads WHERE id = ?")
            .get(url.slice(7));
          return upload && upload.profile === profile;
        });
      removeUnused(owned);
      return urls.filter(
        (url) =>
          typeof url === "string" &&
          /^\/media\/[\w-]+$/.test(url) &&
          !db.prepare("SELECT id FROM uploads WHERE id = ?").get(url.slice(7)),
      );
    },
    getUpload(id) {
      return db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
    },
    close() {
      db.close();
    },
  };
}
module.exports = { openStore, profileId, problem };
