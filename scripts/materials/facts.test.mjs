// npm run materials:test: the facts stage's pure parts (node:test, no deps, no network).
import assert from "node:assert/strict";
import { test } from "node:test";
import { groundEstimate, toMaterial, validateFacts, validateLibrary } from "./convert.mjs";
import { compactResults, linksOf } from "./facts.mjs";

const estimate = {
  width_m: 0.8,
  height_m: 1.6,
  archetype: "tall-narrow",
  taper: 1,
  density_kg_per_l: 0.3,
  surface_roughness: 0.5,
};
const facts = (patch) => ({
  side_width_m: null,
  side_height_m: null,
  weight_kg: null,
  fact: "A typical fridge is about 1.8 m tall and weighs around 90 kg.",
  source: null,
  ...patch,
});

test("search results are reduced to text: answer box, panel strings, top 5 snippets", () => {
  const out = compactResults({
    answer_box: { title: "Fridge size", answer: "70 inches", link: "https://a.example/x", thumbnail: "img" },
    knowledge_graph: { title: "Refrigerator", height: "1.8 m", header_images: [{}], kgmid: "/m/1", source_link: "x" },
    organic_results: Array.from({ length: 8 }, (_, i) => ({ title: `r${i}`, link: `https://r${i}.example`, snippet: "s" })),
    images_results: [{}],
  });
  assert.equal(out.answerBox.answer, "70 inches");
  assert.equal(out.answerBox.thumbnail, undefined);
  assert.deepEqual(out.knowledgePanel, { title: "Refrigerator", height: "1.8 m" });
  assert.equal(out.results.length, 5);
  assert.deepEqual(linksOf({ ...out }).slice(0, 2), ["https://a.example/x", "https://r0.example"]);
});

test("facts validation drops a source that wasn't in the results and rejects nonsense", () => {
  const links = ["https://ok.example"];
  assert.equal(validateFacts(facts({ source: "https://made-up.example" }), links).facts.source, null);
  assert.equal(validateFacts(facts({ source: "https://ok.example" }), links).facts.source, "https://ok.example");
  assert.equal(validateFacts(facts({ side_height_m: 900 }), links).ok, false);
  assert.equal(validateFacts(facts({ weight_kg: -1 }), links).ok, false);
  assert.equal(validateFacts(facts({ fact: "short" }), links).ok, false);
  assert.equal(validateFacts(facts({ fact: "x".repeat(200) }), links).ok, false);
  assert.equal(validateFacts(facts({ fact: "Line one\nline two of the fact." }), links).facts.fact, "Line one line two of the fact.");
});

test("a search size corrects the estimate", () => {
  const both = groundEstimate(estimate, facts({ side_width_m: 0.7, side_height_m: 1.8 }));
  assert.equal(both.sizeCheck, "corrected");
  assert.deepEqual([both.estimate.width_m, both.estimate.height_m], [0.7, 1.8]);
  // Height only: scale uniformly, keeping the estimate's proportions.
  const one = groundEstimate(estimate, facts({ side_height_m: 2 }));
  assert.equal(one.estimate.height_m, 2);
  assert.equal(one.estimate.width_m, 1);
});

test("a search size that agrees confirms, one that's wildly off is ignored, none leaves it unchecked", () => {
  assert.equal(groundEstimate(estimate, facts({ side_height_m: 1.65 })).sizeCheck, "confirmed");
  const off = groundEstimate(estimate, facts({ side_height_m: 16 }));
  assert.equal(off.sizeCheck, "unchecked");
  assert.equal(off.estimate, estimate);
  assert.equal(groundEstimate(estimate, facts()).sizeCheck, "unchecked");
});

test("an item built with facts uses the real size and carries the fact", () => {
  const plain = toMaterial("Refrigerator", estimate);
  const item = toMaterial("Refrigerator", estimate, undefined, facts({ side_height_m: 1.8, source: "https://ok.example" }));
  assert.equal(plain.fact, undefined);
  assert.equal(item.shape.height, 1.8);
  assert.deepEqual(item.fact, {
    text: "A typical fridge is about 1.8 m tall and weighs around 90 kg.",
    source: "https://ok.example",
    sizeCheck: "corrected",
  });
  assert.deepEqual(validateLibrary([item]), []);
  assert.notDeepEqual(validateLibrary([{ ...item, fact: { text: "", sizeCheck: "maybe" } }]), []);
});
