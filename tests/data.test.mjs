import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function loadData(rel) {
  const file = path.join(root, rel);
  assert.ok(fs.existsSync(file), `missing ${rel}`);
  const win = { EXAM_DATA: { papers: {} } };
  const sandbox = { window: win, EXAM_DATA: win.EXAM_DATA };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: rel, displayErrors: false });
  return win.EXAM_DATA;
}

test("meta has all 29 English One papers", () => {
  const data = loadData("data/meta.js");
  assert.equal(data.meta.counts.papers, 29);
  assert.equal(data.meta.counts.questions, 1240);
  const years = Array.from(data.meta.papers, (p) => p.year);
  assert.deepEqual(years, Array.from({ length: 29 }, (_, i) => 2026 - i));
  assert.equal(new Set(data.meta.papers.map((p) => p.id)).size, 29);
});

test("2026 paper has 45 questions and every answer", () => {
  const data = loadData("data/papers/2026-english-one.js");
  const paper = data.papers["2026-english-one"];
  assert.ok(paper);
  assert.equal(paper.questionCount, 45);
  assert.equal(paper.objectiveCount, 45);
  const questions = paper.parts.flatMap((p) => p.questions || []);
  assert.equal(questions.length, 45);
  for (const q of questions) {
    assert.match(String(q.answer || ""), /^[A-H]$/, `question ${q.n} answer`);
  }
  assert.equal(paper.parts.find((p) => p.kind === "ordering").questions.length, 5);
  assert.equal(paper.parts.find((p) => p.kind === "reading").questions.length, 5);
});

test("old paper has 30 questions and translation part", () => {
  const data = loadData("data/papers/1998.js");
  const paper = data.papers["1998"];
  assert.equal(paper.questionCount, 30);
  assert.equal(paper.objectiveCount, 30);
  assert.ok(paper.parts.some((p) => p.kind === "translation"));
  assert.ok(paper.parts.some((p) => p.kind === "writing"));
});

function tableAnswers(paper) {
  const out = {};
  const re = /(?<!\d)(\d{1,2})\s*[=:：]?\s*([A-H])(?![A-Za-z])/g;
  for (const text of Object.values(paper.answerTable || {})) {
    let m;
    while ((m = re.exec(String(text)))) out[Number(m[1])] = m[2];
  }
  return out;
}

test("paper answer table agrees with question answers", () => {
  for (const id of ["1998", "2005", "2012-english-one", "2026-english-one"]) {
    const data = loadData(`data/papers/${id}.js`);
    const paper = data.papers[id];
    const table = tableAnswers(paper);
    for (const part of paper.parts) {
      for (const q of part.questions || []) {
        assert.equal(q.answer, table[q.n], `${id} q${q.n}`);
      }
    }
  }
});
