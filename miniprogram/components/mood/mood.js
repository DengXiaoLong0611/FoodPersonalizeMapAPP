Component({
  properties: {
    level: { type: Number, value: 3 },
    character: { type: String, value: "link" },
    compact: { type: Boolean, value: false },
    showLabel: { type: Boolean, value: true },
  },
  data: {
    assets: { link: "", zelda: "" },
    labels: ["有点喜欢", "很喜欢", "超级喜欢"],
  },
});
