function distance(a, b) {
  if (
    !a ||
    !b ||
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(b.latitude) ||
    !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.longitude)
  )
    return null;
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h))));
}
function photos(r) {
  return [
    ...new Set([
      ...(r.photos || []),
      ...(r.menuPhotos || []),
      ...(r.dishes || []).reduce((all, d) => all.concat(d.photos || []), []),
    ]),
  ];
}
function validate(r) {
  const name = String(r.name || "").trim();
  if (!name || name.length > 60) throw new Error("请填写 1～60 字的店名");
  if (
    !Number.isFinite(r.latitude) ||
    !Number.isFinite(r.longitude) ||
    r.latitude < 18 ||
    r.latitude > 54 ||
    r.longitude < 73 ||
    r.longitude > 136
  )
    throw new Error("请在地图选择有效的店铺位置");
  if (photos(r).length > 30) throw new Error("每家店最多保存 30 张照片");
  const dishes = (r.dishes || [])
    .filter((d) => String(d.name || "").trim())
    .slice(0, 30)
    .map((d) => ({
      id: String(d.id || ""),
      name: String(d.name).trim().slice(0, 60),
      price: String(d.price || "").slice(0, 20),
      note: String(d.note || "").slice(0, 500),
      photos: (d.photos || []).slice(0, 3),
    }));
  return {
    name,
    address: String(r.address || "").slice(0, 200),
    latitude: r.latitude,
    longitude: r.longitude,
    category: String(r.category || "其他").slice(0, 20),
    tags: (r.tags || []).slice(0, 8).map((t) => String(t).slice(0, 20)),
    rating: Math.max(1, Math.min(5, Number(r.rating) || 5)),
    note: String(r.note || "").slice(0, 3000),
    photos: (r.photos || []).slice(0, 9),
    menuPhotos: (r.menuPhotos || []).slice(0, 9),
    dishes,
  };
}
function arrival(seconds, now = new Date()) {
  const date = new Date(now.getTime() + seconds * 1000);
  return (
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0")
  );
}
function formatDistance(m) {
  return m === null
    ? "待定位"
    : m < 1000
      ? m + " m"
      : (m / 1000).toFixed(1) + " km";
}
module.exports = { distance, photos, validate, arrival, formatDistance };
