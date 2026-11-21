// Application tests must inject a mock transport. Fail before sending any packet.
const net = require("node:net");
net.Socket.prototype.connect = function () { throw new Error("OUTBOUND_NETWORK_DISABLED_IN_TESTS"); };
globalThis.fetch = async function () { throw new Error("OUTBOUND_NETWORK_DISABLED_IN_TESTS"); };
