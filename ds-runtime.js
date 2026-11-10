/* ============================================================
   ds-runtime.js
   ตัวช่วยสำหรับโค้ด JavaScript ที่ compiler พ่นออกมา

       import * as DS from './ds-runtime.js';

   หมายเหตุ: JS ไม่มี broadcasting เหมือน NumPy
   ดังนั้น A + 1 เมื่อ A เป็นลิสต์จะ "ไม่" บวกทีละตัว
   ถ้าต้องทำกับลิสต์ทั้งก้อน ให้ใช้ฝั่ง Python จะตรงกับ Desmos กว่า
   ============================================================ */

/* ---------- ค่าคงที่ ---------- */
export const pi    = Math.PI;
export const tau   = 2 * Math.PI;
export const E     = Math.E;
export const inf   = Infinity;
export const undef = NaN;

/* ---------- ฟังก์ชันพื้นฐาน ---------- */
export const sin = Math.sin, cos = Math.cos, tan = Math.tan;
export const sinh = Math.sinh, cosh = Math.cosh, tanh = Math.tanh;
export const arcsin = Math.asin, arccos = Math.acos;
export const arcsinh = Math.asinh, arccosh = Math.acosh, arctanh = Math.atanh;
export const exp = Math.exp, sqrt = Math.sqrt, cbrt = Math.cbrt;
export const abs = Math.abs, floor = Math.floor, ceil = Math.ceil, sign = Math.sign;

export const csc  = x => 1 / Math.sin(x);
export const sec  = x => 1 / Math.cos(x);
export const cot  = x => 1 / Math.tan(x);
export const csch = x => 1 / Math.sinh(x);
export const sech = x => 1 / Math.cosh(x);
export const coth = x => 1 / Math.tanh(x);

export const arctan = (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x));
export const arccsc = x => Math.asin(1 / x);
export const arcsec = x => Math.acos(1 / x);
export const arccot = x => Math.atan(1 / x);

export const ln  = x => Math.log(x);
export const log = (x, base = 10) => Math.log(x) / Math.log(base);

export const round = (x, n = 0) => { const k = 10 ** n; return Math.round(x * k) / k; };
export const mod   = (a, b) => ((a % b) + b) % b;   // เครื่องหมายตามตัวหาร เหมือน Desmos

export function fact(n) {
  n = Math.round(n);
  if (n < 0) return NaN;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}
export const nCr = (n, r) => fact(n) / (fact(r) * fact(n - r));
export const nPr = (n, r) => fact(n) / fact(n - r);

function gcd2(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
export const gcd = (...a) => flat(a).reduce(gcd2);
export const lcm = (...a) => flat(a).reduce((x, y) => Math.abs(x * y) / gcd2(x, y));

/* ---------- คู่อันดับ ---------- */
export const pt   = (x, y) => [x, y];
const isPoint = p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number';
export const getx = p => (isPoint(p) ? p[0] : p.map(q => q[0]));
export const gety = p => (isPoint(p) ? p[1] : p.map(q => q[1]));
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const polygon  = (...pts) => pts;

/* ---------- ลิสต์ ---------- */
export const lst = (...items) => items;

export function rng(a, b, second) {
  const step = second === undefined ? 1 : second - a;
  if (step === 0) throw new Error('ขั้นของช่วงเป็น 0 ไม่ได้');
  const n = Math.floor((b - a) / step + 1e-9) + 1;
  return n <= 0 ? [] : Array.from({ length: n }, (_, k) => a + step * k);
}

export function idx(L, i) {
  if (Array.isArray(i)) {
    if (typeof i[0] === 'boolean') return L.filter((_, k) => i[k]);
    return i.map(k => L[k - 1]);
  }
  return L[i - 1];
}

export const length = L => L.length;
export const count  = L => L.length;
export const total  = L => L.reduce((a, b) => a + b, 0);
export const mean   = L => total(L) / L.length;

export function median(L) {
  const s = [...L].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function variance(L) {
  const m = mean(L);
  return L.reduce((a, x) => a + (x - m) ** 2, 0) / (L.length - 1);
}
export const stdev  = L => Math.sqrt(variance(L));
export const stdevp = L => {
  const m = mean(L);
  return Math.sqrt(L.reduce((a, x) => a + (x - m) ** 2, 0) / L.length);
};
export const mad = L => { const m = mean(L); return mean(L.map(x => Math.abs(x - m))); };

export function quantile(L, q) {
  const s = [...L].sort((a, b) => a - b);
  const h = (s.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const quartile   = (L, n) => quantile(L, n / 4);
export const percentile = (L, p) => quantile(L, p / 100);

function flat(xs) { return xs.flatMap(x => (Array.isArray(x) ? flat(x) : [x])); }
export const join   = (...parts) => flat(parts);
export const unique = L => [...new Set(L)];
export const sort   = (L, key) => (key
  ? L.map((v, k) => [v, key[k]]).sort((a, b) => a[1] - b[1]).map(p => p[0])
  : [...L].sort((a, b) => a - b));
export function shuffle(L) {
  const a = [...L];
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}
export const random = (n = 1) => Array.from({ length: n }, Math.random);

export const min = (...a) => Math.min(...flat(a));
export const max = (...a) => Math.max(...flat(a));

/* ---------- ลิสต์แบบ for ---------- */
export function dfor(fn, ...lists) {
  let out = [[]];
  for (const L of lists) out = L.flatMap(v => out.map(c => [...c, v]));
  // ตัวแรกวิ่งเร็วสุด เหมือน Desmos
  return out.map(args => fn(...args));
}

/* ---------- ฟังก์ชันเป็นช่วง ---------- */
export function pw(branches, otherwise = NaN) {
  for (const [cond, value] of branches) if (cond) return value;
  return otherwise;
}

/* ---------- แคลคูลัส ---------- */
export function summation(fn, a, b) {
  a = Math.round(a); b = Math.round(b);
  let acc = 0;
  for (let n = a; n <= b; n++) acc += fn(n);
  return acc;
}
export function product(fn, a, b) {
  a = Math.round(a); b = Math.round(b);
  let acc = 1;
  for (let n = a; n <= b; n++) acc *= fn(n);
  return acc;
}
export const deriv = (fn, h = 1e-6) => x => (fn(x + h) - fn(x - h)) / (2 * h);

export function integral(fn, a, b, n = 2000) {
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = fn(a) + fn(b);
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * fn(a + k * h);
  return (h / 3) * s;
}