const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const crypto = require("node:crypto");
const data = new Map();
let currentUser = "alice";
const removed = [];
function collection(name) {
  return {
    doc(id) {
      const key = name + "/" + id;
      return {
        async get() {
          if (!data.has(key)) throw Error("missing");
          return { data: structuredClone(data.get(key)) };
        },
        async set({ data: record }) {
          data.set(key, { ...structuredClone(record), _id: id });
        },
        async remove() {
          data.delete(key);
        },
      };
    },
  };
}
const database = {
  collection,
  runTransaction: async (fn) => fn({ collection }),
};
const cloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: "test",
  database: () => database,
  getWXContext: () => ({ OPENID: currentUser }),
  deleteFile: async ({ fileList }) => removed.push(...fileList),
};
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  return name === "wx-server-sdk"
    ? cloud
    : originalLoad.call(this, name, ...args);
};
const { main } = require("../cloudfunctions/api");
Module._load = originalLoad;
const prefix =
  "cloud://environment.bucket/food/" +
  crypto.createHash("sha256").update("alice").digest("hex") +
  "/";
const restaurant = {
  name: "深圳小店",
  latitude: 22.54,
  longitude: 114.06,
  photos: [prefix + "meal.jpg"],
  dishes: [],
};
test("实际云函数重试在另一设备编辑后仍返回原回执，不删除照片", async () => {
  const first = await main({
    action: "save",
    record: restaurant,
    requestId: "request-first",
  });
  assert.equal(first.ok, true);
  const second = await main({
    action: "save",
    id: first.data.id,
    version: 1,
    record: { ...restaurant, note: "另一台手机" },
    requestId: "request-second",
  });
  assert.equal(second.ok, true);
  const retry = await main({
    action: "save",
    record: restaurant,
    requestId: "request-first",
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.data.id, first.data.id);
  assert.equal(retry.data.version, 1);
  assert.deepEqual(removed, []);
  const stored = await main({ action: "get", id: first.data.id });
  assert.equal(stored.data.note, "另一台手机");
  currentUser = "bob";
  const forbidden = await main({ action: "get", id: first.data.id });
  assert.equal(forbidden.ok, false);
  currentUser = "alice";
});
test("云函数拒绝引用其他账户的照片路径", async () => {
  const result = await main({
    action: "save",
    record: {
      ...restaurant,
      photos: ["cloud://environment.bucket/food/bob/image.jpg"],
    },
    requestId: "request-invalid",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /当前账户/);
});
test("两个人的角色偏好跟随各自微信身份保存", async () => {
  currentUser = "alice";
  assert.equal((await main({ action: "profile", character: "link" })).ok, true);
  currentUser = "bob";
  assert.equal(
    (await main({ action: "profile", character: "zelda" })).ok,
    true,
  );
  assert.equal((await main({ action: "login" })).data.character, "zelda");
  currentUser = "alice";
  assert.equal((await main({ action: "login" })).data.character, "link");
});
test("云端拒绝不受支持的角色值", async () => {
  const response = await main({ action: "profile", character: "unknown" });
  assert.equal(response.ok, false);
  assert.match(response.error, /角色/);
});
