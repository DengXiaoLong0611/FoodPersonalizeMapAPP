import {
  domain,
  categories,
  escape,
  mood,
  request,
  toast,
  showPhoto,
} from "./shared.mjs";
import { createMap } from "./map.mjs";
import { Editor } from "./editor.mjs";

const $ = (selector) => document.querySelector(selector);
const state = {
  profile:
    localStorage.getItem("food-local-profile") === "zelda" ? "zelda" : "link",
  profiles: [],
  records: [],
  query: "",
  category: "全部",
  origin: null,
  view: "map",
  pickingOrigin: false,
  watchId: null,
};
try {
  const saved = JSON.parse(localStorage.getItem("food-local-origin"));
  if (
    saved &&
    Number.isFinite(saved.latitude) &&
    Number.isFinite(saved.longitude)
  )
    state.origin = {
      ...saved,
      source: saved.source === "定位" ? "上次定位" : saved.source,
    };
} catch {
  localStorage.removeItem("food-local-origin");
}
const foodMap = createMap($("#map"), {
  onClick(position) {
    if (state.pickingOrigin) {
      setOrigin(position, "手动选点");
      setPicking(false);
      toast("已设置你的位置，距离会跟着更新");
    } else {
      const popup = document.createElement("div");
      popup.innerHTML = `<span>把这一口快乐记在这里</span><br><button class="button tiny">＋ 在这里记一家店</button>`;
      popup.querySelector("button").onclick = () => {
        foodMap.map.closePopup();
        editor.open(null, position);
      };
      window.L.popup()
        .setLatLng([position.latitude, position.longitude])
        .setContent(popup)
        .openOn(foodMap.map);
    }
  },
  onRecord: (id) => openDetail(id),
  onTileError() {
    $("#tile-status").textContent = "在线底图暂不可用 · 深圳区界轮廓";
  },
});
const editor = new Editor({
  getProfile: () => state.profile,
  getOrigin: () => state.origin,
  onSaved: async (record) => {
    await loadRecords();
    openDetail(record.id);
  },
});

function setPicking(value) {
  state.pickingOrigin = value;
  $("#map-hint").hidden = !value;
  $("#map").style.cursor = value ? "crosshair" : "";
  $("#pick-origin").textContent = value ? "点击地图选点…" : "设置我的位置";
}
function setOrigin(position, source, pan = false) {
  if (source === "手动选点" && state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  state.origin = {
    latitude: position.latitude,
    longitude: position.longitude,
    source,
  };
  localStorage.setItem("food-local-origin", JSON.stringify(state.origin));
  foodMap.setOrigin(state.origin, pan);
  $("#location-status").textContent =
    `${source} · ${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}`;
  $("#sort-label").textContent = "按直线距离";
  renderRecords();
  if ($("#detail-dialog").open && state.detailId)
    renderDetail(state.records.find((record) => record.id === state.detailId));
}
function locate() {
  if (!navigator.geolocation)
    return toast("浏览器暂不支持定位，可点击“设置我的位置”在地图上选点");
  const button = $("#locate");
  button.disabled = true;
  button.textContent = "正在寻找你…";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setOrigin(position.coords, "定位", true);
      button.disabled = false;
      button.textContent = "⌖ 定位到我";
      if (state.watchId !== null)
        navigator.geolocation.clearWatch(state.watchId);
      state.watchId = navigator.geolocation.watchPosition(
        (next) => setOrigin(next.coords, "定位"),
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 },
      );
      toast("找到你啦，附近美食的距离已更新");
    },
    () => {
      button.disabled = false;
      button.textContent = "⌖ 定位到我";
      toast("定位暂不可用，可点击“设置我的位置”在深圳地图上选点");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  );
}
function visibleRecords() {
  const query = state.query.trim().toLowerCase();
  const records = state.records
    .filter(
      (record) =>
        (state.category === "全部" || record.category === state.category) &&
        [
          record.name,
          record.note,
          ...(record.tags || []),
          ...record.dishes.map((dish) => dish.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
    )
    .map((record) => ({
      ...record,
      meters: domain.distance(state.origin, record),
    }));
  if (state.origin) records.sort((a, b) => a.meters - b.meters);
  return records;
}
function renderStats() {
  const stats = [
    ["🍜", state.records.length, "家私藏好店"],
    [
      "🥢",
      state.records.reduce((sum, record) => sum + record.dishes.length, 0),
      "道心头好",
    ],
    [
      "📸",
      state.records.reduce(
        (sum, record) => sum + domain.photos(record).length,
        0,
      ),
      "张美味记忆",
    ],
  ];
  $("#stats").innerHTML = stats
    .map(
      ([icon, count, label]) =>
        `<div class="stat-card"><span class="stat-icon">${icon}</span><div><div class="stat-number">${count}</div><div class="stat-label">${label}</div></div></div>`,
    )
    .join("");
}
function renderRecords() {
  const records = visibleRecords();
  $("#result-count").textContent = `${records.length} 家私藏好店`;
  foodMap.setRecords(records);
  if (!records.length) {
    const filtered = state.records.length > 0;
    $("#records").innerHTML =
      `<div class="empty-state"><span class="empty-figure">${filtered ? "🍡" : "🥟"}</span><h3>${filtered ? "换个关键词，再找找" : "第一口快乐，由你来记"}</h3><p>${filtered ? "试试店名、口味，或那道想吃的菜。" : "拍张照，写下那道让你想再来的菜。<br>你的私藏美食地图，就从这里开始。"}</p><button class="button primary" id="empty-add">＋ 记一家好吃的</button></div>`;
    $("#empty-add").onclick = () => editor.open();
    return;
  }
  $("#records").innerHTML = records
    .map(
      (record) =>
        `<article class="record-card" data-record="${record.id}" tabindex="0" role="button" aria-label="查看${escape(record.name)}"><div class="record-top">${record.photos.length ? `<img class="record-cover" src="${escape(record.photos[0])}" alt="${escape(record.name)}">` : `<div class="record-cover">${{ 粤菜: "🥘", 火锅: "🍲", 面馆: "🍜", 小吃: "🥟", 咖啡甜品: "🍮" }[record.category] || "🍽️"}</div>`}<div><h3 class="record-title">${escape(record.name)}</h3><div class="record-meta">${escape(record.category)}${record.tags.length ? " · " + escape(record.tags.slice(0, 2).join(" / ")) : ""}</div></div></div><div class="record-dishes">${record.dishes.length ? "推荐 " + escape(record.dishes.map((dish) => dish.name).join(" · ")) : escape(record.note || "再来一次，补上你的招牌菜清单")}</div><div class="record-bottom"><span class="distance">⌖ ${state.origin ? domain.formatDistance(record.meters) : "设置位置看距离"}${state.origin ? "<small>直线</small>" : ""}</span><span class="like-badge"><span class="like-gem level-${record.likeLevel}">◆</span>${domain.likeLabel(record.likeLevel)}</span></div></article>`,
    )
    .join("");
  $("#records")
    .querySelectorAll("[data-record]")
    .forEach((card) => {
      card.onclick = () => openDetail(card.dataset.record);
      card.onkeydown = (event) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          openDetail(card.dataset.record);
        }
      };
    });
}
function renderProfiles() {
  $("#profile-switch")
    .querySelectorAll("[data-profile]")
    .forEach((button) =>
      button.classList.toggle(
        "selected",
        button.dataset.profile === state.profile,
      ),
    );
  for (const profile of state.profiles)
    $("#" + profile.id + "-name").textContent = profile.nickname;
  const label = state.profile === "zelda" ? "小公主" : "小勇者";
  $("#hero-character").style.backgroundImage =
    `url('/assets/${state.profile === "zelda" ? "princess" : "hero"}-moods.jpg')`;
  $("#hero-character").setAttribute("aria-label", "开心的" + label);
}
async function loadRecords() {
  const profile = state.profile;
  try {
    const result = await request("/api/records?profile=" + profile);
    if (profile !== state.profile) return;
    state.records = result.records;
    renderStats();
    renderRecords();
    $("#storage-status").textContent = "已连接 · 保存在本机";
  } catch (error) {
    toast(error.message);
    $("#storage-status").textContent = "本机服务连接失败";
    $("#records").innerHTML =
      '<div class="empty-state"><span class="empty-figure">🍂</span><h3>暂时没翻开美食手帐</h3><p>确认本地服务正在运行，再试一次。</p><button class="button subtle" id="retry-load">重新加载</button></div>';
    $("#retry-load").onclick = loadRecords;
  }
}
function photoGallery(photos) {
  return `<div class="detail-photos">${photos.map((url) => `<img src="${escape(url)}" alt="美食记忆照片" data-photo="${escape(url)}">`).join("")}</div>`;
}
function renderDetail(record) {
  if (!record) return;
  const meters = domain.distance(state.origin, record);
  $("#detail-content").innerHTML =
    `<div class="drawer-inner"><div class="drawer-heading"><div><p class="eyebrow">我的私藏 · 美食记忆</p><h2>这一口，值得记住</h2></div><button class="close-button" data-close="detail-dialog" aria-label="关闭详情">×</button></div>
    <div class="detail-hero"><span class="little-label">${escape(record.category)}</span><h2>${escape(record.name)}</h2><div class="detail-mood">${mood(state.profile, record.likeLevel)}<div><strong>${domain.likeLabel(record.likeLevel)}</strong><div class="record-meta" style="margin-top:5px">${levelsForDetail(record.likeLevel)}</div></div></div><div class="detail-address">📍 ${escape(record.address || "地址还没填写，位置已记在地图上")}</div><div class="tag-row">${record.tags.map((tag) => `<span class="tag">${escape(tag)}</span>`).join("")}</div></div>
    <div class="distance-card"><div class="distance-large">${meters === null ? "待定位" : domain.formatDistance(meters)}<span>直线距离</span></div><p class="distance-note">${meters === null ? "在主地图定位或手动设置你的位置，即可看到距离。" : "根据你设置的位置计算，实际到店路程会因道路和绕行而变化。"}</p><button class="button tiny" id="see-on-map" style="margin-top:13px">⌖ 在地图上看看</button></div>
    ${record.note ? `<div class="field-group note-group"><h3>口味小纸条 ✎</h3><p class="detail-note">${escape(record.note)}</p></div>` : ""}
    ${record.photos.length ? `<div class="form-section-title">这一餐的记忆 📷</div>${photoGallery(record.photos)}` : ""}
    <div class="form-section-title">念念不忘的菜 🥢</div>${record.dishes.length ? record.dishes.map((dish) => `<div class="field-group"><div class="detail-dish-title"><span>${escape(dish.name)}</span><span class="price">${escape(dish.price)}</span></div>${dish.note ? `<div class="detail-dish-note">${escape(dish.note)}</div>` : ""}${dish.photos.length ? photoGallery(dish.photos) : ""}</div>`).join("") : '<p class="detail-dish-note">下次再来，记下那道最喜欢的菜吧。</p>'}
    ${record.menuPhotos.length ? `<div class="form-section-title">菜单小档案 📋</div>${photoGallery(record.menuPhotos)}` : ""}
    <p class="detail-dish-note">记于 ${new Date(record.createdAt).toLocaleDateString("zh-CN")} · ${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}</p>
    <div class="button-row"><button class="button primary" id="edit-record">✎ 编辑这份记忆</button><button class="button subtle" id="delete-record">删除</button></div></div>`;
  $("#detail-content").querySelector("[data-close]").onclick = () =>
    $("#detail-dialog").close();
  $("#detail-content")
    .querySelectorAll("[data-photo]")
    .forEach((image) => (image.onclick = () => showPhoto(image.dataset.photo)));
  $("#edit-record").onclick = () => {
    $("#detail-dialog").close();
    editor.open(record);
  };
  $("#see-on-map").onclick = () => {
    $("#detail-dialog").close();
    changeView("map");
    foodMap.showConnection(state.origin, record);
  };
  $("#delete-record").onclick = async () => {
    const dialog = $("#confirm-dialog");
    dialog.returnValue = "";
    dialog.showModal();
    dialog.addEventListener(
      "close",
      async () => {
        if (dialog.returnValue !== "delete") return;
        try {
          await request("/api/records/" + record.id, {
            method: "DELETE",
            body: JSON.stringify({
              profile: state.profile,
              version: record.version,
            }),
          });
          localStorage.removeItem(
            "food-local-draft-" + state.profile + "-" + record.id,
          );
          $("#detail-dialog").close();
          foodMap.clearConnection();
          await loadRecords();
          toast("这份记忆已移除");
        } catch (error) {
          toast(error.message);
        }
      },
      { once: true },
    );
  };
}
function levelsForDetail(level) {
  return ["吃到一颗小惊喜", "下次还想再来", "举起宝石，开心到笑"][level - 1];
}
function openDetail(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  state.detailId = id;
  renderDetail(record);
  if (!$("#detail-dialog").open) $("#detail-dialog").showModal();
}
function changeView(view) {
  state.view = view;
  document.body.classList.toggle("is-memories", view === "memories");
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === view),
    );
  $("#page-title").textContent =
    view === "memories" ? "我的食光，慢慢收藏。" : "把好吃的，圈进小地图。";
  $("#list-title").textContent =
    view === "memories" ? "我的美食收藏" : "附近的快乐";
  if (view === "map") setTimeout(() => foodMap.map.invalidateSize(), 30);
}
$("#categories").innerHTML = categories
  .map(
    (category) =>
      `<button class="chip ${category === "全部" ? "active" : ""}" data-category="${category}">${category === "全部" ? "全部美味" : category}</button>`,
  )
  .join("");
$("#categories")
  .querySelectorAll("button")
  .forEach(
    (button) =>
      (button.onclick = () => {
        state.category = button.dataset.category;
        $("#categories")
          .querySelectorAll("button")
          .forEach((choice) =>
            choice.classList.toggle("active", choice === button),
          );
        renderRecords();
      }),
  );
$("#search").oninput = (event) => {
  state.query = event.target.value;
  renderRecords();
};
for (const id of ["add-record", "hero-add"])
  $("#" + id).onclick = () => editor.open();
$("#locate").onclick = locate;
$("#pick-origin").onclick = () => setPicking(!state.pickingOrigin);
$("#cancel-origin").onclick = () => setPicking(false);
$("#reset-map").onclick = () => foodMap.reset();
$("#profile-switch")
  .querySelectorAll("button")
  .forEach(
    (button) =>
      (button.onclick = async () => {
        if (state.profile === button.dataset.profile) return;
        state.profile = button.dataset.profile;
        state.records = [];
        state.query = "";
        $("#search").value = "";
        localStorage.setItem("food-local-profile", state.profile);
        foodMap.clearConnection();
        renderProfiles();
        renderStats();
        renderRecords();
        await loadRecords();
      }),
  );
document
  .querySelectorAll("[data-view]")
  .forEach(
    (button) => (button.onclick = () => changeView(button.dataset.view)),
  );
document
  .querySelectorAll("[data-close]")
  .forEach(
    (button) => (button.onclick = () => $("#" + button.dataset.close).close()),
  );
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "k") {
    event.preventDefault();
    $("#search").focus();
  }
});
window.addEventListener("beforeunload", () => {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
});
renderProfiles();
renderStats();
if (state.origin) setOrigin(state.origin, state.origin.source || "手动选点");
request("/api/status")
  .then((result) => {
    state.profiles = result.profiles;
    renderProfiles();
  })
  .catch((error) => toast(error.message));
await loadRecords();
