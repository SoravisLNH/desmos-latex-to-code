"""
ds_runtime.py
ตัวช่วยสำหรับโค้ด Python ที่ compiler พ่นออกมา

    from ds_runtime import *

ทุกอย่างเป็น NumPy ดังนั้นลิสต์จะคำนวณทีเดียวทั้งก้อนเหมือน Desmos เลย
"""

import math
import itertools
import numpy as np

__all__ = [n for n in []]  # เติมท้ายไฟล์

# ---------- ค่าคงที่ ----------
pi    = np.pi
tau   = 2 * np.pi
E     = np.e
inf   = np.inf
undef = np.nan

# ---------- ฟังก์ชันพื้นฐาน ----------
sin, cos, tan = np.sin, np.cos, np.tan
sinh, cosh, tanh = np.sinh, np.cosh, np.tanh
arcsinh, arccosh, arctanh = np.arcsinh, np.arccosh, np.arctanh
exp, sqrt, abs_ = np.exp, np.sqrt, np.abs
floor, ceil, sign = np.floor, np.ceil, np.sign

def csc(x):  return 1 / np.sin(x)
def sec(x):  return 1 / np.cos(x)
def cot(x):  return 1 / np.tan(x)
def csch(x): return 1 / np.sinh(x)
def sech(x): return 1 / np.cosh(x)
def coth(x): return 1 / np.tanh(x)

arcsin, arccos = np.arcsin, np.arccos
def arctan(y, x=None):
    return np.arctan(y) if x is None else np.arctan2(y, x)
def arccsc(x): return np.arcsin(1 / np.asarray(x, float))
def arcsec(x): return np.arccos(1 / np.asarray(x, float))
def arccot(x): return np.arctan(1 / np.asarray(x, float))

def ln(x):  return np.log(x)
def log(x, base=10):
    return np.log(x) / np.log(base)

def cbrt(x): return np.cbrt(x)
def abs(x):  return np.abs(x)          # ทับ built-in โดยตั้งใจ
def round(x, n=0): return np.round(x, int(n))
def mod(a, b): return np.mod(a, b)

def fact(n):
    return np.round(np.exp(np.vectorize(math.lgamma)(np.asarray(n, float) + 1)))

def nCr(n, r): return np.vectorize(math.comb)(np.asarray(n, int), np.asarray(r, int))
def nPr(n, r): return np.vectorize(math.perm)(np.asarray(n, int), np.asarray(r, int))
def gcd(*a):   return np.gcd.reduce(np.asarray(_flatten(a), int))
def lcm(*a):   return np.lcm.reduce(np.asarray(_flatten(a), int))


# ---------- คู่อันดับ ----------
def pt(x, y):
    """สร้างจุด (x, y) — ถ้า x,y เป็นลิสต์จะได้ลิสต์ของจุด"""
    return np.stack(np.broadcast_arrays(np.asarray(x, float),
                                        np.asarray(y, float)), axis=-1)

def getx(p): return np.asarray(p, float)[..., 0]
def gety(p): return np.asarray(p, float)[..., 1]

def distance(a, b):
    return np.linalg.norm(np.asarray(a, float) - np.asarray(b, float), axis=-1)

def midpoint(a, b):
    return (np.asarray(a, float) + np.asarray(b, float)) / 2

def polygon(*pts):
    return np.asarray(pts, float)


# ---------- ลิสต์ ----------
def lst(*items):
    return np.array(items)

def rng(a, b, second=None):
    """[1...10] -> rng(1,10)   |   [1,3,...,11] -> rng(1,11,3)"""
    a, b = float(a), float(b)
    step = 1.0 if second is None else float(second) - a
    if step == 0:
        raise ValueError('ขั้นของช่วงเป็น 0 ไม่ได้')
    n = int(math.floor((b - a) / step + 1e-9)) + 1
    if n <= 0:
        return np.array([])
    out = a + step * np.arange(n)
    return out.astype(int) if float(a).is_integer() and float(step).is_integer() else out

def idx(L, i):
    """ลิสต์ของ Desmos เริ่มนับที่ 1 — และรองรับการกรองด้วยเงื่อนไข L[L>2]"""
    L = np.asarray(L)
    i = np.asarray(i)
    if i.dtype == np.bool_:
        return L[i]
    j = np.asarray(i, int) - 1
    return L[j]

def length(L): return np.asarray(L).shape[0]
def count(L):  return length(L)
def total(L):  return np.sum(np.asarray(L, float), axis=0)
def mean(L):   return np.mean(np.asarray(L, float), axis=0)
def median(L): return np.median(np.asarray(L, float), axis=0)
def stdev(L):  return np.std(np.asarray(L, float), ddof=1)
def stdevp(L): return np.std(np.asarray(L, float))
def variance(L): return np.var(np.asarray(L, float), ddof=1)
def mad(L):
    a = np.asarray(L, float)
    return np.mean(np.abs(a - np.mean(a)))

def quantile(L, q):  return np.quantile(np.asarray(L, float), q)
def quartile(L, n):  return np.quantile(np.asarray(L, float), float(n) / 4)
def percentile(L, p): return np.percentile(np.asarray(L, float), float(p))

def join(*parts):
    out = []
    for p in parts:
        a = np.asarray(p)
        out.extend(a.tolist() if a.ndim else [a.item()])
    return np.array(out)

def sort(L, key=None):
    L = np.asarray(L)
    if key is None:
        return np.sort(L, axis=0)
    return L[np.argsort(np.asarray(key))]

def unique(L):  return np.unique(np.asarray(L))
def shuffle(L, seed=None):
    L = np.array(L)
    rs = np.random.default_rng(seed)
    rs.shuffle(L)
    return L

def random(n=1, seed=None):
    rs = np.random.default_rng(seed)
    return rs.random(int(n))

def _flatten(xs):
    out = []
    for x in xs:
        a = np.asarray(x)
        out.extend(a.ravel().tolist() if a.ndim else [a.item()])
    return out

def min(*a):
    v = _flatten(a)
    return np.min(v)
def max(*a):
    v = _flatten(a)
    return np.max(v)


# ---------- ลิสต์แบบ for ----------
def dfor(fn, *lists):
    """[expr for x=A, y=B] — ตัวแรกวิ่งเร็วสุด เหมือน Desmos"""
    lists = [np.atleast_1d(np.asarray(L)) for L in lists]
    rows = [fn(*reversed(combo)) for combo in itertools.product(*reversed(lists))]
    return np.array(rows)


# ---------- ฟังก์ชันเป็นช่วง ----------
def pw(branches, otherwise=np.nan):
    """{x>0: 1, x<0: -1, 0}"""
    conds = [np.asarray(c) for c, _ in branches]
    vals  = [v for _, v in branches]
    if all(c.ndim == 0 for c in conds) and np.ndim(otherwise) == 0 \
       and all(np.ndim(v) == 0 for v in vals):
        for c, v in zip(conds, vals):
            if c:
                return v
        return otherwise
    return np.select(conds, vals, default=otherwise)


# ---------- แคลคูลัส ----------
def summation(fn, a, b):
    a, b = int(np.round(a)), int(np.round(b))
    if b < a:
        return 0.0
    acc = fn(a)
    for n in range(a + 1, b + 1):
        acc = acc + fn(n)
    return acc

def product(fn, a, b):
    a, b = int(np.round(a)), int(np.round(b))
    if b < a:
        return 1.0
    acc = fn(a)
    for n in range(a + 1, b + 1):
        acc = acc * fn(n)
    return acc

def deriv(fn, h=1e-6):
    """คืนฟังก์ชันอนุพันธ์ (วิธีผลต่างกึ่งกลาง)"""
    def d(x):
        x = np.asarray(x, float)
        return (fn(x + h) - fn(x - h)) / (2 * h)
    return d

def integral(fn, a, b, n=2000):
    """กฎซิมป์สัน"""
    a, b = float(a), float(b)
    if n % 2:
        n += 1
    xs = np.linspace(a, b, n + 1)
    ys = fn(xs)
    w = np.ones(n + 1)
    w[1:-1:2] = 4
    w[2:-1:2] = 2
    return (b - a) / (3 * n) * np.dot(w, ys)


__all__ = [k for k in dir() if not k.startswith('_')]