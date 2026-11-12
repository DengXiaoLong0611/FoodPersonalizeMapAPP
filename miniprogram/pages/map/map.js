const api = require("../../services/api");
const d = require("../../utils/domain");
Page({
  data: {
    latitude: 22.5431,
    longitude: 114.0579,
    records: [],
    visible: [],
    markers: [],
    query: "",
    category: "全部",
    categories: ["全部", "粤菜", "火锅", "面馆", "小吃", "咖啡甜品", "其他"],
    location: null,
    offline: false,
    loading: true,
    error: "",
  },
  onShow() {
    this.active = true;
    this.routeCache = {};
    this.load();
    this.locate();
  },
  onHide() {
    this.active = false;
    this.stopLocation();
  },
  onUnload() {
    this.active = false;
    this.stopLocation();
  },
  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const result = await api.list();
      this.setData({ records: result.records, offline: result.offline });
      this.filter();
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  filter() {
    const query = this.data.query.trim().toLowerCase();
    const visible = this.data.records
      .filter(
        (r) =>
          (this.data.category === "全部" ||
            r.category === this.data.category) &&
          [
            r.name,
            r.note,
            ...(r.tags || []),
            ...(r.dishes || []).map((d) => d.name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
      )
      .map((r) => ({ ...r, meters: d.distance(this.data.location, r) }));
    visible.sort(
      (a, b) =>
        (a.meters === null ? Infinity : a.meters) -
        (b.meters === null ? Infinity : b.meters),
    );
    const items = visible.map((r) => ({
      ...r,
      routeLabel:
        (this.routeCache && this.routeCache[r._id]) ||
        (this.data.location ? "步行路线查询中…" : "步行路线待定位"),
      distanceLabel: d.formatDistance(r.meters),
      stars: "★".repeat(r.rating || 5),
      dishLabel: (r.dishes || []).map((d) => d.name).join(" · "),
    }));
    this.markerIds = items.map((r) => r._id);
    this.setData({
      visible: items,
      markers: items.map((r, index) => ({
        id: index,
        latitude: r.latitude,
        longitude: r.longitude,
        width: 34,
        height: 42,
        iconPath: "/assets/pin.png",
        callout: {
          content: r.name,
          color: "#453e37",
          bgColor: "#ffe16c",
          padding: 8,
          borderRadius: 12,
          display: "ALWAYS",
        },
      })),
    });
    this.fillRoutes();
  },
  async fillRoutes() {
    if (!this.data.location || !this.active || this.fetchingRoutes) return;
    this.fetchingRoutes = true;
    this.routeCache = this.routeCache || {};
    const origin = this.data.location;
    try {
      for (const record of this.data.visible) {
        if (!this.active || d.distance(origin, this.data.location) > 80) break;
        if (this.routeCache[record._id]) continue;
        let label;
        try {
          const route = await api.call("route", {
            id: record._id,
            mode: "walking",
            from: { latitude: origin.latitude, longitude: origin.longitude },
          });
          label =
            "步行 " +
            d.formatDistance(route.distance) +
            " · " +
            Math.max(1, Math.ceil(route.duration / 60)) +
            " 分钟";
        } catch (error) {
          label = "步行路线暂不可用，详情中重试";
        }
        if (!this.active || d.distance(origin, this.data.location) > 80) break;
        this.routeCache[record._id] = label;
        const index = this.data.visible.findIndex((r) => r._id === record._id);
        if (index >= 0)
          this.setData({ ["visible[" + index + "].routeLabel"]: label });
      }
    } finally {
      this.fetchingRoutes = false;
    }
  },
  search(e) {
    this.setData({ query: e.detail.value });
    this.filter();
  },
  category(e) {
    this.setData({ category: e.currentTarget.dataset.value });
    this.filter();
  },
  locate() {
    if (this.locating) return;
    this.locating = true;
    wx.getLocation({
      type: "gcj02",
      success: (position) => {
        if (!this.active) return;
        this.setData({
          location: position,
          latitude: position.latitude,
          longitude: position.longitude,
          locationError: "",
        });
        this.filter();
        this.stopLocation();
        this.listener = (p) => {
          if (d.distance(this.data.location, p) > 80) this.routeCache = {};
          this.setData({ location: p });
          this.filter();
        };
        wx.onLocationChange(this.listener);
        wx.startLocationUpdate({
          type: "gcj02",
          fail: () =>
            this.setData({ locationError: "持续定位暂不可用，可点击重新定位" }),
        });
      },
      fail: () =>
        this.setData({
          locationError: "定位未开启，允许位置权限后可查看实时距离",
        }),
      complete: () => {
        this.locating = false;
      },
    });
  },
  stopLocation() {
    if (this.listener) {
      wx.offLocationChange(this.listener);
      this.listener = null;
    }
    wx.stopLocationUpdate({});
  },
  permission() {
    wx.openSetting({});
  },
  marker(e) {
    const id = this.markerIds[e.detail.markerId];
    if (id) this.openId(id);
  },
  open(e) {
    this.openId(e.currentTarget.dataset.id);
  },
  openId(id) {
    wx.navigateTo({ url: "/pages/detail/detail?id=" + encodeURIComponent(id) });
  },
  add() {
    wx.switchTab({ url: "/pages/edit/edit" });
  },
});
