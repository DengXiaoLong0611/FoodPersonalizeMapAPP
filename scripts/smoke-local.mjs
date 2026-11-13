import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createApp } = require("../local/server");
const directory = mkdtempSync(path.join(tmpdir(), "food-browser-"));
const service = createApp({ dataDir: directory });
const server = service.app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const address = "http://127.0.0.1:" + server.address().port;
let browser;
const screenshots = path.resolve(".local/debug");
mkdirSync(screenshots, { recursive: true });
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    geolocation: { latitude: 22.5431, longitude: 114.0579 },
    permissions: ["geolocation"],
    locale: "zh-CN",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(address, { waitUntil: "domcontentloaded" });
  await page.getByText("第一口快乐，由你来记").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".leaflet-tile-loaded").length > 0 ||
      document.querySelector("#tile-status").textContent.includes("轮廓"),
    { timeout: 14000 },
  );
  await page.screenshot({
    path: path.join(screenshots, "desktop-empty.png"),
    fullPage: true,
  });
  await page.locator("#locate").click();
  await page.waitForFunction(() =>
    document.querySelector("#location-status").textContent.includes("定位 ·"),
  );
  await page.locator("#pick-origin").click();
  await page.locator("#map").click({ position: { x: 180, y: 180 } });
  assert.match(
    await page.locator("#location-status").textContent(),
    /手动选点/,
  );
  await page.locator("#locate").click();
  await page.waitForFunction(() =>
    document.querySelector("#location-status").textContent.includes("定位 ·"),
  );
  await page.locator("#hero-add").click();
  await page.locator("#editor-map").click({ position: { x: 150, y: 90 } });
  assert.ok(Number(await page.locator("[name=latitude]").inputValue()) > 22);
  await page.locator("#shop-name").fill("浏览器测试 · 深圳牛肉粉");
  await page.locator('[name="latitude"]').fill("22.5512");
  await page.locator('[name="longitude"]').fill("114.0722");
  await page.locator('[name="address"]').fill("深圳市福田区测试地址");
  await page.locator('[name="category"]').selectOption("面馆");
  await page.locator('[name="tags"]').fill("鲜香，微辣");
  await page.locator('[name="note"]').fill("汤很鲜，牛肉软嫩，下次还来。");
  await page.locator('[data-level="3"]').click();
  await page.locator("#add-dish").click();
  await page.locator('[name="dish-name"]').fill("招牌牛肉粉");
  await page.locator('[name="dish-price"]').fill("28 元");
  await page.locator('[name="dish-note"]').fill("加一份酸笋更好吃");
  await page
    .locator('[data-upload="photos"]')
    .setInputFiles(path.resolve("miniprogram/assets/pin.png"));
  await page.locator(".photo-item").first().waitFor();
  await page.waitForFunction(
    () => !document.querySelector("#save-record").disabled,
  );
  await page
    .locator('[data-upload="dish"]')
    .setInputFiles(path.resolve("miniprogram/assets/hero-moods.jpg"));
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".photo-item").length === 2 &&
      !document.querySelector("#save-record").disabled,
  );
  await page
    .locator('[data-upload="menuPhotos"]')
    .setInputFiles(path.resolve("miniprogram/assets/princess-moods.jpg"));
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".photo-item").length === 3 &&
      !document.querySelector("#save-record").disabled,
  );
  await page
    .locator('[data-upload="photos"]')
    .setInputFiles(path.resolve("miniprogram/assets/pin.png"));
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".photo-item").length === 4 &&
      !document.querySelector("#save-record").disabled,
  );
  const discardedUrl = await page
    .locator(".photo-grid")
    .first()
    .locator("img")
    .nth(1)
    .getAttribute("src");
  const cleanup = page.waitForResponse((response) =>
    response.url().endsWith("/api/uploads/release"),
  );
  await page.locator('[data-target="photos"][data-remove-photo="1"]').click();
  assert.equal((await cleanup).status(), 200);
  assert.equal(
    (await page.request.get(address + discardedUrl)).status(),
    404,
    "移除草稿照片后应释放未引用文件",
  );
  let droppedSave = false;
  await page.route("**/api/records", async (route) => {
    if (route.request().method() === "POST" && !droppedSave) {
      droppedSave = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.locator("#save-record").click();
  await page.locator("#editor-error:not([hidden])").waitFor();
  assert.equal(
    await page.locator("#shop-name").isDisabled(),
    true,
    "保存结果未确认时应保留原请求并锁定编辑",
  );
  const lockedLatitude = await page.locator('[name="latitude"]').inputValue();
  await page.locator("#editor-map").click({ position: { x: 160, y: 100 } });
  assert.equal(
    await page.locator('[name="latitude"]').inputValue(),
    lockedLatitude,
    "待确认保存期间点击地图不得改变草稿",
  );
  await page.locator("#save-record").click();
  await page.locator("#detail-dialog[open] .detail-hero h2").waitFor();
  assert.equal(
    await page.locator(".detail-hero h2").textContent(),
    "浏览器测试 · 深圳牛肉粉",
  );
  assert.match(await page.locator(".distance-large").textContent(), /km/);
  assert.match(
    await page.locator("#detail-content").textContent(),
    /招牌牛肉粉/,
  );
  assert.equal(
    await page.locator("#detail-content .detail-photos img").count(),
    3,
  );
  await page.screenshot({
    path: path.join(screenshots, "desktop-detail.png"),
    fullPage: true,
  });
  await page.locator("#detail-dialog [data-close]").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".record-card").waitFor();
  assert.equal(await page.locator(".record-card").count(), 1);
  await page.locator("#search").fill("酸笋");
  await page.getByText("换个关键词，再找找").waitFor();
  await page.locator("#search").fill("招牌牛肉粉");
  assert.equal(await page.locator(".record-card").count(), 1);
  await page.locator("#search").fill("");
  await page.locator('[data-profile="zelda"]').click();
  await page.getByText("第一口快乐，由你来记").waitFor();
  await page.locator('[data-profile="link"]').click();
  await page.locator(".record-card").waitFor();
  await page.locator(".record-card").click();
  await page.locator("#edit-record").click();
  await page.locator("#shop-name").fill("浏览器测试 · 编辑后的小店");
  await page.locator('[data-level="1"]').click();
  await page.locator("#save-record").click();
  await page.locator("#detail-dialog[open] .detail-hero h2").waitFor();
  assert.equal(
    await page.locator(".detail-mood strong").textContent(),
    "有点喜欢",
  );
  await page.locator("#detail-dialog [data-close]").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(screenshots, "mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "手机页面不应横向溢出",
  );
  await page.locator(".record-card").click();
  await page.locator("#delete-record").click();
  await page.locator('#confirm-dialog [value="delete"]').click();
  await page.getByText("第一口快乐，由你来记").waitFor();
  const offlineContext = await browser.newContext();
  await offlineContext.route("**/MapServer/tile/**", (route) => route.abort());
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(address, { waitUntil: "domcontentloaded" });
  await offlinePage.waitForFunction(() =>
    document.querySelector("#tile-status").textContent.includes("轮廓"),
  );
  assert.ok((await offlinePage.locator(".district-label").count()) > 0);
  await offlineContext.close();
  assert.deepEqual(errors, []);
  console.log(
    "浏览器实测通过：定位、距离、店铺／菜单／菜品照片、三级喜欢、编辑、刷新恢复、搜索、档案隔离、保存中断重试、离线地图、删除和手机布局",
  );
  console.log("调试截图保存在 " + screenshots);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  service.close();
  rmSync(directory, { recursive: true, force: true });
}
