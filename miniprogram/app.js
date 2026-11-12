const config = require("./config");
App({
  globalData: { config },
  onLaunch() {
    if (wx.cloud)
      wx.cloud.init({ env: config.env || undefined, traceUser: true });
  },
});
