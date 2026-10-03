/* ClaimDataCare tests • shared test data (fictitious people only, no real PHI). */
'use strict';
const PASS = {
  owner: 'Owner#Strong2026!',
  biller: 'Biller#Strong2026!',
  minor: 'Minor#Strong2026!',
  nodob: 'NoDob#Strong2026!'
};
const USERS = [
  { id: 'usr-superadmin', email: 'owner@imbs.test', role: 'Super Admin', first: 'Test', last: 'Owner', name: 'test.owner', ownerAccount: true, dob: '1980-05-05', firebaseUid: 'uid-owner@imbs.test', providerId: 'p1' },
  { id: 'u-biller', email: 'biller@clinic.test', role: 'Biller', first: 'Bea', last: 'Biller', name: 'bea.biller', dob: '1990-02-02', firebaseUid: 'uid-biller@clinic.test', providerId: 'p1', permissions: [] },
  { id: 'u-minor', email: 'minor@clinic.test', role: 'Biller', first: 'Young', last: 'User', name: 'young.user', dob: '2012-01-01', firebaseUid: 'uid-minor@clinic.test', providerId: 'p1' },
  { id: 'u-nodob', email: 'nodob@clinic.test', role: 'Biller', first: 'Nora', last: 'Nodob', name: 'nora.nodob', firebaseUid: 'uid-nodob@clinic.test', providerId: 'p1' },
  { id: 'u-off', email: 'off@clinic.test', role: 'Biller', first: 'Ivan', last: 'Inactive', name: 'ivan.inactive', dob: '1985-01-01', status: 'inactive', inactive: true, providerId: 'p1' }
];
const ACCOUNTS = {
  'owner@imbs.test': PASS.owner, 'biller@clinic.test': PASS.biller,
  'minor@clinic.test': PASS.minor, 'nodob@clinic.test': PASS.nodob, 'off@clinic.test': 'Off#Strong2026!x'
};
function seed(extra) {
  const base = {
    meta: { users: { list: JSON.parse(JSON.stringify(USERS)) } },
    providers: { p1: { id: 'p1', name: 'Test Behavioral Health LLC', npi: '1234567893', specialties: ['Behavioral Health'], updatedAt: 1 } },
    patients: {
      pa: { id: 'pa', providerId: 'p1', acct: '1001', last: 'Doe', first: 'Jane', dob: '1975-03-04', sex: 'F', addr1: '100 MAIN ST', city: 'MIAMI', state: 'FL', zip: '33130', phone: '3055550101', insurances: [], updatedAt: 1 },
      px: { id: 'px', providerId: 'p1', acct: '1002', last: 'Roe"><img src=x onerror=window.__pwned=1>', first: '<svg onload=window.__pwned=2>', dob: '1980-01-01', payerName: '<b onmouseover=x>Aetna', notes: 'BP < 120 and HR > 100', insurances: [], updatedAt: 1 }
    },
    claims: {}
  };
  return Object.assign(base, extra || {});
}
module.exports = { PASS, USERS, ACCOUNTS, seed };
