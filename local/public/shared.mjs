export const domain = window.FoodDomain;
export const categories = [
  "全部",
  "粤菜",
  "火锅",
  "面馆",
  "小吃",
  "咖啡甜品",
  "其他",
];
export const levels = [
  { id: 1, label: "有点喜欢", note: "吃到一颗小惊喜" },
  { id: 2, label: "很喜欢", note: "下次还想再来" },
  { id: 3, label: "超级喜欢", note: "举起宝石，开心到笑" },
];
export function escape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}
export function mood(profile, level, extraClass = "") {
  const image = profile === "zelda" ? "princess-moods" : "hero-moods";
  return `<div class="mood-portrait ${extraClass}" role="img" aria-label="${domain.likeLabel(level)}的${profile === "zelda" ? "小公主" : "小勇者"}" style="background-image:url('/assets/${image}.jpg');background-position:${(level - 1) * 50}% 0"></div>`;
}
export async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "X-Food-Map": "local",
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(body.error || "操作失败，请重试"), {
      status: response.status,
    });
  return body;
}
let toastTimer;
export function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.hidden = false;
  if (element.showPopover && !element.matches(":popover-open"))
    element.showPopover();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (element.hidePopover) element.hidePopover();
    element.hidden = true;
  }, 4200);
}
export function showPhoto(url) {
  document.querySelector("#large-photo").src = url;
  document.querySelector("#photo-dialog").showModal();
}
