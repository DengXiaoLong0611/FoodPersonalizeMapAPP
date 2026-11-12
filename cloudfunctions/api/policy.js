function assertOwner(record, openid) {
  if (!record || record._openid !== openid)
    throw Object.assign(new Error("记录不存在或无权访问"), {
      definitive: true,
    });
}
function assertVersion(record, version) {
  if ((record.version || 1) !== version)
    throw Object.assign(new Error("记录已在其他设备更新，请重新打开后编辑"), {
      definitive: true,
    });
}
function routeParams(mode, from, to) {
  if (!["walking", "bicycling", "driving", "transit"].includes(mode))
    throw new Error("交通方式无效");
  for (const point of [from, to]) {
    if (
      !point ||
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      Math.abs(point.latitude) > 90 ||
      Math.abs(point.longitude) > 180
    )
      throw new Error("请先获取有效定位");
  }
  return new URLSearchParams({
    from: from.latitude + "," + from.longitude,
    to: to.latitude + "," + to.longitude,
  });
}
module.exports = { assertOwner, assertVersion, routeParams };
