/**
 * lib/phone.test.ts — the repeat-customer rule, tested against the shapes the
 * customers table actually holds.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { formatForStorage, normalizeSgPhone, phoneMatchKey, samePhone } from "@/lib/phone";

test("every spelling of a Singapore number matches every other", () => {
  const spellings = [
    "91234567",
    "9123 4567",
    "9123-4567",
    " 91234567 ",
    "6591234567",
    "+6591234567",
    "+65 9123 4567",
    "65 9123-4567",
  ];

  for (const spelling of spellings) {
    assert.equal(phoneMatchKey(spelling), "91234567", spelling);
  }
  assert.ok(samePhone("9123 4567", "+6591234567"));
});

test("the messy numbers already in the customers table normalise", () => {
  // Verbatim from the table.
  assert.equal(phoneMatchKey("93233050 "), "93233050");
  assert.equal(phoneMatchKey(" 97513566"), "97513566");
  assert.equal(phoneMatchKey("8590 5930"), "85905930");
  assert.equal(phoneMatchKey("97433005"), "97433005");
});

test("different numbers do not match", () => {
  assert.equal(samePhone("91234567", "91234568"), false);
  assert.equal(samePhone("91234567", null), false);
  assert.equal(samePhone(null, null), false);
  assert.equal(samePhone("", "91234567"), false);
});

test("an overseas number keeps its country code and cannot collide", () => {
  const uk = normalizeSgPhone("+44 7700 900123");
  assert.equal(uk?.isSingapore, false);
  assert.equal(uk?.matchKey, "447700900123");
  assert.equal(uk?.e164, "+447700900123");
  // A UK number ending in the same 8 digits is still a different customer.
  assert.equal(samePhone("+4400900123", "00900123"), false);
});

test("a fragment too short to identify anyone is refused", () => {
  assert.equal(phoneMatchKey("1234"), null);
  assert.equal(phoneMatchKey("123"), null);
  assert.equal(phoneMatchKey(""), null);
  assert.equal(phoneMatchKey(null), null);
});

test("only 8-digit numbers starting 3, 6, 8 or 9 are treated as Singaporean", () => {
  assert.equal(normalizeSgPhone("91234567")?.isSingapore, true);
  assert.equal(normalizeSgPhone("61234567")?.isSingapore, true);
  assert.equal(normalizeSgPhone("31234567")?.isSingapore, true);
  assert.equal(normalizeSgPhone("81234567")?.isSingapore, true);
  assert.equal(normalizeSgPhone("11234567")?.isSingapore, false);
  assert.equal(normalizeSgPhone("912345678")?.isSingapore, false);
});

test("storage keeps the local form the office is used to reading", () => {
  assert.equal(formatForStorage("+65 9123 4567"), "91234567");
  assert.equal(formatForStorage("9123 4567"), "91234567");
  assert.equal(formatForStorage("+44 7700 900123"), "+447700900123");
  assert.equal(formatForStorage(""), null);
});
