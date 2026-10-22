// North star 那一段字：[ ] 里的词就是 North star 目标；存的时候对上原来的目标（改措辞不丢链接），没了的删掉，新的建上
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../js/goals.js";

test("framed words are read in order; empty, unclosed and multi-line brackets don't count", () => {
  const p = G.parseNorth("Live [ by the sea ] with [a calm mind]. [] [half\nline] [unclosed and [ok]");
  assert.deepEqual(p.map((x) => x.text), ["by the sea", "a calm mind", "ok"]);
  assert.deepEqual([p[0].start, p[0].end], [5, 19], "start and end include the brackets");
  assert.deepEqual(G.parseNorth(""), []);
  assert.deepEqual(G.parseNorth(null), []);
});

test("matching keeps ids: same words first, then by position; the rest are left over", () => {
  const north = [{ id: "a", text: "Calm mind" }, { id: "b", text: "Old wording" }, { id: "c", text: "Dropped" }];
  const m = G.matchNorth(G.parseNorth("[New wording], then [Calm  mind]"), north);
  assert.deepEqual(m.ids, ["b", "a"], "a reworded one keeps the id of the next unmatched goal");
  assert.deepEqual(m.left.map((g) => g.id), ["c"]);
  const more = G.matchNorth(G.parseNorth("[Calm mind] [Old wording] [Dropped] [Brand new]"), north);
  assert.deepEqual(more.ids, ["a", "b", "c", ""], "a phrase with nothing left to match is new");
});

test("the text to show: the saved one, or the goals one per line; goals missing from it are added at the end", () => {
  const goals = [{ id: "a", text: "Calm", span: "north" }, { id: "y", text: "Pass B2", span: "year" }, { id: "b", text: "Sea [view]", span: "north" }];
  assert.equal(G.northText(undefined, goals), "[Calm]\n[Sea view]", "never saved: one line per North star goal, brackets in a goal's own text are dropped");
  assert.equal(G.northText("I steer by [Calm].", goals), "I steer by [Calm].\n[Sea view]");
  assert.equal(G.northText("", []), "");
});

test("hover focus: the sentence, the clause or only the words around the linked phrases, never cut inside a frame", () => {
  const text = "What I'm steering by: [A steady, curious life] — slow mornings to read and write, work that keeps teaching me something, and [French as a second home]. Money is a tool, not the point.";
  const p = G.parseNorth(text);
  const show = (parts) => parts.map((x) => (x.gap ? "…" : x.sep ? "·" : x.i !== undefined ? "[" + p[x.i].text + "]" : x.text)).join("|");
  assert.equal(show(G.northFocus(text, p, [1], "sentence")),
    "What I'm steering by: |[A steady, curious life]| — slow mornings to read and write, work that keeps teaching me something, and |[French as a second home]|.|…",
    "the whole first sentence, other frames in it included; the sentence after it is left out");
  assert.equal(show(G.northFocus(text, p, [1], "clause")), "…|and |[French as a second home]|.|…", "the comma inside a frame doesn't cut it");
  assert.equal(show(G.northFocus(text, p, [1], "clause", 1)), "…|work that keeps teaching me something, and |[French as a second home]|.|…", "pad brings the clause before it");
  assert.equal(show(G.northFocus(text, p, [0], "clause")), "…|[A steady, curious life]| — slow mornings to read and write|…", "a trailing comma before … goes");
  assert.equal(show(G.northFocus(text, p, [1, 0], "word")), "[A steady, curious life]|·|[French as a second home]", "only the words, in order");
  assert.deepEqual(G.northFocus(text, p, [], "sentence"), []);
  assert.deepEqual(G.northFocus(text, p, [7], "word"), [], "an index that isn't there is ignored");
  const zh = "这几年想清楚的事：[A steady, curious life]，以及 [Live quietly]。\n\nWork should pay for the life. Keep learning — [French], writing.";
  const q = G.parseNorth(zh);
  const showZh = (parts) => parts.map((x) => (x.gap ? "…" : x.sep ? "·" : x.i !== undefined ? "[" + q[x.i].text + "]" : x.text)).join("|");
  assert.equal(showZh(G.northFocus(zh, q, [1], "sentence")), "这几年想清楚的事：|[A steady, curious life]|，以及 |[Live quietly]|。|…", "Chinese full stops and blank lines end sentences");
  assert.equal(showZh(G.northFocus(zh, q, [2], "sentence")), "…|Keep learning — |[French]|, writing.", "the last sentence: … only before it");
});

test("store: saving the paragraph creates, renames, reorders and deletes North star goals in one undoable step", async () => {
  console.warn = () => {};
  const store = await import("../js/store.js?north");
  let undoTo = null;
  store.onUndo((label, before) => { undoTo = before; });
  const T = store.today(), y = Number(T.slice(0, 4));
  const calm = store.saveGoal({ text: "Calm", span: "north", due: "", done: "" });
  const sea = store.saveGoal({ text: "By the sea", span: "north", due: "", done: "" });
  const year = store.saveGoal({ text: "Move house", span: "year", due: (y + 2) + "-12", done: "" });
  store.setParent(year, sea);
  store.linkGoal(calm, "g:Build");
  const north = () => store.goals().filter((g) => g.span === "north");
  assert.equal(store.northStar(), "[Calm]\n[By the sea]", "not saved yet: built from the goals");

  store.saveNorth("I want [a calm mind] and [By the sea]. Later: [Learn to sail]");
  assert.deepEqual(north().map((g) => g.text), ["a calm mind", "By the sea", "Learn to sail"], "order follows the text");
  const get = (id) => store.goals().find((g) => g.id === id);
  assert.equal(get(calm).text, "a calm mind", "reworded, same goal");
  assert.deepEqual(get(calm).by, ["g:Build"], "its links stay");
  assert.equal(get(year).up, sea, "the year goal still points at it");
  assert.equal(store.northStar(), "I want [a calm mind] and [By the sea]. Later: [Learn to sail]");
  assert.equal(store.setting("north-star").text, store.northStar());

  store.saveNorth("Just [a calm mind]");
  assert.equal(get(sea), undefined, "a phrase taken out deletes its goal");
  assert.equal(get(year).up, "", "the goal under it has no parent now");
  assert.deepEqual(north().map((g) => g.text), ["a calm mind"]);

  assert.ok(undoTo, "the save can be undone");
  store.undo(undoTo);
  assert.deepEqual(north().map((g) => g.text), ["a calm mind", "By the sea", "Learn to sail"], "undo brings the goals back");
  assert.equal(get(year).up, sea, "and the link under it");
  assert.equal(store.northStar(), "I want [a calm mind] and [By the sea]. Later: [Learn to sail]", "and the text");
});
