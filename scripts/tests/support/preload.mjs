/**
 * Prepara o processo do robô para o teste: relógio falso (as esperas não demoram de verdade),
 * Gemini falso e estado carregado de um arquivo JSON (SIM_STATE), que é salvo de volta ao terminar.
 */
import fs from "node:fs";
import { createFakeGemini } from "./fake-gemini.mjs";

const STATE = process.env.SIM_STATE;
const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
const RealDate = Date;
let fakeNow = st.now;

globalThis.Date = class extends RealDate {
  constructor(...a) {
    if (a.length === 0) super(fakeNow);
    else super(...a);
  }
  static now() { return fakeNow; }
};
globalThis.setTimeout = (fn, ms = 0, ...args) => {
  fakeNow += ms;
  Promise.resolve().then(() => fn(...args));
  return 0;
};
globalThis.__SIM = { st };
globalThis.fetch = createFakeGemini({ st, behaviors: JSON.parse(process.env.SIM_GEMINI || "{}"), advance: (ms) => { fakeNow += ms; } });
process.on("exit", () => {
  st.now = fakeNow;
  fs.writeFileSync(STATE, JSON.stringify(st));
});
