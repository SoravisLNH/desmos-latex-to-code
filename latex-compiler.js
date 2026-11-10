/* ============================================================
   latex-compiler.js  v2
   Desmos LaTeX  ->  AST  ->  Python(NumPy) / JavaScript
   ------------------------------------------------------------
     1. tokenize(src)  ข้อความ    -> ชิ้นเล็ก ๆ (tokens)
     2. parse(tokens)  tokens     -> ต้นไม้ (AST)
     3. emit(ast)      ต้นไม้      -> โค้ดภาษาปลายทาง

   โค้ดที่พ่นออกมาเรียกใช้ runtime:
     Python -> from ds_runtime import *
     JS     -> import * as DS from './ds-runtime.js'
   ============================================================ */

(function (root) {
  'use strict';

  /* ---------- ฟังก์ชันที่รู้จัก ---------- */
  const FUNCTIONS = {
    sin:1, cos:1, tan:1, csc:1, sec:1, cot:1,
    arcsin:1, arccos:1, arctan:-1, arccsc:1, arcsec:1, arccot:1,
    sinh:1, cosh:1, tanh:1, csch:1, sech:1, coth:1,
    arcsinh:1, arccosh:1, arctanh:1,
    ln:1, log:1, exp:1, sqrt:1, cbrt:1, abs:1,
    floor:1, ceil:1, round:-1, sign:1, mod:2,
    nCr:2, nPr:2, gcd:-1, lcm:-1,
    min:-1, max:-1, total:1, mean:1, median:1, count:1, length:1,
    stdev:1, stdevp:1, stddev:1, var:1, variance:1, mad:1,
    quartile:2, quantile:2, percentile:2,
    join:-1, sort:-1, shuffle:-1, unique:1, distance:2, midpoint:2,
    polygon:-1, random:-1, rgb:3, hsv:3
  };

  const CONSTANTS = { pi:'pi', tau:'tau', infty:'inf', infin:'inf' };

  const GREEK = ['alpha','beta','gamma','delta','epsilon','varepsilon','zeta',
    'eta','theta','vartheta','iota','kappa','lambda','mu','nu','xi','rho',
    'varrho','sigma','varsigma','upsilon','phi','varphi','chi','psi','omega',
    'Gamma','Delta','Theta','Lambda','Xi','Pi','Sigma','Upsilon','Phi','Psi','Omega'];

  function CompileError(message, pos) {
    const e = new Error(message);
    e.name = 'CompileError';
    e.pos = pos;
    return e;
  }

  /* ============================================================
     1. TOKENIZER
     ============================================================ */
  function tokenize(src) {
    const tokens = [];
    let i = 0;
    const push = (type, value, start, extra) =>
      tokens.push(Object.assign({ type, value, start, end: i }, extra || {}));

    while (i < src.length) {
      const c = src[i];

      if (/\s/.test(c)) { i++; continue; }
      if (c === '&') { i++; continue; }

      if (c === '.' && src.slice(i, i + 3) === '...') {
        const start = i; i += 3; push('ellipsis', '...', start); continue;
      }

      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const start = i;
        let sawDot = false;
        while (i < src.length) {
          if (/[0-9]/.test(src[i])) { i++; continue; }
          // จุดทศนิยมได้จุดเดียว และต้องไม่ใช่จุดของ "..."
          if (src[i] === '.' && !sawDot && /[0-9]/.test(src[i + 1] || '')) {
            sawDot = true; i++; continue;
          }
          break;
        }
        push('number', src.slice(start, i), start); continue;
      }

      if (c === '\\') {
        const start = i;
        i++;
        let name = '';
        while (i < src.length && /[a-zA-Z]/.test(src[i])) name += src[i++];
        if (name === '') { name = src[i] || ''; i++; }

        if (['left','right','!',',',';',':',' ','quad','qquad','displaystyle',
             'limits','nolimits','mathrm','text'].includes(name)) continue;

        if (name === '{') { push('punct', '\\{', start); continue; }
        if (name === '}') { push('punct', '\\}', start); continue; }

        if (name === 'cdot' || name === 'times' || name === 'ast') { push('op','*',start); continue; }
        if (name === 'div') { push('op','/',start); continue; }
        if (name === 'le' || name === 'leq') { push('op','<=',start); continue; }
        if (name === 'ge' || name === 'geq') { push('op','>=',start); continue; }
        if (name === 'ne' || name === 'neq') { push('op','!=',start); continue; }
        if (name === 'lt') { push('op','<',start); continue; }
        if (name === 'gt') { push('op','>',start); continue; }
        if (name === 'to' || name === 'rightarrow' || name === 'longrightarrow') {
          push('op','->',start); continue;
        }
        if (name === 'ldots' || name === 'dots' || name === 'cdots') {
          push('ellipsis','...',start); continue;
        }

        if (name === 'operatorname') {
          if (src[i] === '*') i++;
          while (/\s/.test(src[i] || '')) i++;
          if (src[i] !== '{') throw CompileError('\\operatorname ต้องตามด้วย {ชื่อ}', start);
          i++;
          let n = '';
          while (i < src.length && src[i] !== '}') n += src[i++];
          i++;
          push('command', n.replace(/\\/g, '').trim(), start, { fromOperatorname: true });
          continue;
        }

        push('command', name, start);
        continue;
      }

      if (/[a-zA-Z]/.test(c)) { const start = i; i++; push('ident', src[start], start); continue; }

      const start = i;
      if ('+-*/^'.includes(c)) { i++; push('op', c, start); continue; }
      if (c === '=') { i++; push('op','=',start); continue; }
      if (c === '<' || c === '>') {
        i++;
        if (src[i] === '=') { i++; push('op', c + '=', start); continue; }
        push('op', c, start); continue;
      }
      if ("(){}[],|_:!.'".includes(c)) { i++; push('punct', c, start); continue; }

      i++;
      throw CompileError(`เจอตัวอักษรที่ไม่รู้จัก: "${c}"`, start);
    }

    push('eof', null, i);
    return tokens;
  }

  /* ============================================================
     2. PARSER
     ============================================================ */
  function parse(tokens) {
    let p = 0;
    const peek = (k = 0) => tokens[p + k] || tokens[tokens.length - 1];
    const at = (type, value) => {
      const t = peek();
      return t.type === type && (value === undefined || t.value === value);
    };
    const atOneOf = (type, values) => {
      const t = peek();
      return t.type === type && values.includes(t.value);
    };
    const next = () => tokens[p++];
    const expect = (type, value) => {
      if (!at(type, value)) {
        const t = peek();
        throw CompileError(
          `ต้องการ "${value ?? type}" แต่เจอ "${t.value ?? 'จุดจบสมการ'}"`, t.start);
      }
      return next();
    };

    const CMP = ['=','<','>','<=','>=','!='];

    function parseRoot() {
      let node = parseAction();
      if (at('command','with')) {
        next();
        node = { kind:'With', body: node, bindings: parseBindings('=') };
      }
      return node;
    }

    function parseAction() {
      const left = parseComparison();
      if (at('op','->')) { next(); return { kind:'Action', left, right: parseComparison() }; }
      return left;
    }

    function parseComparison() {
      const operands = [parseAddSub()];
      const ops = [];
      while (atOneOf('op', CMP)) { ops.push(next().value); operands.push(parseAddSub()); }
      if (!ops.length) return operands[0];
      return { kind:'Compare', ops, operands };
    }

    function parseAddSub() {
      let node = parseMulDiv();
      while (at('op','+') || at('op','-')) {
        const op = next().value;
        node = { kind:'Binary', op, left:node, right:parseMulDiv() };
      }
      return node;
    }

    function parseMulDiv() {
      let node = parseUnary();
      for (;;) {
        if (at('op','*') || at('op','/')) {
          const op = next().value;
          node = { kind:'Binary', op, left:node, right:parseUnary() };
        } else if (startsAtom()) {
          node = { kind:'Binary', op:'*', implicit:true, left:node, right:parseUnary() };
        } else return node;
      }
    }

    function parseUnary() {
      if (at('op','-')) { next(); return { kind:'Neg', arg: parseUnary() }; }
      if (at('op','+')) { next(); return parseUnary(); }
      return parsePower();
    }

    function parsePower() {
      const base = parsePostfix();
      if (at('op','^')) { next(); return { kind:'Binary', op:'^', left:base, right:parseUnary() }; }
      return base;
    }

    function parsePostfix() {
      let node = parseAtom();
      for (;;) {
        if (at('punct','[')) {
          next();
          const index = parseListIndex();
          expect('punct',']');
          node = { kind:'Index', target:node, index };
        } else if (at('punct','.')) {
          next();
          const t = peek();
          if (t.type === 'ident' || t.type === 'command') {
            next();
            node = { kind:'Access', target:node, prop:t.value };
          } else throw CompileError('หลังจุดต้องเป็นชื่อ เช่น .x .y', t.start);
        } else if (at('punct','!')) {
          next();
          node = { kind:'Factorial', arg:node };
        } else return node;
      }
    }

    function parseListIndex() {
      const first = parseComparison();
      if (at('ellipsis')) {
        next();
        return { kind:'Range', start:first, second:null, end:parseAddSub() };
      }
      return first;
    }

    function startsAtom() {
      const t = peek();
      if (t.type === 'number' || t.type === 'ident') return true;
      if (t.type === 'punct' && ['(','{','|','\\{'].includes(t.value)) return true;
      if (t.type === 'command') return !(t.value === 'for' || t.value === 'with');
      return false;
    }

    function parseAtom() {
      const t = peek();
      if (t.type === 'number') { next(); return { kind:'Num', value:t.value }; }
      if (t.type === 'ident') return parseIdent();
      if (t.type === 'punct' && t.value === '(')   return parseParen();
      if (t.type === 'punct' && t.value === '[')   return parseBracket();
      if (t.type === 'punct' && t.value === '\\{') return parsePiecewise();

      if (t.type === 'punct' && t.value === '{') {
        next();
        const inner = parseComparison();
        expect('punct','}');
        return { kind:'Group', arg:inner, brace:true };
      }
      if (t.type === 'punct' && t.value === '|') {
        next();
        const inner = parseAddSub();
        expect('punct','|');
        return { kind:'Call', name:'abs', args:[inner] };
      }
      if (t.type === 'command') return parseCommand();

      throw CompileError(`ไม่รู้จะทำยังไงกับ "${t.value ?? 'จุดจบสมการ'}" ตรงนี้`, t.start);
    }

    function readName(base) {
      let name = base;
      if (at('punct','_')) {
        next();
        if (at('punct','{')) {
          next();
          let sub = '';
          while (!at('punct','}')) {
            const s = next();
            if (s.type === 'eof') throw CompileError('ลืมปิด } ของตัวห้อย', s.start);
            sub += s.value;
          }
          next();
          name += '_' + sub;
        } else name += '_' + next().value;
      }
      return name;
    }

    function parseIdent() {
      const t = next();
      const name = readName(t.value);
      if (name === 'e') return { kind:'Const', name:'e' };

      let order = 0;
      while (at('punct',"'")) { next(); order++; }

      if (at('punct','(')) {
        next();
        const args = parseArgList(')');
        return order ? { kind:'Prime', name, order, args }
                     : { kind:'Call', name, args, userDefined:true };
      }
      if (order) return { kind:'Prime', name, order, args:null };
      return { kind:'Var', name };
    }

    function parseParen() {
      next();
      const items = [parseComparison()];
      while (at('punct',',')) { next(); items.push(parseComparison()); }
      expect('punct',')');
      if (items.length === 1) return { kind:'Group', arg:items[0] };
      if (items.length === 2) return { kind:'Point', items };
      throw CompileError('คู่อันดับต้องมี 2 ค่า', peek().start);
    }

    function parseBracket() {
      const open = next();
      if (at('punct',']')) { next(); return { kind:'List', items:[] }; }

      const first = parseComparison();

      if (at('ellipsis')) {
        next();
        const end = parseAddSub();
        expect('punct',']');
        return { kind:'Range', start:first, second:null, end };
      }

      if (at('command','for')) {
        next();
        const bindings = parseBindings('=');
        expect('punct',']');
        return { kind:'For', body:first, bindings };
      }

      const items = [first];
      while (at('punct',',')) {
        next();
        if (at('ellipsis')) {
          next();
          if (at('punct',',')) next();
          const end = parseAddSub();
          expect('punct',']');
          if (items.length !== 2)
            throw CompileError('ช่วงแบบมีขั้นต้องเขียน [a,b,...,c]', open.start);
          return { kind:'Range', start:items[0], second:items[1], end };
        }
        const el = parseComparison();
        if (at('command','for')) {
          next();
          const bindings = parseBindings('=');
          expect('punct',']');
          return { kind:'For', body:{ kind:'List', items:[...items, el] }, bindings };
        }
        items.push(el);
      }
      expect('punct',']');
      return { kind:'List', items };
    }

    function parseBindings(sep) {
      const bindings = [];
      for (;;) {
        const t = peek();
        if (t.type !== 'ident')
          throw CompileError('ต้องเป็นชื่อตัวแปร เช่น x=[1...5]', t.start);
        next();
        const name = readName(t.value);
        expect('op', sep);
        bindings.push({ name, value: parseAddSub() });
        if (at('punct',',')) { next(); continue; }
        return bindings;
      }
    }

    function parsePiecewise() {
      next();
      const branches = [];
      let otherwise = null;
      if (at('punct','\\}')) { next(); return { kind:'Piecewise', branches, otherwise }; }

      for (;;) {
        const e = parseComparison();
        if (at('punct',':')) {
          next();
          branches.push({ cond:e, value: parseComparison() });
        } else if (e.kind === 'Compare') {
          branches.push({ cond:e, value:{ kind:'Num', value:'1' } });
        } else {
          otherwise = e;
        }
        if (at('punct',',')) { next(); continue; }
        expect('punct','\\}');
        return { kind:'Piecewise', branches, otherwise };
      }
    }

    function parseArgList(closer) {
      const args = [];
      if (at('punct',closer)) { next(); return args; }
      for (;;) {
        args.push(parseComparison());
        if (at('punct',',')) { next(); continue; }
        expect('punct',closer);
        return args;
      }
    }

    function parseBraced() {
      if (at('punct','{')) {
        next();
        const inner = parseComparison();
        expect('punct','}');
        return inner;
      }
      return parseAtom();
    }

    function parseTightProduct() {
      let node = parseUnary();
      while (startsAtom()) {
        node = { kind:'Binary', op:'*', implicit:true, left:node, right:parseUnary() };
      }
      return node;
    }

    function parseCommand() {
      const t = next();
      const name = t.value;

      if (['frac','dfrac','tfrac','cfrac'].includes(name)) {
        const num = parseBraced();
        const den = parseBraced();
        const dv = asDerivativeOperator(num, den);
        if (dv) return { kind:'Derivative', varName:dv, body:parseTightProduct() };
        return { kind:'Binary', op:'/', left:num, right:den, frac:true };
      }

      if (name === 'sqrt') {
        let index = null;
        if (at('punct','[')) { next(); index = parseAddSub(); expect('punct',']'); }
        const arg = parseBraced();
        return index
          ? { kind:'Binary', op:'^', left:arg,
              right:{ kind:'Binary', op:'/', left:{kind:'Num',value:'1'}, right:index } }
          : { kind:'Call', name:'sqrt', args:[arg] };
      }

      if (name === 'sum' || name === 'prod') {
        const { varName, from, to } = parseBigOpLimits();
        return { kind: name === 'sum' ? 'Sum' : 'Prod',
                 varName, from, to, body: parseTightProduct() };
      }

      if (name === 'int') {
        let from = null, to = null;
        if (at('punct','_')) { next(); from = parseBraced(); }
        if (at('op','^'))    { next(); to   = parseBraced(); }
        const raw = parseTightProduct();
        const got = stripDifferential(raw);
        if (!got.varName) throw CompileError('อินทิเกรตต้องมี dx ปิดท้าย', t.start);
        return { kind:'Integral', varName:got.varName, from, to,
                 body: got.body || { kind:'Num', value:'1' } };
      }

      if (name === 'log') {
        let base = null;
        if (at('punct','_')) { next(); base = parseBraced(); }
        const call = finishFunction('log');
        if (base) {
          if (call.kind === 'Call') call.args.push(base);
          else call.left.args.push(base);
        }
        return call;
      }

      if (name === 'binom') {
        const n = parseBraced(), r = parseBraced();
        return { kind:'Call', name:'nCr', args:[n, r] };
      }

      if (CONSTANTS[name]) return { kind:'Const', name: CONSTANTS[name] };

      if (GREEK.includes(name)) {
        const full = readName(name);
        if (at('punct','(')) { next(); return { kind:'Call', name:full, args:parseArgList(')'), userDefined:true }; }
        return { kind:'Var', name:full };
      }

      if (FUNCTIONS[name] !== undefined) return finishFunction(name);

      if (t.fromOperatorname) {
        if (at('punct','(')) { next(); return { kind:'Call', name, args:parseArgList(')'), userDefined:true }; }
        return { kind:'Var', name };
      }

      throw CompileError(`ยังไม่รองรับคำสั่ง \\${name}`, t.start);
    }

    function parseBigOpLimits() {
      let varName = 'n',
          from = { kind:'Num', value:'1' },
          to   = { kind:'Num', value:'1' };
      if (at('punct','_')) {
        next();
        const braced = at('punct','{');
        if (braced) next();
        const v = expect('ident');
        varName = readName(v.value);
        expect('op','=');
        from = parseAddSub();
        if (braced) expect('punct','}');
      }
      if (at('op','^')) { next(); to = parseBraced(); }
      return { varName, from, to };
    }

    function asDerivativeOperator(num, den) {
      const unwrap = n => (n && n.kind === 'Group') ? unwrap(n.arg) : n;
      const N = unwrap(num), D = unwrap(den);
      if (!N || N.kind !== 'Var' || N.name !== 'd') return null;
      if (!D || D.kind !== 'Binary' || D.op !== '*') return null;
      const L = unwrap(D.left), Rr = unwrap(D.right);
      if (L && L.kind === 'Var' && L.name === 'd' && Rr && Rr.kind === 'Var') return Rr.name;
      return null;
    }

    /* แบนโซ่คูณ  ((a*b)*c) -> [a,b,c]  แล้วตัด "d x" สองตัวท้ายทิ้ง */
    function stripDifferential(node) {
      const factors = [];
      (function flat(n) {
        if (n.kind === 'Binary' && n.op === '*') { flat(n.left); flat(n.right); }
        else factors.push(n);
      })(node);

      const last = factors[factors.length - 1];
      const prev = factors[factors.length - 2];
      if (!prev || prev.kind !== 'Var' || prev.name !== 'd' ||
          !last || last.kind !== 'Var') return { body:node, varName:null };

      const rest = factors.slice(0, -2);
      if (!rest.length) return { body:null, varName:last.name };
      const body = rest.reduce((a, b) => ({ kind:'Binary', op:'*', implicit:true, left:a, right:b }));
      return { body, varName:last.name };
    }

    function finishFunction(name) {
      let power = null;
      if (at('op','^')) { next(); power = parseBraced(); }
      let args;
      if (at('punct','(')) { next(); args = parseArgList(')'); }
      else args = [parseTightProduct()];
      const call = { kind:'Call', name, args };
      return power ? { kind:'Binary', op:'^', left:call, right:power } : call;
    }

    const ast = parseRoot();
    if (!at('eof')) {
      const t = peek();
      throw CompileError(`มีของเหลือที่อ่านไม่ออก: "${t.value}"`, t.start);
    }
    return ast;
  }

  /* ============================================================
     3. EMITTER
     ============================================================ */
  const PREC = { '+':1, '-':1, '*':2, '/':2, '^':4 };

  function makeEmitter(target) {
    const py = target === 'python';
    const R = py ? '' : 'DS.';
    const rt = n => R + n;
    const CONST = { pi:rt('pi'), tau:rt('tau'), e:rt('E'), inf:rt('inf') };
    const RENAME = { var:'variance', stddev:'stdev' };
    const lam = (params, body) => py ? `lambda ${params}: ${body}` : `(${params}) => ${body}`;

    function go(n, parentPrec = -1) {
      switch (n.kind) {
        case 'Num':   return n.value;
        case 'Var':   return n.name;
        case 'Const': return CONST[n.name] || rt(n.name);
        case 'Group': return go(n.arg, parentPrec);

        case 'Neg': {
          const s = '-' + go(n.arg, 3);
          return parentPrec > 3 ? `(${s})` : s;
        }

        case 'Point': return `${rt('pt')}(${n.items.map(x => go(x)).join(', ')})`;
        case 'List':  return `${rt('lst')}(${n.items.map(x => go(x)).join(', ')})`;

        case 'Range': return n.second
          ? `${rt('rng')}(${go(n.start)}, ${go(n.end)}, ${go(n.second)})`
          : `${rt('rng')}(${go(n.start)}, ${go(n.end)})`;

        case 'Index':  return `${rt('idx')}(${go(n.target)}, ${go(n.index)})`;

        case 'Access':
          if (n.prop === 'x') return `${rt('getx')}(${go(n.target)})`;
          if (n.prop === 'y') return `${rt('gety')}(${go(n.target)})`;
          return `${rt(n.prop)}(${go(n.target)})`;

        case 'Factorial': return `${rt('fact')}(${go(n.arg)})`;

        case 'Call': {
          const args = n.args.map(a => go(a)).join(', ');
          if (n.userDefined) return `${n.name}(${args})`;
          return `${rt(RENAME[n.name] || n.name)}(${args})`;
        }

        case 'Prime': {
          let f = n.name;
          for (let k = 0; k < n.order; k++) f = `${rt('deriv')}(${f})`;
          return n.args ? `${f}(${n.args.map(a => go(a)).join(', ')})` : f;
        }

        case 'Derivative':
          return `${rt('deriv')}(${lam(n.varName, go(n.body))})`;

        case 'Sum':
          return `${rt('summation')}(${lam(n.varName, go(n.body))}, ${go(n.from)}, ${go(n.to)})`;
        case 'Prod':
          return `${rt('product')}(${lam(n.varName, go(n.body))}, ${go(n.from)}, ${go(n.to)})`;
        case 'Integral':
          return `${rt('integral')}(${lam(n.varName, go(n.body))}, ${go(n.from)}, ${go(n.to)})`;

        case 'For': {
          const params = n.bindings.map(b => b.name).join(', ');
          const lists  = n.bindings.map(b => go(b.value)).join(', ');
          return `${rt('dfor')}(${lam(params, go(n.body))}, ${lists})`;
        }

        case 'With': {
          const params = n.bindings.map(b => b.name).join(', ');
          const vals   = n.bindings.map(b => go(b.value)).join(', ');
          return `(${lam(params, go(n.body))})(${vals})`;
        }

        case 'Piecewise': {
          const pairs = n.branches
            .map(b => py ? `(${go(b.cond)}, ${go(b.value)})` : `[${go(b.cond)}, ${go(b.value)}]`)
            .join(', ');
          const other = n.otherwise ? go(n.otherwise) : rt('undef');
          return `${rt('pw')}([${pairs}], ${other})`;
        }

        case 'Compare': {
          if (n.ops.length === 1) {
            const op = n.ops[0] === '=' ? '==' : n.ops[0];
            return `${go(n.operands[0], 0)} ${op} ${go(n.operands[1], 0)}`;
          }
          const parts = [];
          for (let k = 0; k < n.ops.length; k++) {
            const op = n.ops[k] === '=' ? '==' : n.ops[k];
            parts.push(`(${go(n.operands[k], 0)} ${op} ${go(n.operands[k+1], 0)})`);
          }
          return parts.join(py ? ' & ' : ' && ');
        }

        case 'Action': return `${go(n.left)} = ${go(n.right)}`;

        case 'Binary': {
          if (n.op === '^') {
            const s = `${go(n.left, 5)} ** ${go(n.right, 5)}`;
            return parentPrec >= 4 ? `(${s})` : s;
          }
          const prec = PREC[n.op];
          const s = `${go(n.left, prec)} ${n.op} ${go(n.right, prec + 1)}`;
          return parentPrec > prec ? `(${s})` : s;
        }
      }
      return '/* ? */';
    }

    return function emit(ast) {
      if (ast.kind === 'Compare' && ast.ops.length === 1 && ast.ops[0] === '=') {
        const L = ast.operands[0], Rt = ast.operands[1];
        if (L.kind === 'Call' && L.userDefined) {
          const params = L.args.map(a => go(a)).join(', ');
          return py
            ? `def ${L.name}(${params}):\n    return ${go(Rt)}`
            : `function ${L.name}(${params}) {\n  return ${go(Rt)};\n}`;
        }
        if (L.kind === 'Var')
          return py ? `${L.name} = ${go(Rt)}` : `const ${L.name} = ${go(Rt)};`;
      }
      return py ? go(ast) : go(ast) + ';';
    };
  }

  const HEADER = {
    python: 'from ds_runtime import *',
    js: "import * as DS from './ds-runtime.js';"
  };

  /* ---------- วาดต้นไม้ ---------- */
  const CHILD_KEYS = ['left','right','arg','target','index','body','from','to',
                      'operands','args','items','start','second','end'];

  function label(n) {
    switch (n.kind) {
      case 'Num':        return `Num  ${n.value}`;
      case 'Var':        return `Var  ${n.name}`;
      case 'Const':      return `Const  ${n.name}`;
      case 'Neg':        return 'Neg  -';
      case 'Group':      return 'Group  ( )';
      case 'Point':      return 'Point  ( , )';
      case 'List':       return `List  [${n.items.length}]`;
      case 'Range':      return n.second ? 'Range  [a,b,...,c]' : 'Range  [a...b]';
      case 'Index':      return 'Index  [ ]';
      case 'Access':     return `Access  .${n.prop}`;
      case 'Factorial':  return 'Factorial  !';
      case 'Call':       return `Call  ${n.name}` + (n.userDefined ? '   (ผู้ใช้นิยาม)' : '');
      case 'Prime':      return `Prime  ${n.name}${"'".repeat(n.order)}`;
      case 'Derivative': return `Derivative  d/d${n.varName}`;
      case 'Sum':        return `Sum  ${n.varName}`;
      case 'Prod':       return `Prod  ${n.varName}`;
      case 'Integral':   return `Integral  d${n.varName}`;
      case 'For':        return `For  ${n.bindings.map(b => b.name).join(', ')}`;
      case 'With':       return `With  ${n.bindings.map(b => b.name).join(', ')}`;
      case 'Piecewise':  return `Piecewise  ${n.branches.length} เงื่อนไข`;
      case 'Compare':    return `Compare  ${n.ops.join(' ')}`;
      case 'Action':     return 'Action  →';
      case 'Binary':     return `Binary  ${n.op}`
                              + (n.implicit ? '   (ไม่มีเครื่องหมาย)' : '')
                              + (n.frac ? '   (\\frac)' : '');
      default:           return n.kind;
    }
  }

  function childrenOf(n) {
    const kids = [];
    for (const k of CHILD_KEYS) {
      const v = n[k];
      if (!v) continue;
      if (Array.isArray(v)) v.forEach(x => x && x.kind && kids.push(['', x]));
      else if (v.kind) kids.push(['', v]);
    }
    if (n.branches) n.branches.forEach((b, i) => {
      kids.push([`ถ้า${i+1}:`, b.cond]);
      kids.push([`ได้${i+1}:`, b.value]);
    });
    if (n.otherwise) kids.push(['นอกนั้น:', n.otherwise]);
    if (n.bindings) n.bindings.forEach(b => kids.push([b.name + ' =', b.value]));
    return kids;
  }

  function treeToText(n, prefix = '', isLast = true, isRoot = true, tag = '') {
    const head = (tag ? tag + ' ' : '') + label(n);
    let out = isRoot ? head + '\n' : prefix + (isLast ? '└─ ' : '├─ ') + head + '\n';
    const kids = childrenOf(n);
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    kids.forEach(([k, node], idx) => {
      out += treeToText(node, childPrefix, idx === kids.length - 1, false, k);
    });
    return out;
  }

  /* ============================================================
     4. วิเคราะห์ + คอมไพล์หลายบรรทัด
     ============================================================ */

  /* ชื่อที่ "ใช้" ในสมการ โดยไม่นับตัวแปรที่ผูกไว้ในวงเล็บของตัวเอง */
  function freeNames(node, bound, out) {
    bound = bound || new Set();
    out = out || new Set();
    if (!node || !node.kind) return out;

    const walk = (n, b) => freeNames(n, b, out);

    switch (node.kind) {
      case 'Var':
        if (!bound.has(node.name)) out.add(node.name);
        return out;

      case 'Call':
        if (node.userDefined && !bound.has(node.name)) out.add(node.name);
        node.args.forEach(a => walk(a, bound));
        return out;

      case 'Prime':
        if (!bound.has(node.name)) out.add(node.name);
        (node.args || []).forEach(a => walk(a, bound));
        return out;

      case 'For':
      case 'With': {
        const inner = new Set(bound);
        node.bindings.forEach(bd => { walk(bd.value, bound); inner.add(bd.name); });
        walk(node.body, inner);
        return out;
      }

      case 'Sum':
      case 'Prod':
      case 'Integral': {
        if (node.from) walk(node.from, bound);
        if (node.to) walk(node.to, bound);
        const inner = new Set(bound); inner.add(node.varName);
        walk(node.body, inner);
        return out;
      }

      case 'Derivative': {
        const inner = new Set(bound); inner.add(node.varName);
        walk(node.body, inner);
        return out;
      }

      case 'Piecewise':
        node.branches.forEach(b => { walk(b.cond, bound); walk(b.value, bound); });
        if (node.otherwise) walk(node.otherwise, bound);
        return out;
    }

    for (const k of CHILD_KEYS) {
      const v = node[k];
      if (!v) continue;
      if (Array.isArray(v)) v.forEach(x => walk(x, bound));
      else if (v.kind) walk(v, bound);
    }
    return out;
  }

  /* สมการนี้ "นิยาม" อะไรไว้ไหม */
  function analyze(ast) {
    let defines = null, params = [], isFunc = false;

    if (ast.kind === 'Compare' && ast.ops.length === 1 && ast.ops[0] === '=') {
      const L = ast.operands[0];
      if (L.kind === 'Var') defines = L.name;
      else if (L.kind === 'Call' && L.userDefined) {
        defines = L.name;
        isFunc = true;
        params = L.args.map(a => a.kind === 'Var' ? a.name : null).filter(Boolean);
      }
    }

    const bound = new Set(params);
    const deps = defines
      ? freeNames(ast.operands[1], bound)
      : freeNames(ast, bound);
    deps.delete(defines);

    return { defines, isFunc, params, deps };
  }

  /* เรียงใหม่ให้ของที่ถูกใช้มาก่อนของที่ใช้มัน */
  function sortByDependency(units) {
    const defIndex = new Map();
    units.forEach((u, i) => {
      if (u.ok && u.info.defines && !defIndex.has(u.info.defines)) defIndex.set(u.info.defines, i);
    });

    const edges = units.map(u => {
      if (!u.ok) return [];
      return [...u.info.deps]
        .map(n => defIndex.get(n))
        .filter(j => j !== undefined);
    });

    const state = new Array(units.length).fill(0);   // 0 ยังไม่ไป, 1 กำลังไป, 2 เสร็จ
    const order = [];
    let cyclic = false;

    function visit(i) {
      if (state[i] === 2) return;
      if (state[i] === 1) { cyclic = true; return; }
      state[i] = 1;
      edges[i].forEach(j => { if (j !== i) visit(j); });
      state[i] = 2;
      order.push(i);
    }

    // นิยามก่อน แล้วค่อยบรรทัดอื่น ๆ
    units.forEach((u, i) => { if (u.ok && u.info.defines) visit(i); });
    units.forEach((u, i) => visit(i));

    return { order, cyclic };
  }

  function compileProgram(text, target) {
    const emit = target === 'js' ? API.toJS : API.toPython;
    const rawLines = String(text).split('\n');

    const units = [];
    rawLines.forEach((raw, i) => {
      const src = raw.trim();
      if (!src) return;
      const u = { line: i + 1, src, ok: false };
      try {
        u.tokens = tokenize(src);
        u.ast = parse(u.tokens);
        u.info = analyze(u.ast);
        u.code = emit(u.ast);
        u.tree = treeToText(u.ast);
        u.ok = true;
      } catch (e) {
        u.error = e;
        try { u.tokens = tokenize(src); } catch (_) { u.tokens = []; }
      }
      units.push(u);
    });

    const { order, cyclic } = sortByDependency(units);
    const reordered = order.some((v, i) => v !== i);

    const pieces = order.map(i => {
      const u = units[i];
      if (!u.ok) {
        const c = target === 'js' ? '//' : '#';
        return `${c} บรรทัด ${u.line}: ${u.error.message}\n${c} ${u.src}`;
      }
      return u.code;
    });

    return {
      units,
      order,
      reordered,
      cyclic,
      header: HEADER[target === 'js' ? 'js' : 'python'],
      code: pieces.join('\n\n')
    };
  }

  const API = {
    tokenize, parse, treeToText, HEADER, freeNames, analyze, compileProgram,
    toPython: makeEmitter('python'),
    toJS: makeEmitter('js'),
    compile(src) {
      const tokens = tokenize(src);
      const ast = parse(tokens);
      return { tokens, ast, tree: treeToText(ast),
               python: API.toPython(ast), js: API.toJS(ast) };
    }
  };

  root.LatexCompiler = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);