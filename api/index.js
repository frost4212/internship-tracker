const { createApp } = require("../server");

module.exports = createApp({
    appId: process.env.APP_ID,
    appKey: process.env.APP_KEY,
});