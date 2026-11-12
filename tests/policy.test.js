const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../cloudfunctions/api/policy");
test("不同微信身份不能访问记录", () =>
  assert.throws(() => p.assertOwner({ _openid: "a" }, "b"), /无权/));
test("所有者可访问记录", () =>
  assert.doesNotThrow(() => p.assertOwner({ _openid: "a" }, "a")));
test("旧版本编辑被拒绝", () =>
  assert.throws(() => p.assertVersion({ version: 3 }, 2), /其他设备/));
test("兼容历史记录版本", () =>
  assert.doesNotThrow(() => p.assertVersion({}, 1)));
test("路线拒绝无效交通方式及坐标", () => {
  assert.throws(() => p.routeParams("fly", {}, {}), /交通/);
  assert.throws(() => p.routeParams("walking", null, {}), /定位/);
  assert.throws(
    () => p.routeParams("walking", { latitude: NaN, longitude: 114 }, {}),
    /定位/,
  );
});
test("路线使用给定的真实经纬度", () =>
  assert.equal(
    p
      .routeParams(
        "walking",
        { latitude: 22.54, longitude: 114.06 },
        { latitude: 22.55, longitude: 114.07 },
      )
      .get("from"),
    "22.54,114.06",
  ));
