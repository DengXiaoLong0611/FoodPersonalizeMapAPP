const api = require("../../services/api");
const d = require("../../utils/domain");
Page({
  data: {
    record: null,
    loading: true,
    error: "",
    mode: "walking",
    modes: [
      { id: "walking", label: "🚶 步行" },
      { id: "bicycling", label: "🚲 骑行" },
      { id: "driving", label: "🚗 驾车" },
      { id: "transit", label: "🚌 公交" },
    ],
    route: null,
    routeError: "",
    routing: false,
    distanceLabel: "待定位",
    location: null,
  },
  onLoad(options) {
    this.id = options.id;
  },
  onShow() {
    this.active = true;
    this.load();
    this.clock = setInterval(() => {
      if (this.data.route)
        this.setData({ "route.arrival": d.arrival(this.data.route.duration) });
      if (Date.now() - (this.lastRouteAt || 0) > 120000) this.queryRoute();
    }, 30000);
  },
  onHide() {
    this.active = false;
    this.stopLocation();
    clearInterval(this.clock);
  },
  onUnload() {
    this.active = false;
    this.stopLocation();
    clearInterval(this.clock);
  },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const record = await api.call("get", { id: this.id });
      this.setData({
        record,
        likeLevel: d.likeLevel(record),
        character: api.character(),
      });
      this.locate();
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  locate() {
    wx.getLocation({
      type: "gcj02",
      success: (p) => {
        if (!this.active) return;
        this.updatePosition(p);
        this.queryRoute();
        this.stopLocation();
        this.listener = (position) => {
          if (!this.active) return;
          this.updatePosition(position);
          if (
            Date.now() - (this.lastRouteAt || 0) > 15000 &&
            d.distance(this.routeOrigin, position) > 50
          )
            this.queryRoute();
        };
        wx.onLocationChange(this.listener);
        wx.startLocationUpdate({ type: "gcj02", fail: () => {} });
      },
      fail: () =>
        this.setData({
          routeError: "允许定位后可查看距离与交通路线，点击重新定位可重试",
        }),
    });
  },
  stopLocation() {
    if (this.listener) {
      wx.offLocationChange(this.listener);
      this.listener = null;
    }
    wx.stopLocationUpdate({});
  },
  updatePosition(location) {
    this.setData({
      location,
      distanceLabel: d.formatDistance(d.distance(location, this.data.record)),
    });
  },
  mode(e) {
    this.setData({ mode: e.currentTarget.dataset.id, route: null });
    this.queryRoute();
  },
  async queryRoute() {
    if (!this.data.location) return;
    const sequence = (this.sequence || 0) + 1;
    this.sequence = sequence;
    this.lastRouteAt = Date.now();
    this.routeOrigin = this.data.location;
    this.setData({ routing: true, routeError: "", route: null });
    try {
      const route = await api.call("route", {
        id: this.id,
        mode: this.data.mode,
        from: {
          latitude: this.data.location.latitude,
          longitude: this.data.location.longitude,
        },
      });
      if (sequence !== this.sequence || !this.active) return;
      this.setData({
        route: {
          ...route,
          distanceLabel: d.formatDistance(route.distance),
          minutes: Math.max(1, Math.ceil(route.duration / 60)),
          arrival: d.arrival(route.duration),
        },
      });
    } catch (error) {
      if (sequence === this.sequence)
        this.setData({ routeError: error.message });
    } finally {
      if (sequence === this.sequence) this.setData({ routing: false });
    }
  },
  navigate() {
    const r = this.data.record;
    wx.openLocation({
      latitude: r.latitude,
      longitude: r.longitude,
      name: r.name,
      address: r.address,
      scale: 17,
    });
  },
  edit() {
    wx.navigateTo({
      url: "/pages/edit/edit?id=" + encodeURIComponent(this.id),
    });
  },
  preview(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.src,
      urls: [e.currentTarget.dataset.src],
    });
  },
  async remove() {
    const response = await wx.showModal({
      title: "删除这份美食记忆？",
      content: "店铺、菜品和云端照片都会一起移除。",
      confirmText: "删除",
      confirmColor: "#c45262",
    });
    if (!response.confirm) return;
    try {
      await api.call("delete", {
        id: this.id,
        version: this.data.record.version || 1,
      });
      wx.removeStorageSync("restaurants");
      wx.switchTab({ url: "/pages/map/map" });
    } catch (error) {
      api.error(error);
    }
  },
});
