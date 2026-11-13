const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createApp } = require("../local/server");

test("本地接口保存、重试、隔离、版本冲突和重启持久化", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "food-local-"));
  let service = createApp({ dataDir: directory });
  let server = service.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let base = "http://127.0.0.1:" + server.address().port;
  async function api(url, options = {}) {
    const response = await fetch(base + url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Food-Map": "local",
        ...(options.headers || {}),
      },
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    const record = {
      name: "本地测试小店",
      latitude: 22.54,
      longitude: 114.06,
      likeLevel: 3,
      photos: [],
      dishes: [{ name: "牛肉粉", price: "28" }],
    };
    const create = { profile: "link", record, requestId: "test-save-123" };
    const first = await api("/api/records", {
      method: "POST",
      body: JSON.stringify(create),
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.record.name, record.name);
    const repeat = await api("/api/records", {
      method: "POST",
      body: JSON.stringify(create),
    });
    assert.equal(repeat.body.record.id, first.body.record.id);
    assert.equal(
      (await api("/api/records?profile=link")).body.records.length,
      1,
    );
    assert.equal(
      (await api("/api/records?profile=zelda")).body.records.length,
      0,
    );
    const forbidden = await api(
      "/api/records/" + first.body.record.id + "?profile=zelda",
    );
    assert.equal(forbidden.status, 404);
    const updated = await api("/api/records/" + first.body.record.id, {
      method: "PUT",
      body: JSON.stringify({
        profile: "link",
        version: 1,
        record: { ...record, name: "更新后的小店" },
        requestId: "test-save-456",
      }),
    });
    assert.equal(updated.body.record.version, 2);
    const conflict = await api("/api/records/" + first.body.record.id, {
      method: "PUT",
      body: JSON.stringify({
        profile: "link",
        version: 1,
        record,
        requestId: "test-save-789",
      }),
    });
    assert.equal(conflict.status, 409);
    const noHeader = await fetch(base + "/api/records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(noHeader.status, 403);
    await new Promise((resolve) => server.close(resolve));
    service.close();
    service = createApp({ dataDir: directory });
    server = service.app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = "http://127.0.0.1:" + server.address().port;
    assert.equal(
      (await api("/api/records?profile=link")).body.records[0].name,
      "更新后的小店",
    );
    const deleted = await api("/api/records/" + first.body.record.id, {
      method: "DELETE",
      body: JSON.stringify({ profile: "link", version: 2 }),
    });
    assert.equal(deleted.status, 200);
    assert.equal(
      (await api("/api/records?profile=link")).body.records.length,
      0,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    service.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
