const cloud = require("wx-server-sdk");
const https = require("https");
const crypto = require("crypto");
const { validate, photos } = require("./domain");
const { assertOwner, assertVersion, routeParams } = require("./policy");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const records = db.collection("restaurants");

function rejection(message) {
  return Object.assign(new Error(message), { definitive: true });
}
async function readOptional(reference) {
  try {
    return (await reference.get()).data;
  } catch (error) {
    const message = error.errMsg || error.message || "";
    if (
      /document.*(not exist|not found)|document does not exist|^missing$/i.test(
        message,
      )
    )
      return null;
    throw error;
  }
}

async function getOwned(id, openid) {
  if (typeof id !== "string" || !id) throw rejection("记录编号无效");
  const record = await readOptional(records.doc(id));
  assertOwner(record, openid);
  return record;
}
function requestJSON(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          reject(new Error("地图服务返回异常，请重试"));
        }
      });
      response.on("error", reject);
    });
    request.setTimeout(8000, () =>
      request.destroy(new Error("地图服务超时，请重试")),
    );
    request.on("error", reject);
  });
}
async function cleanup(fileList) {
  if (!fileList.length) return;
  try {
    await cloud.deleteFile({ fileList });
  } catch (_) {
    console.warn("图片清理失败，需通过云控制台检查孤立文件");
  }
}
exports.main = async (event) => {
  try {
    const { OPENID: openid } = cloud.getWXContext();
    if (!openid) throw rejection("请在微信中登录后使用");
    switch (event.action) {
      case "login": {
        const id = crypto.createHash("sha256").update(openid).digest("hex");
        const user = db.collection("users").doc(id);
        const existing = await readOptional(user);
        if (!existing)
          await user.set({ data: { _openid: openid, createdAt: Date.now() } });
        return {
          ok: true,
          data: { loggedIn: true, storagePrefix: "food/" + id + "/" },
        };
      }
      case "list": {
        let all = [];
        let page;
        do {
          page = (
            await records
              .where({ _openid: openid })
              .orderBy("_id", "asc")
              .skip(all.length)
              .limit(100)
              .get()
          ).data;
          all = all.concat(page);
        } while (page.length === 100);
        all.sort((a, b) => b.updatedAt - a.updatedAt);
        return { ok: true, data: all };
      }
      case "get":
        return { ok: true, data: await getOwned(event.id, openid) };
      case "save": {
        if (
          typeof event.requestId !== "string" ||
          !/^[a-z0-9-]{8,100}$/.test(event.requestId)
        )
          throw rejection("保存请求编号无效");
        let data;
        try {
          data = validate(event.record || {});
        } catch (error) {
          error.definitive = true;
          throw error;
        }
        const ownerHash = crypto
          .createHash("sha256")
          .update(openid)
          .digest("hex");
        const ownPrefix = "/food/" + ownerHash + "/";
        if (
          photos(data).some(
            (path) =>
              typeof path !== "string" ||
              !path.startsWith("cloud://") ||
              !path.slice(path.indexOf("/", 8)).startsWith(ownPrefix),
          )
        )
          throw rejection("图片必须来自当前账户的云端空间");
        const id =
          event.id ||
          crypto
            .createHash("sha256")
            .update(openid + String(event.requestId || crypto.randomUUID()))
            .digest("hex");
        const result = await db.runTransaction(async (transaction) => {
          const receiptId = crypto
            .createHash("sha256")
            .update(openid + event.requestId)
            .digest("hex");
          const receipt = transaction
            .collection("save_requests")
            .doc(receiptId);
          const confirmed = await readOptional(receipt);
          if (confirmed)
            return {
              id: confirmed.recordId,
              version: confirmed.version,
              oldPhotos: [],
            };
          const reference = transaction.collection("restaurants").doc(id);
          const old = await readOptional(reference);
          if (old) {
            assertOwner(old, openid);
            if (old.lastRequestId === event.requestId && event.requestId)
              return { id, oldPhotos: [], version: old.version };
            assertVersion(old, event.version);
          } else if (event.id) throw rejection("记录已删除，请返回列表");
          const version = old ? (old.version || 1) + 1 : 1;
          await reference.set({
            data: {
              ...data,
              _openid: openid,
              createdAt: old ? old.createdAt : Date.now(),
              updatedAt: Date.now(),
              version,
              lastRequestId: String(event.requestId || ""),
            },
          });
          await receipt.set({
            data: {
              _openid: openid,
              recordId: id,
              version,
              createdAt: Date.now(),
            },
          });
          return {
            id,
            version,
            oldPhotos: old
              ? photos(old).filter((p) => !photos(data).includes(p))
              : [],
          };
        });
        await cleanup(result.oldPhotos);
        return { ok: true, data: { id: result.id, version: result.version } };
      }
      case "delete": {
        const removed = await db.runTransaction(async (transaction) => {
          const reference = transaction.collection("restaurants").doc(event.id);
          const old = (await reference.get()).data;
          assertOwner(old, openid);
          assertVersion(old, event.version);
          await reference.remove();
          return photos(old);
        });
        await cleanup(removed);
        return { ok: true, data: true };
      }
      case "route": {
        const destination = await getOwned(event.id, openid);
        const params = routeParams(event.mode, event.from, destination);
        if (!process.env.TENCENT_MAP_KEY)
          throw rejection("请先配置云函数的腾讯地图密钥");
        params.set("key", process.env.TENCENT_MAP_KEY);
        const response = await requestJSON(
          "https://apis.map.qq.com/ws/direction/v1/" +
            event.mode +
            "/?" +
            params.toString(),
        );
        if (response.status !== 0)
          throw rejection("路线查询失败，请检查地图服务权限或稍后重试");
        const routes = response.result && response.result.routes;
        if (!routes || !routes.length)
          throw rejection("当前交通方式暂无可用路线");
        const route = routes[0];
        const segments = route.steps || [];
        return {
          ok: true,
          data: {
            distance: route.distance,
            duration: route.duration * 60,
            steps: segments
              .map(
                (s) =>
                  s.instruction ||
                  s.title ||
                  (s.lines && s.lines[0] && s.lines[0].title) ||
                  "",
              )
              .filter(Boolean)
              .slice(0, 12),
          },
        };
      }
      default:
        throw rejection("未知操作");
    }
  } catch (error) {
    console.error("api error", error.message);
    return {
      ok: false,
      error: error.message || "云服务暂时不可用",
      definitive: error.definitive === true,
    };
  }
};
