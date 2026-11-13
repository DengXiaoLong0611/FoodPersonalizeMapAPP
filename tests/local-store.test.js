const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStore } = require("../local/store");
function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "food-files-"));
  const store = openStore(directory);
  const photo = (filename) => {
    fs.writeFileSync(path.join(directory, "uploads", filename), "test-image");
    return store.addUpload("link", filename, "image/png");
  };
  try {
    run({ directory, store, photo });
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
const record = {
  name: "小店",
  latitude: 22.54,
  longitude: 114.06,
  likeLevel: 3,
  dishes: [],
};
test("旧照片清理后重试已提交请求仍可确认成功", () =>
  fixture(({ store, photo }) => {
    const firstRequest = {
      profile: "link",
      record: { ...record, photos: [photo("first.png")] },
      requestId: "save-request-first",
    };
    const first = store.save(firstRequest);
    store.save({
      id: first.id,
      profile: "link",
      version: 1,
      record: { ...record, photos: [] },
      requestId: "save-request-second",
    });
    const retry = store.save(firstRequest);
    assert.equal(retry.id, first.id);
    assert.equal(retry.version, 1);
    assert.deepEqual(store.get(first.id, "link").photos, []);
  }));
test("释放草稿照片会清理文件并保留仍被记录引用的照片", () =>
  fixture(({ directory, store, photo }) => {
    const discarded = photo("discarded.png");
    store.releaseUploads("link", [discarded]);
    assert.equal(
      fs.existsSync(path.join(directory, "uploads", "discarded.png")),
      false,
    );
    const used = photo("used.png");
    const first = store.save({
      profile: "link",
      record: { ...record, photos: [used] },
      requestId: "save-shared-first",
    });
    const second = store.save({
      profile: "link",
      record: { ...record, photos: [used] },
      requestId: "save-shared-second",
    });
    store.releaseUploads("zelda", [used]);
    store.releaseUploads("link", [used]);
    assert.equal(
      fs.existsSync(path.join(directory, "uploads", "used.png")),
      true,
    );
    store.remove(first.id, "link", 1);
    assert.ok(store.getUpload(used.slice(7)));
    store.remove(second.id, "link", 1);
    assert.equal(store.getUpload(used.slice(7)), undefined);
  }));
