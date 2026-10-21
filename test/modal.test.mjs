// 弹层关掉以后焦点回哪：页面重画过、原来的按钮换成新的了，按开的时候记下的选择器找新的那个
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectorOf } from "../js/ui/modal.js";

test("the button that opened a dialog can be found again after the page is redrawn", () => {
  // 今天页一行的 ⋯（编辑）：那一行的 data-id + 按钮的 data-act
  assert.equal(selectorOf({ act: "edit", up: ["data-id", "t-42"] }), '[data-id="t-42"] [data-act="edit"]');
  // 计划卡的名字：没有 data-act，用它的第一个 class，加上卡片的 data-project
  assert.equal(selectorOf({ cls: "pname", up: ["data-project", "seed-b2"] }), '[data-project="seed-b2"] .pname');
  // 按钮自己带着 id 一类的属性
  assert.equal(selectorOf({ act: "goal-edit", own: [["data-goal", "q1"]] }), '[data-act="goal-edit"][data-goal="q1"]');
  // 引号、反斜杠不会把选择器弄坏
  assert.equal(selectorOf({ act: "x", up: ["data-id", 'a"b\\c'] }), '[data-id="a\\"b\\\\c"] [data-act="x"]');
  // 什么都没有：不找（关掉以后放到标题上）
  assert.equal(selectorOf({}), "");
});
