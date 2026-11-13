import { escape } from "./shared.mjs";
const L = window.L;
export function createMap(
  element,
  {
    center = [22.553, 114.065],
    zoom = 12,
    onClick,
    onRecord,
    onTileError,
  } = {},
) {
  const map = L.map(element, { zoomControl: true }).setView(center, zoom);
  const tiles = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles © Esri, HERE, Garmin, OpenStreetMap contributors",
      maxZoom: 18,
    },
  ).addTo(map);
  const markers = L.layerGroup().addTo(map);
  let originMarker;
  let line;
  let failures = 0;
  let successes = 0;
  let districtData;
  let offlineLayer;
  let loadingOffline = false;
  let destroyed = false;
  async function offline() {
    if (offlineLayer || loadingOffline || destroyed) return;
    loadingOffline = true;
    try {
      districtData =
        districtData ||
        (await fetch("/data/shenzhen.json").then((response) =>
          response.json(),
        ));
      if (destroyed) return;
      offlineLayer = L.geoJSON(districtData, {
        style: {
          color: "#b4bd9d",
          weight: 1.5,
          fillColor: "#e2e7cf",
          fillOpacity: 0.6,
        },
        onEachFeature(feature, layer) {
          layer.bindTooltip(feature.properties.name, {
            permanent: true,
            direction: "center",
            className: "district-label",
          });
        },
      }).addTo(map);
      offlineLayer.bringToBack();
      if (onTileError) onTileError();
    } catch (error) {
      console.warn("深圳轮廓加载失败", error);
    } finally {
      loadingOffline = false;
    }
  }
  tiles.on("tileerror", () => {
    failures++;
    if (failures >= 3 && successes === 0) offline();
  });
  tiles.on("tileload", () => {
    successes++;
  });
  const fallbackTimer = setTimeout(() => {
    if (successes === 0) offline();
  }, 6500);
  map.on("click", (event) => {
    if (onClick)
      onClick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
  });
  function shopIcon(level) {
    return L.divIcon({
      className: "shop-map-pin",
      html: `<div class="pin-shape"><span>${level === 3 ? "♥" : "◆"}</span></div>`,
      iconSize: [32, 40],
      iconAnchor: [16, 36],
      popupAnchor: [0, -32],
    });
  }
  return {
    map,
    setRecords(records) {
      markers.clearLayers();
      for (const record of records) {
        const marker = L.marker([record.latitude, record.longitude], {
          icon: shopIcon(record.likeLevel),
        }).addTo(markers);
        const content = document.createElement("div");
        content.innerHTML = `<strong>${escape(record.name)}</strong><br><span>${escape(record.address || record.category)}</span><br><button class="button tiny">翻开美食记忆 →</button>`;
        content
          .querySelector("button")
          .addEventListener("click", () => onRecord && onRecord(record.id));
        marker.bindPopup(content);
      }
    },
    setOrigin(position, pan = false) {
      if (originMarker) map.removeLayer(originMarker);
      if (!position) return;
      originMarker = L.marker([position.latitude, position.longitude], {
        icon: L.divIcon({ className: "origin-dot", iconSize: [17, 17] }),
      })
        .addTo(map)
        .bindTooltip("我的位置");
      if (pan)
        map.setView(
          [position.latitude, position.longitude],
          Math.max(map.getZoom(), 13),
        );
    },
    showConnection(origin, record) {
      if (line) map.removeLayer(line);
      if (!origin) {
        map.setView([record.latitude, record.longitude], 15);
        return;
      }
      line = L.polyline(
        [
          [origin.latitude, origin.longitude],
          [record.latitude, record.longitude],
        ],
        { color: "#c98099", dashArray: "7 8", weight: 2 },
      ).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [65, 65], maxZoom: 16 });
    },
    clearConnection() {
      if (line) {
        map.removeLayer(line);
        line = null;
      }
    },
    reset() {
      map.setView([22.553, 114.065], 12);
    },
    destroy() {
      destroyed = true;
      clearTimeout(fallbackTimer);
      map.remove();
    },
  };
}
