import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const srs = require("../js/srs.js");

test("new card starts as new and is not due", () => {
  const c = srs.newCard("2026-11-26");
  assert.equal(c.status, "new");
  assert.equal(c.interval, 0);
  assert.equal(c.ease, 2.5);
  assert.equal(srs.isDue(c, "2026-11-26"), false);
});

test("again resets interval, lowers ease and is due today", () => {
  const c = srs.schedule({ ...srs.newCard("2026-11-26"), reps: 5, interval: 30, ease: 2.8 }, "again", "2026-11-26");
  assert.equal(c.interval, 0);
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.due, "2026-11-26");
  assert.ok(c.ease < 2.8);
  assert.equal(srs.isDue(c, "2026-11-26"), true);
});

test("good progresses 1, 3, then ease-scaled", () => {
  const day = "2026-11-26";
  let c = srs.newCard(day);
  c = srs.schedule(c, "good", day);
  assert.equal(c.interval, 1);
  assert.equal(c.due, "2026-11-27");
  c = srs.schedule(c, "good", "2026-11-27");
  assert.equal(c.interval, 3);
  c = srs.schedule(c, "good", "2026-11-30");
  assert.equal(c.interval, 8);
  assert.equal(c.status, "learning");
});

test("easy intervals are longer than good and capped", () => {
  const day = "2026-11-26";
  const hard = srs.schedule({ ...srs.newCard(day), interval: 10, reps: 4, ease: 2.5 }, "hard", day);
  const good = srs.schedule({ ...srs.newCard(day), interval: 10, reps: 4, ease: 2.5 }, "good", day);
  const easy = srs.schedule({ ...srs.newCard(day), interval: 10, reps: 4, ease: 2.5 }, "easy", day);
  assert.ok(hard.interval <= good.interval);
  assert.ok(good.interval < easy.interval);
  assert.ok(easy.interval <= 365);
});

test("mature cards become review status", () => {
  const c = srs.schedule({ ...srs.newCard("2026-11-26"), interval: 18, reps: 6, ease: 2.5 }, "good", "2026-11-26");
  assert.ok(c.interval >= 21);
  assert.equal(c.status, "review");
});

test("dueCards only returns scheduled due cards", () => {
  const today = "2026-12-01";
  const vocab = {
    alpha: { ...srs.newCard("2026-11-01"), status: "learning", interval: 3, due: "2026-11-30" },
    beta: { ...srs.newCard("2026-11-01"), status: "learning", interval: 3, due: "2026-12-05" },
    gamma: srs.newCard("2026-11-01")
  };
  const due = srs.dueCards(vocab, today);
  assert.deepEqual(due.map((x) => x.word), ["alpha"]);
  assert.equal(srs.counts(vocab, today).due, 1);
});

test("addDays handles month and year boundaries", () => {
  assert.equal(srs.addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(srs.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(srs.addDays("2026-03-01", -1), "2026-02-28");
});
