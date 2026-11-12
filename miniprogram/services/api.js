const domain = require("../utils/domain");
async function call(action, data = {}) {
  const response = await wx.cloud.callFunction({
    name: "api",
    data: { action, ...data },
  });
  if (!response.result || !response.result.ok) {
    const error = new Error(
      (response.result && response.result.error) || "云服务暂时不可用",
    );
    error.definitive =
      !!response.result &&
      response.result.ok === false &&
      response.result.definitive !== false;
    throw error;
  }
  if (action === "login" && response.result.data.character)
    wx.setStorageSync("character", response.result.data.character);
  return response.result.data;
}
async function list() {
  try {
    await call("login");
    const records = await call("list");
    wx.setStorageSync("restaurants", records);
    return { records, offline: false };
  } catch (error) {
    const records = wx.getStorageSync("restaurants");
    if (Array.isArray(records)) return { records, offline: true };
    throw error;
  }
}
async function uploadRecord(record) {
  const identity = await call("login");
  const uploaded = [];
  const replacements = {};
  try {
    for (const path of domain.photos(record)) {
      if (path.startsWith("cloud://")) continue;
      const result = await wx.cloud.uploadFile({
        cloudPath:
          identity.storagePrefix +
          Date.now() +
          "-" +
          Math.random().toString(36).slice(2) +
          ".jpg",
        filePath: path,
      });
      uploaded.push(result.fileID);
      replacements[path] = result.fileID;
    }
  } catch (error) {
    await cleanup(uploaded);
    throw error;
  }
  const replace = (paths) => (paths || []).map((p) => replacements[p] || p);
  return {
    record: {
      ...record,
      photos: replace(record.photos),
      menuPhotos: replace(record.menuPhotos),
      dishes: record.dishes.map((d) => ({ ...d, photos: replace(d.photos) })),
    },
    uploaded,
  };
}
async function cleanup(fileList) {
  if (fileList.length) await wx.cloud.deleteFile({ fileList }).catch(() => {});
}
function error(error) {
  wx.showToast({
    title: error.message || "操作失败，请重试",
    icon: "none",
    duration: 3000,
  });
}
function character() {
  return wx.getStorageSync("character") || "link";
}
module.exports = { call, list, uploadRecord, cleanup, error, character };
