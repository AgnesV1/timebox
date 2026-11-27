// 系统要求减少动态（prefers-reduced-motion: reduce）的时候收不收着动效。
// 平常跟着系统走；设置里勾了「系统要求减少动态时也照常动」（html.motion-on，2026-11-28 她要的：电脑的系统开着减少动态，
// 按钮弹簧、换页乱码、Stats 的浪、日历过劳变红、卡片边缘的光一下子全没了）就照常动。css 里每条 prefers-reduced-motion 也都带着 :root:not(.motion-on)。
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export const systemReduces = () => Boolean(mq && mq.matches);
export const reduced = () => systemReduces() && !(typeof document !== "undefined" && document.documentElement.classList.contains("motion-on"));
// 原来写 reduce.matches / still.matches 的地方直接换成它
export const REDUCE = { get matches() { return reduced(); } };
// main.js 开头、设置一改就调
export function setMotion(on) { document.documentElement.classList.toggle("motion-on", Boolean(on)); }
