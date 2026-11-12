const test = require("node:test");
const assert = require("node:assert/strict");
const d = require("../miniprogram/utils/domain");
test("相同位置为零且深圳两点距离合理", () => {
  assert.equal(
    d.distance(
      { latitude: 22.54, longitude: 114.06 },
      { latitude: 22.54, longitude: 114.06 },
    ),
    0,
  );
  assert.ok(
    d.distance(
      { latitude: 22.54, longitude: 114.06 },
      { latitude: 22.55, longitude: 114.06 },
    ) > 1100,
  );
});
test("定位缺失不伪造距离", () => assert.equal(d.distance(null, {}), null));
test("拒绝空店名和无效位置", () => {
  assert.throws(
    () => d.validate({ name: " ", latitude: 22, longitude: 114 }),
    /店名/,
  );
  assert.throws(
    () => d.validate({ name: "饭", latitude: 0, longitude: 0 }),
    /位置/,
  );
});
test("照片包含菜品和菜单且去重", () =>
  assert.deepEqual(
    d.photos({
      photos: ["a"],
      menuPhotos: ["a", "b"],
      dishes: [{ photos: ["c"] }],
    }),
    ["a", "b", "c"],
  ));
test("到达时刻按秒计算", () =>
  assert.equal(d.arrival(120, new Date(2026, 0, 1, 10, 0)), "10:02"));
test("校验清理输入并保留菜品", () => {
  const r = d.validate({
    name: " 饭店 ",
    latitude: 22.54,
    longitude: 114.06,
    dishes: [{ name: "汤", price: "18" }],
  });
  assert.equal(r.name, "饭店");
  assert.equal(r.dishes[0].name, "汤");
});
