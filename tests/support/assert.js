/* Tiny assertions with readable Spanish-free messages for the report. */
'use strict';
const assert = require('assert');
module.exports = {
  eq: (a, b, msg) => assert.deepStrictEqual(a, b, (msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)),
  ok: (v, msg) => assert.ok(v, msg || 'expected truthy, got ' + JSON.stringify(v)),
  no: (v, msg) => assert.ok(!v, msg || 'expected falsy, got ' + JSON.stringify(v)),
  has: (s, sub, msg) => assert.ok(String(s).includes(sub), (msg ? msg + ': ' : '') + JSON.stringify(String(s).slice(0, 200)) + ' does not contain ' + JSON.stringify(sub)),
  noErrors: (errors, msg) => assert.deepStrictEqual(errors, [], (msg ? msg + ': ' : '') + 'page errors: ' + JSON.stringify(errors))
};
