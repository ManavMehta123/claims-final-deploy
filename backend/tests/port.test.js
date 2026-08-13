const test = require('node:test');
const assert = require('node:assert/strict');
const { getPortCandidates } = require('../src/config/port');

test('builds a fallback port list when the primary port is busy', () => {
  const ports = getPortCandidates(5000, [5001, 5002, 5003]);
  assert.deepStrictEqual(ports, [5000, 5001, 5002, 5003]);
});
