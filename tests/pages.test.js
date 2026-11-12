const test = require("node:test");
const assert = require("node:assert/strict");
function page(name) {
  let definition;
  global.Page = (value) => {
    definition = value;
  };
  const file = require.resolve("../miniprogram/pages/" + name + "/" + name);
  delete require.cache[file];
  require(file);
  const instance = { ...definition, data: structuredClone(definition.data) };
  instance.setData = (patch) => {
    for (const [path, value] of Object.entries(patch)) {
      const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
      let parent = instance.data;
      for (const key of parts.slice(0, -1)) parent = parent[key];
      parent[parts.at(-1)] = value;
    }
  };
  return instance;
}
test("结束语音不改变原先店名字段", () => {
  global.wx = {};
  const p = page("edit");
  p.data.recording = true;
  p.voiceField = "name";
  p.manager = { stop() {} };
  p.voice({ currentTarget: { dataset: {} } });
  assert.equal(p.voiceField, "name");
});
test("删除本地照片释放文件存储", () => {
  let removed;
  global.wx = {
    removeSavedFile: (o) => {
      removed = o.filePath;
    },
    setStorageSync() {},
  };
  const p = page("edit");
  p.data.form.photos = ["wxfile://saved"];
  p.removePhoto({ currentTarget: { dataset: { target: "photos", photo: 0 } } });
  assert.equal(removed, "wxfile://saved");
});
test("地图卡片展示路线服务返回的绕路距离", async () => {
  global.wx = {
    cloud: {
      callFunction: async () => ({
        result: { ok: true, data: { distance: 3200, duration: 1800 } },
      }),
    },
  };
  const p = page("map");
  p.active = true;
  p.data.location = { latitude: 22.54, longitude: 114.06 };
  p.data.visible = [{ _id: "one" }];
  await p.fillRoutes();
  assert.equal(p.data.visible[0].routeLabel, "步行 3.2 km · 30 分钟");
});
test("个人页可通过正常入口统计菜品与全部照片", async () => {
  const record = {
    name: "小店",
    photos: ["a"],
    menuPhotos: ["b"],
    dishes: [{ photos: ["c"] }],
  };
  global.wx = {
    setStorageSync() {},
    getStorageSync() {
      return "link";
    },
    cloud: {
      callFunction: async (o) => ({
        result: { ok: true, data: o.data.action === "login" ? {} : [record] },
      }),
    },
  };
  const p = page("profile");
  await p.load();
  assert.equal(p.data.dishCount, 1);
  assert.equal(p.data.photoCount, 3);
});
