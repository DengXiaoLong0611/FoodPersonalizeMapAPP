const api = require("../../services/api");
Page({
  data: {
    records: [],
    visible: [],
    count: 0,
    dishCount: 0,
    photoCount: 0,
    loading: true,
    error: "",
    query: "",
    nickname: "吃饭小朋友",
    avatar: "",
    offline: false,
    loggedIn: false,
    character: "link",
    roleSaving: false,
  },
  onLoad() {
    const profile = wx.getStorageSync("profile") || {};
    this.setData(profile);
  },
  onShow() {
    this.load();
  },
  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      await api.call("login");
      this.setData({ loggedIn: true, character: api.character() });
      const result = await api.list();
      const records = result.records;
      this.setData({
        records,
        count: records.length,
        dishCount: records.reduce((n, r) => n + (r.dishes || []).length, 0),
        photoCount: records.reduce(
          (n, r) =>
            n +
            (r.photos || []).length +
            (r.menuPhotos || []).length +
            (r.dishes || []).reduce((s, d) => s + (d.photos || []).length, 0),
          0,
        ),
        offline: result.offline,
      });
      this.filter();
    } catch (error) {
      const records = wx.getStorageSync("restaurants");
      if (Array.isArray(records)) {
        this.setData({ records, count: records.length, offline: true });
        this.filter();
      }
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  filter() {
    const q = this.data.query.trim();
    this.setData({
      visible: this.data.records.filter((r) =>
        [r.name, r.note, ...(r.dishes || []).map((d) => d.name)]
          .join(" ")
          .includes(q),
      ),
    });
  },
  search(e) {
    this.setData({ query: e.detail.value });
    this.filter();
  },
  open(e) {
    wx.navigateTo({
      url:
        "/pages/detail/detail?id=" +
        encodeURIComponent(e.currentTarget.dataset.id),
    });
  },
  add() {
    wx.switchTab({ url: "/pages/edit/edit" });
  },
  async chooseCharacter(e) {
    if (this.data.roleSaving) return;
    this.setData({ roleSaving: true });
    try {
      const character = e.currentTarget.dataset.character;
      await api.call("profile", { character });
      wx.setStorageSync("character", character);
      this.setData({ character });
    } catch (error) {
      api.error(error);
    } finally {
      this.setData({ roleSaving: false });
    }
  },
  nickname(e) {
    this.setData({ nickname: e.detail.value || "吃饭小朋友" });
    wx.setStorageSync("profile", {
      nickname: this.data.nickname,
      avatar: this.data.avatar,
    });
  },
  avatar(e) {
    wx.saveFile({
      tempFilePath: e.detail.avatarUrl,
      success: (r) => {
        this.setData({ avatar: r.savedFilePath });
        wx.setStorageSync("profile", {
          nickname: this.data.nickname,
          avatar: r.savedFilePath,
        });
      },
    });
  },
});
