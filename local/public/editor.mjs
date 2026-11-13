import {
  domain,
  categories,
  levels,
  escape,
  mood,
  request,
  toast,
  showPhoto,
} from "./shared.mjs";
import { createMap } from "./map.mjs";

function blank() {
  return {
    name: "",
    address: "",
    latitude: null,
    longitude: null,
    category: "粤菜",
    likeLevel: 3,
    tags: [],
    note: "",
    photos: [],
    menuPhotos: [],
    dishes: [],
  };
}
export class Editor {
  constructor({ getProfile, getOrigin, onSaved }) {
    this.getProfile = getProfile;
    this.getOrigin = getOrigin;
    this.onSaved = onSaved;
    this.dialog = document.querySelector("#editor-dialog");
    this.container = document.querySelector("#editor-content");
    this.dialog.addEventListener("cancel", (event) => {
      if (this.busy) {
        event.preventDefault();
        toast("正在保存，请稍等一下");
      }
    });
    this.dialog.addEventListener("close", () => {
      this.stopVoice(true);
      if (this.picker) {
        this.picker.destroy();
        this.picker = null;
      }
    });
  }
  draftKey() {
    return "food-local-draft-" + this.profile + "-" + (this.id || "new");
  }
  persist() {
    localStorage.setItem(
      this.draftKey(),
      JSON.stringify({
        form: this.form,
        requestId: this.requestId,
        version: this.version,
        pendingSave: this.pendingSave,
        discardedUploads: this.discardedUploads,
      }),
    );
  }
  change() {
    this.requestId = null;
    this.persist();
  }
  open(record, position) {
    this.profile = this.getProfile();
    this.id = record?.id || "";
    this.version = record?.version;
    this.form = record ? structuredClone(record) : blank();
    this.requestId = null;
    this.pendingSave = null;
    this.discardedUploads = [];
    this.error = "";
    const draft = localStorage.getItem(this.draftKey());
    if (draft) {
      try {
        const saved = JSON.parse(draft);
        if (!record || saved.version === record.version) {
          this.form = saved.form;
          this.requestId = saved.requestId;
          this.version = saved.version;
          this.pendingSave = saved.pendingSave || null;
          this.discardedUploads = saved.discardedUploads || [];
        }
      } catch {
        localStorage.removeItem(this.draftKey());
      }
    }
    if (position && !this.pendingSave) Object.assign(this.form, position);
    this.dialog.showModal();
    this.render();
    this.releaseDiscarded();
    setTimeout(() => this.container.querySelector('[name="name"]').focus(), 80);
  }
  renderPhotos(target, index) {
    const photos =
      target === "dish" ? this.form.dishes[index].photos : this.form[target];
    const max = target === "dish" ? 3 : 9;
    return `<div class="photo-grid">${photos.map((url, photo) => `<div class="photo-item"><img src="${escape(url)}" alt="${target === "menuPhotos" ? "菜单" : "美食"}照片" data-photo="${escape(url)}"><button type="button" class="photo-remove" aria-label="移除照片" data-remove-photo="${photo}" data-target="${target}" data-index="${index ?? ""}">×</button></div>`).join("")}${photos.length < max ? `<label class="photo-add"><span>＋</span>拍照 / 相册<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-upload="${target}" data-index="${index ?? ""}"></label>` : ""}</div>`;
  }
  render() {
    if (this.picker) {
      this.picker.destroy();
      this.picker = null;
    }
    const form = this.form;
    if (this.pendingSave)
      this.error =
        "上一笔保存尚未确认，请重试保存。内容已保留，确认后可以继续编辑。";
    this.container.innerHTML = `<form id="record-form" novalidate>
      <div class="drawer-inner"><div class="drawer-heading"><div><p class="eyebrow">给今天的快乐，留个坐标</p><h2>${this.id ? "再添一点美味记忆" : "记住这一口 🍓"}</h2></div><button type="button" class="close-button" data-editor-close aria-label="关闭编辑">×</button></div>
      <label class="field-label" for="shop-name">这家店叫什么？</label><input class="input" id="shop-name" name="name" maxlength="60" placeholder="例如，巷口那家牛肉粉" value="${escape(form.name)}" required>
      <div class="field-group"><div class="form-row"><h3>📍 给美味留个坐标</h3><button type="button" class="button tiny" id="use-origin">使用我的位置</button></div><p class="picker-help">点击下方地图选择店铺位置，可拖动地图放大选点。</p><div id="editor-map" class="editor-picker"></div>
      <div class="coordinate-fields"><label class="field-label">纬度<input class="input" name="latitude" type="number" step="any" value="${form.latitude ?? ""}" placeholder="22.5431"></label><label class="field-label">经度<input class="input" name="longitude" type="number" step="any" value="${form.longitude ?? ""}" placeholder="114.0579"></label></div>
      <label class="field-label" for="address">店铺地址<small>选填</small></label><input class="input" name="address" id="address" maxlength="200" value="${escape(form.address)}" placeholder="街道、商场和楼层，方便下次找到">
      <label class="field-label" for="category">美食分类</label><select class="input" id="category" name="category">${categories
        .slice(1)
        .map(
          (value) =>
            `<option ${form.category === value ? "selected" : ""}>${value}</option>`,
        )
        .join("")}</select></div>
      <h3 class="form-section-title">吃完有多开心？</h3><div class="level-options">${levels.map((level) => `<button type="button" class="level-option ${form.likeLevel === level.id ? "active" : ""}" data-level="${level.id}" aria-pressed="${form.likeLevel === level.id}">${mood(this.profile, level.id)}<span class="level-label">${level.label}</span><span class="level-description">${level.note}</span></button>`).join("")}</div>
      <label class="field-label" for="tags">口味小标签<small>用逗号隔开</small></label><input class="input" id="tags" name="tags" value="${escape(form.tags.join("，"))}" placeholder="例如，鲜甜，微辣，适合约会">
      <div class="field-group note-group"><div class="form-row"><h3>我的口味小纸条 ✎</h3><button class="button tiny voice-button" type="button" id="voice">🎙 语音记一下</button></div><textarea class="input" name="note" maxlength="3000" placeholder="什么最好吃？辣度、甜度、想再来的理由…">${escape(form.note)}</textarea><p class="voice-status" id="voice-status">支持时使用浏览器普通话语音识别，识别结果可修改。</p></div>
      <h3 class="form-section-title">📸 店铺与这一餐</h3>${this.renderPhotos("photos")}
      <h3 class="form-section-title">📋 菜单小档案</h3>${this.renderPhotos("menuPhotos")}
      <div class="form-row"><h3 class="form-section-title">一定要再点的菜 🥢</h3><button class="button tiny" type="button" id="add-dish">＋ 添一道</button></div>
      <div id="dish-editors">${form.dishes.map((dish, index) => `<div class="dish-editor"><div class="form-row"><h4>我的推荐菜</h4><button type="button" class="text-button" data-remove-dish="${index}">移除</button></div><div class="two-fields"><label class="field-label">菜名<input class="input" data-dish="${index}" name="dish-name" maxlength="60" value="${escape(dish.name)}" placeholder="这道菜叫什么"></label><label class="field-label">价格<small>选填</small><input class="input" data-dish="${index}" name="dish-price" maxlength="20" value="${escape(dish.price)}" placeholder="例如，28 元"></label></div><label class="field-label">好吃在哪里？<input class="input" data-dish="${index}" name="dish-note" maxlength="500" value="${escape(dish.note)}" placeholder="留下你的独家评价"></label>${this.renderPhotos("dish", index)}</div>`).join("")}</div>
      <div id="editor-error" class="form-error" ${this.error ? "" : "hidden"}>${escape(this.error)}</div></div>
      <div class="save-bar"><span class="save-note">记录与照片<br>保存在本机</span><button type="submit" class="button primary" id="save-record">♡ 保存这份快乐</button></div>
    </form>`;
    this.bind();
    this.setBusy(false);
    const origin = this.getOrigin();
    const selected =
      Number.isFinite(form.latitude) && Number.isFinite(form.longitude);
    this.picker = createMap(this.container.querySelector("#editor-map"), {
      center: selected
        ? [form.latitude, form.longitude]
        : origin
          ? [origin.latitude, origin.longitude]
          : [22.5431, 114.0579],
      zoom: 14,
      onClick: (position) => this.setPosition(position),
    });
    if (selected) this.picker.setRecords([{ ...form, id: "selection" }]);
    setTimeout(() => this.picker?.map.invalidateSize(), 60);
  }
  bind() {
    this.container.querySelector("[data-editor-close]").onclick = () => {
      if (!this.busy) this.dialog.close();
    };
    this.container
      .querySelector("#record-form")
      .addEventListener("input", (event) => {
        const input = event.target;
        if (input.dataset.dish !== undefined)
          this.form.dishes[Number(input.dataset.dish)][
            input.name.replace("dish-", "")
          ] = input.value;
        else if (input.name === "tags")
          this.form.tags = input.value
            .split(/[,，、]/)
            .map((tag) => tag.trim())
            .filter(Boolean);
        else if (["latitude", "longitude"].includes(input.name))
          this.form[input.name] =
            input.value === "" ? null : Number(input.value);
        else if (input.name) this.form[input.name] = input.value;
        this.change();
        if (
          ["latitude", "longitude"].includes(input.name) &&
          Number.isFinite(this.form.latitude) &&
          Number.isFinite(this.form.longitude)
        )
          this.picker.setRecords([{ ...this.form, id: "selection" }]);
      });
    this.container.querySelectorAll("[data-level]").forEach(
      (button) =>
        (button.onclick = () => {
          this.form.likeLevel = Number(button.dataset.level);
          this.change();
          this.container.querySelectorAll("[data-level]").forEach((choice) => {
            const selected = choice === button;
            choice.classList.toggle("active", selected);
            choice.setAttribute("aria-pressed", String(selected));
          });
        }),
    );
    this.container.querySelector("#add-dish").onclick = () => {
      if (this.form.dishes.length >= 30) return toast("最多记录 30 道推荐菜");
      this.form.dishes.push({
        id: crypto.randomUUID(),
        name: "",
        price: "",
        note: "",
        photos: [],
      });
      this.change();
      this.render();
      this.container.querySelector(".dish-editor:last-child input").focus();
    };
    this.container.querySelectorAll("[data-remove-dish]").forEach(
      (button) =>
        (button.onclick = () => {
          const removed = this.form.dishes.splice(
            Number(button.dataset.removeDish),
            1,
          );
          this.discardedUploads.push(...(removed[0].photos || []));
          this.change();
          this.render();
          this.releaseDiscarded();
        }),
    );
    this.container.querySelectorAll("[data-remove-photo]").forEach(
      (button) =>
        (button.onclick = () => {
          const list =
            button.dataset.target === "dish"
              ? this.form.dishes[Number(button.dataset.index)].photos
              : this.form[button.dataset.target];
          const removed = list.splice(Number(button.dataset.removePhoto), 1);
          this.discardedUploads.push(...removed);
          this.change();
          this.render();
          this.releaseDiscarded();
        }),
    );
    this.container
      .querySelectorAll("[data-photo]")
      .forEach(
        (image) => (image.onclick = () => showPhoto(image.dataset.photo)),
      );
    this.container
      .querySelectorAll("[data-upload]")
      .forEach((input) => (input.onchange = () => this.upload(input)));
    this.container.querySelector("#use-origin").onclick = () => {
      const origin = this.getOrigin();
      if (!origin) return toast("先在主地图设置你的位置，或在下方地图选点");
      this.setPosition(origin);
      this.picker.map.setView([origin.latitude, origin.longitude], 16);
    };
    this.container.querySelector("#voice").onclick = () => this.voice();
    this.container.querySelector("#record-form").onsubmit = (event) => {
      event.preventDefault();
      this.save();
    };
  }
  setPosition(position) {
    if (this.busy || this.pendingSave)
      return toast("请先确认上一笔保存，再调整店铺位置");
    Object.assign(this.form, position);
    this.container.querySelector('[name="latitude"]').value =
      position.latitude.toFixed(6);
    this.container.querySelector('[name="longitude"]').value =
      position.longitude.toFixed(6);
    this.picker.setRecords([
      { ...this.form, id: "selection", name: this.form.name || "这家店的位置" },
    ]);
    this.change();
  }
  async upload(input) {
    const list =
      input.dataset.upload === "dish"
        ? this.form.dishes[Number(input.dataset.index)].photos
        : this.form[input.dataset.upload];
    const max = input.dataset.upload === "dish" ? 3 : 9;
    const files = [...input.files];
    if (
      files.length > max - list.length ||
      domain.photos(this.form).length + files.length > 30
    )
      return toast("店铺和菜单各最多 9 张，菜品各最多 3 张，每家店总共 30 张");
    this.setBusy(true);
    try {
      for (const file of files) {
        const data = new FormData();
        data.append("photo", file);
        const result = await request("/api/uploads?profile=" + this.profile, {
          method: "POST",
          body: data,
        });
        list.push(result.url);
        this.change();
      }
      toast("照片已保存到这台电脑");
    } catch (error) {
      toast(error.message);
    } finally {
      this.busy = false;
      this.render();
    }
  }
  voice() {
    if (this.recognizer) {
      this.stopVoice(false);
      return;
    }
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition)
      return toast("当前浏览器不支持语音识别，可以使用 Chrome 或直接输入");
    const recognizer = new Recognition();
    recognizer.lang = "zh-CN";
    recognizer.interimResults = false;
    this.recognizer = recognizer;
    this.voiceFinishing = false;
    const status = this.container.querySelector("#voice-status");
    const button = this.container.querySelector("#voice");
    button.textContent = "■ 结束录音";
    button.classList.add("recording");
    status.textContent = "正在听你说，点击结束后转成文字…";
    recognizer.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      this.form.note += (this.form.note ? "\n" : "") + text;
      this.container.querySelector('[name="note"]').value = this.form.note;
      this.change();
    };
    recognizer.onerror = (event) => {
      status.textContent =
        event.error === "not-allowed"
          ? "录音权限未开启，可在地址栏允许麦克风。"
          : "浏览器语音服务暂不可用，请直接输入文字。";
    };
    recognizer.onend = () => {
      this.recognizer = null;
      this.voiceFinishing = false;
      button.textContent = "🎙 语音记一下";
      button.classList.remove("recording");
    };
    try {
      recognizer.start();
    } catch {
      this.stopVoice(true);
      toast("语音启动失败，请直接输入");
    }
  }
  stopVoice(cancel) {
    if (!this.recognizer) return;
    if (cancel) {
      this.recognizer.onresult = null;
      this.recognizer.abort();
    } else {
      this.voiceFinishing = true;
      this.recognizer.stop();
    }
    if (cancel) {
      this.recognizer = null;
      this.voiceFinishing = false;
    }
  }
  async releaseDiscarded() {
    const key = this.draftKey();
    const profile = this.profile;
    const referenced = new Set(domain.photos(this.form));
    for (let index = 0; index < localStorage.length; index++) {
      const draftKey = localStorage.key(index);
      if (!draftKey.startsWith("food-local-draft-")) continue;
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey));
        for (const url of domain.photos(draft.form || {})) referenced.add(url);
        for (const url of domain.photos(draft.pendingSave?.record || {}))
          referenced.add(url);
      } catch {
        /* Ignore unrelated malformed draft cache entries. */
      }
    }
    const urls = [...new Set(this.discardedUploads)].filter(
      (url) => !referenced.has(url),
    );
    if (!urls.length) return;
    try {
      const result = await request("/api/uploads/release", {
        method: "POST",
        body: JSON.stringify({ profile, urls }),
      });
      if (this.draftKey() !== key) return;
      this.discardedUploads = this.discardedUploads.filter(
        (url) => !result.released.includes(url),
      );
      if (localStorage.getItem(key)) this.persist();
    } catch {
      /* Keep the cleanup queue in the draft and retry after the next save/open. */
    }
  }
  setBusy(value) {
    this.busy = value;
    this.container
      .querySelectorAll("input,textarea,select,button")
      .forEach((element) => {
        const mayRetry =
          element.id === "save-record" ||
          element.hasAttribute("data-editor-close");
        element.disabled = value || (!!this.pendingSave && !mayRetry);
      });
  }
  async save() {
    if (this.busy) return;
    if (this.recognizer || this.voiceFinishing)
      return toast("请先结束录音并等待识别完成");
    let record;
    try {
      record = domain.validate(this.form);
    } catch (error) {
      this.showError(error.message);
      return;
    }
    this.requestId = this.requestId || crypto.randomUUID();
    this.pendingSave = this.pendingSave || {
      profile: this.profile,
      record,
      version: this.version,
      requestId: this.requestId,
    };
    this.persist();
    const button = this.container.querySelector("#save-record");
    this.setBusy(true);
    button.textContent = "正在收藏这份快乐…";
    try {
      const result = await request(
        "/api/records" + (this.id ? "/" + this.id : ""),
        {
          method: this.id ? "PUT" : "POST",
          body: JSON.stringify(this.pendingSave),
        },
      );
      this.pendingSave = null;
      localStorage.removeItem(this.draftKey());
      await this.releaseDiscarded();
      this.dialog.close();
      await this.onSaved(result.record);
      toast("这一口快乐，记住啦 ♡");
    } catch (error) {
      if (error.status >= 400 && error.status < 500) this.pendingSave = null;
      this.persist();
      this.showError(
        this.pendingSave
          ? "保存结果尚未确认，文字与照片已保留。请点击重试保存。"
          : error.message,
      );
    } finally {
      this.setBusy(false);
      button.textContent = this.pendingSave
        ? "重试确认上一笔保存"
        : "♡ 保存这份快乐";
    }
  }
  showError(message) {
    const element = this.container.querySelector("#editor-error");
    element.textContent = message;
    element.hidden = false;
    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
