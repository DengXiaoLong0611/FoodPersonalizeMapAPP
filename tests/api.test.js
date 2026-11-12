const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../miniprogram/services/api");
test("云端明确拒绝保存可区别于网络未确认", async () => {
  global.wx = {
    cloud: {
      callFunction: async () => ({ result: { ok: false, error: "版本冲突" } }),
    },
  };
  await assert.rejects(api.call("save"), (error) => error.definitive === true);
});
test("图片路径使用当前微信身份命名空间", async () => {
  let path;
  global.wx = {
    cloud: {
      callFunction: async () => ({
        result: { ok: true, data: { storagePrefix: "food/owner/" } },
      }),
      uploadFile: async (options) => {
        path = options.cloudPath;
        return { fileID: "cloud://image" };
      },
    },
  };
  const result = await api.uploadRecord({
    photos: ["local-image"],
    menuPhotos: [],
    dishes: [],
  });
  assert.ok(path.startsWith("food/owner/"));
  assert.deepEqual(result.record.photos, ["cloud://image"]);
});
test("部分上传失败清理已上传图片", async () => {
  let removed;
  global.wx = {
    cloud: {
      callFunction: async () => ({
        result: { ok: true, data: { storagePrefix: "food/owner/" } },
      }),
      uploadFile: async (options) => {
        if (options.filePath === "bad") throw Error("offline");
        return { fileID: "cloud://good" };
      },
      deleteFile: async (options) => {
        removed = options.fileList;
      },
    },
  };
  await assert.rejects(
    api.uploadRecord({ photos: ["good", "bad"], dishes: [] }),
    /offline/,
  );
  assert.deepEqual(removed, ["cloud://good"]);
});
