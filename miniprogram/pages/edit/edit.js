const api = require("../../services/api");
const d = require("../../utils/domain");
const blank = () => ({
  name: "",
  address: "",
  latitude: null,
  longitude: null,
  category: "粤菜",
  tags: [],
  likeLevel: 3,
  note: "",
  photos: [],
  menuPhotos: [],
  dishes: [],
});
Page({
  data: {
    form: blank(),
    categories: ["粤菜", "火锅", "面馆", "小吃", "咖啡甜品", "其他"],
    categoryIndex: 0,
    tagsText: "",
    saving: false,
    recording: false,
    voiceStatus: "",
    loading: false,
    character: "link",
    levels: [
      { id: 1, label: "有点喜欢", note: "吃到一颗小惊喜" },
      { id: 2, label: "很喜欢", note: "下次还想再来" },
      { id: 3, label: "超级喜欢", note: "举起卢比，开心到笑出声" },
    ],
  },
  onShow() {
    this.setData({ character: api.character() });
  },
  onLoad(options) {
    this.id = options.id || "";
    const pending = wx.getStorageSync("food-pending-" + this.id);
    if (pending) {
      this.pending = pending;
      this.version = pending.version;
      this.setData({
        form: pending.originalForm || pending.record,
        pending: true,
        tagsText: (pending.record.tags || []).join("，"),
      });
    } else if (this.id) this.load();
    else this.restore();
  },
  onHide() {
    this.persist();
    this.cancelVoice = true;
    this.stopVoice();
  },
  onUnload() {
    this.persist();
    this.cancelVoice = true;
    this.stopVoice();
  },
  restore() {
    const draft = wx.getStorageSync("food-draft");
    if (draft) {
      draft.form.likeLevel = d.likeLevel(draft.form);
      this.setData(draft);
    }
  },
  persist() {
    if (!this.id && !this.saved)
      wx.setStorageSync("food-draft", {
        form: this.data.form,
        tagsText: this.data.tagsText,
        categoryIndex: this.data.categoryIndex,
      });
  },
  async load() {
    this.setData({ loading: true });
    try {
      const form = await api.call("get", { id: this.id });
      this.version = form.version || 1;
      form.likeLevel = d.likeLevel(form);
      this.setData({
        form,
        tagsText: (form.tags || []).join("，"),
        categoryIndex: Math.max(0, this.data.categories.indexOf(form.category)),
      });
    } catch (error) {
      api.error(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  field(e) {
    if (this.locked()) return;
    this.setData({ ["form." + e.currentTarget.dataset.field]: e.detail.value });
    this.saved = false;
  },
  tags(e) {
    if (this.locked()) return;
    this.setData({ tagsText: e.detail.value });
    this.saved = false;
  },
  category(e) {
    if (this.locked()) return;
    const index = Number(e.detail.value);
    this.setData({
      categoryIndex: index,
      "form.category": this.data.categories[index],
    });
  },
  like(e) {
    if (this.locked()) return;
    this.setData({ "form.likeLevel": Number(e.currentTarget.dataset.value) });
  },
  locked() {
    if (this.pending || this.data.saving) {
      api.error(new Error("请先重试确认上一笔保存"));
      return true;
    }
    return false;
  },
  chooseLocation() {
    if (this.locked()) return;
    wx.chooseLocation({
      latitude: this.data.form.latitude || 22.5431,
      longitude: this.data.form.longitude || 114.0579,
      success: (place) => {
        this.setData({
          "form.address": place.address,
          "form.latitude": place.latitude,
          "form.longitude": place.longitude,
        });
        if (!this.data.form.name) this.setData({ "form.name": place.name });
      },
      fail: (error) => {
        if (!error.errMsg.includes("cancel"))
          api.error(new Error("无法选点，请检查位置权限并重试"));
      },
    });
  },
  addDish() {
    if (this.locked()) return;
    if (this.data.form.dishes.length >= 30)
      return api.error(new Error("最多记录 30 道菜"));
    this.setData({
      "form.dishes": this.data.form.dishes.concat({
        id: Date.now().toString(36),
        name: "",
        price: "",
        note: "",
        photos: [],
      }),
    });
  },
  dishField(e) {
    if (this.locked()) return;
    this.setData({
      ["form.dishes[" +
      e.currentTarget.dataset.index +
      "]." +
      e.currentTarget.dataset.field]: e.detail.value,
    });
  },
  removeDish(e) {
    if (this.locked()) return;
    const removed =
      this.data.form.dishes[Number(e.currentTarget.dataset.index)];
    this.setData({
      "form.dishes": this.data.form.dishes.filter(
        (_, i) => i !== Number(e.currentTarget.dataset.index),
      ),
    });
    this.releaseLocal(removed.photos || []);
    this.persist();
  },
  releaseLocal(paths) {
    const remaining = d.photos(this.data.form);
    for (const filePath of paths) {
      if (!filePath.startsWith("cloud://") && !remaining.includes(filePath))
        wx.removeSavedFile({ filePath, fail: () => {} });
    }
  },
  addPhoto(e) {
    if (this.locked()) return;
    const target = e.currentTarget.dataset.target;
    const index = e.currentTarget.dataset.index;
    const paths =
      target === "dish"
        ? this.data.form.dishes[index].photos
        : this.data.form[target];
    const max = target === "dish" ? 3 : 9;
    if (paths.length >= max) return api.error(new Error("这组照片已经装满啦"));
    wx.chooseMedia({
      count: max - paths.length,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: async (result) => {
        try {
          const saved = [];
          for (const file of result.tempFiles) {
            const image = await wx.saveFile({
              tempFilePath: file.tempFilePath,
            });
            saved.push(image.savedFilePath);
          }
          const path =
            target === "dish"
              ? "form.dishes[" + index + "].photos"
              : "form." + target;
          this.setData({ [path]: paths.concat(saved) });
          this.persist();
        } catch (error) {
          api.error(new Error("照片保存失败，请检查手机存储空间"));
        }
      },
    });
  },
  removePhoto(e) {
    if (this.locked()) return;
    const { target, index, photo } = e.currentTarget.dataset;
    const path =
      target === "dish"
        ? "form.dishes[" + index + "].photos"
        : "form." + target;
    const list =
      target === "dish"
        ? this.data.form.dishes[index].photos
        : this.data.form[target];
    const removed = list[Number(photo)];
    this.setData({ [path]: list.filter((_, i) => i !== Number(photo)) });
    this.releaseLocal([removed]);
    this.persist();
  },
  preview(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.src,
      urls: [e.currentTarget.dataset.src],
    });
  },
  voice(e) {
    if (this.locked()) return;
    if (this.data.recording) return this.stopVoice();
    if (this.data.voiceStatus) return;
    this.voiceField = e.currentTarget.dataset.field || "note";
    try {
      if (!getApp().globalData.config.voiceEnabled)
        throw new Error("语音插件尚未启用");
      if (!this.manager) {
        this.manager = requirePlugin("WechatSI").getRecordRecognitionManager();
        this.manager.onStop = (result) => {
          this.setData({ recording: false, voiceStatus: "" });
          if (this.cancelVoice) return;
          if (result.result) {
            const field = this.voiceField;
            this.setData({
              ["form." + field]:
                (field === "name"
                  ? ""
                  : this.data.form[field] +
                    (this.data.form[field] ? "\n" : "")) + result.result,
            });
            this.persist();
          } else api.error(new Error("没有听清，再说一次试试"));
        };
        this.manager.onError = () => {
          this.setData({ recording: false, voiceStatus: "" });
          api.error(new Error("语音识别失败，请检查录音权限或稍后重试"));
        };
      }
      this.cancelVoice = false;
      this.manager.start({ duration: 60000, lang: "zh_CN" });
      this.setData({
        recording: true,
        voiceStatus: "正在听，点击结束后将转成文字…",
      });
    } catch (error) {
      api.error(new Error("语音暂不可用，请先配置微信同声传译插件"));
    }
  },
  stopVoice() {
    if (this.manager && this.data.recording) {
      this.manager.stop();
      this.setData({
        recording: false,
        voiceStatus: this.cancelVoice ? "" : "正在识别…",
      });
    }
  },
  async save() {
    if (this.data.saving || this.data.loading) return;
    if (this.data.recording || this.data.voiceStatus)
      return api.error(new Error("请先结束录音并等待识别完成"));
    let form;
    try {
      form = d.validate({
        ...this.data.form,
        tags: this.data.tagsText
          .split(/[,，、]/)
          .map((t) => t.trim())
          .filter(Boolean),
      });
    } catch (error) {
      return api.error(error);
    }
    this.stopVoice();
    this.setData({ saving: true });
    let upload;
    try {
      if (!this.pending) {
        upload = await api.uploadRecord(form);
        const requestId =
          Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        this.pending = {
          id: this.id || undefined,
          version: this.version,
          record: upload.record,
          originalForm: form,
          requestId,
          uploaded: upload.uploaded,
          localPhotos: d.photos(form).filter((p) => !p.startsWith("cloud://")),
        };
        wx.setStorageSync("food-pending-" + this.id, this.pending);
        this.setData({ pending: true });
      }
      const localPhotos =
        this.pending.localPhotos ||
        d.photos(this.data.form).filter((p) => !p.startsWith("cloud://"));
      const result = await this.commitPending();
      for (const filePath of localPhotos)
        wx.removeSavedFile({ filePath, fail: () => {} });
      this.saved = true;
      this.setData({ pending: false });
      wx.removeStorageSync("food-pending-" + this.id);
      wx.removeStorageSync("food-draft");
      if (this.id)
        wx.redirectTo({ url: "/pages/detail/detail?id=" + result.id });
      else {
        this.setData({ form: blank(), tagsText: "", categoryIndex: 0 });
        this.saved = false;
        wx.navigateTo({ url: "/pages/detail/detail?id=" + result.id });
      }
    } catch (error) {
      if (error.definitive && this.pending) {
        await api.cleanup(this.pending.uploaded || []);
        this.pending = null;
        wx.removeStorageSync("food-pending-" + this.id);
        this.setData({ pending: false });
      }
      this.persist();
      api.error(error);
    } finally {
      this.setData({ saving: false });
    }
  },
  async commitPending() {
    try {
      const result = await api.call("save", this.pending);
      this.pending = null;
      return result;
    } catch (error) {
      if (error.definitive) throw error;
      const modal = await wx.showModal({
        title: "保存未确认",
        content:
          "网络可能中断。重试会使用同一保存编号，避免重复记录。照片与文字仍在当前页面。",
        confirmText: "重试",
        cancelText: "稍后再试",
      });
      if (modal.confirm) {
        const result = await api.call("save", this.pending);
        this.pending = null;
        return result;
      }
      throw error;
    }
  },
});
