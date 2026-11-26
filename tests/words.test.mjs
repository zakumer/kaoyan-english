import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");

function load(files) {
  const sandbox = { EXAM_DATA: {}, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of files) {
    const code = fs.readFileSync(path.join(DATA, file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox.EXAM_DATA;
}

const data = load(["words-index.js", "word-order.js", "word-meta.js", "word-details.js"]);

test("word library has the expected 931 + 217 scope", () => {
  assert.equal(data.wordMeta.total, 1148);
  assert.equal(data.wordMeta.syllabus, 931);
  assert.equal(data.wordMeta.over, 217);
  assert.equal(Object.keys(data.words).length, 1148);
  assert.equal(data.wordOrder.length, 1148);
  assert.equal(new Set(data.wordOrder).size, 1148);
});

test("every index entry is usable offline", () => {
  const missing = [];
  for (const [word, item] of Object.entries(data.words)) {
    assert.equal(item.word, word);
    assert.ok(item.gloss, `${word} missing gloss`);
    assert.ok(Array.isArray(item.lists) && item.lists.length, `${word} missing list`);
    assert.ok(item.sourceUrl.startsWith("https://english-exam.lazynote.cn/"), `${word} source`);
    if (!item.ipa) missing.push(word);
  }
  assert.ok(missing.length <= 8, `too many words without IPA: ${missing.slice(0, 10).join(", ")}`);
});

test("details are English One focused and non-empty", () => {
  assert.equal(Object.keys(data.wordDetails).length, 1148);
  let examples = 0;
  let englishTwo = 0;
  for (const [word, detail] of Object.entries(data.wordDetails)) {
    assert.ok(Array.isArray(detail.examples), `${word} examples`);
    assert.ok(Array.isArray(detail.senses), `${word} senses`);
    examples += detail.examples.length;
    for (const ex of detail.examples) {
      assert.ok(ex.text, `${word} example text`);
      assert.ok(ex.translation, `${word} example translation`);
      if ((ex.badge || "").includes("英语二") || (ex.links?.paper || "").includes("english-two")) englishTwo++;
    }
    assert.equal(data.words[word].exampleCount, detail.examples.length, `${word} exampleCount`);
  }
  assert.ok(examples > 4000, `too few examples: ${examples}`);
  assert.equal(englishTwo, 0);
});

test("word order is stable and syllabus first", () => {
  const first = data.words[data.wordOrder[0]];
  assert.ok(first);
  const last = data.words[data.wordOrder[data.wordOrder.length - 1]];
  assert.ok(last);
  assert.equal(first.rank, 1);
});
