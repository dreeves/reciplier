/**
 * Solves a system of equations for the given variables.
 * Features: Algebraic Propagation, Newton Solver, Gradient Descent, Pinning, and Dependency Graphs.
 */
function solvem(eqns, initialVars) {
  // --- CONFIGURATION ---
  const MAX_ITERATIONS = 60000;
  const LEARN_RATE = 0.02;      
  const DECAY = 0.95;           
  const EPSILON = 1e-10;        
  const STEP_CLIP = 10.0; // Increased to help C=50 converge faster

  const varNames = Object.keys(initialVars);

  // 1. PREPROCESSOR
  // Converts "2x" -> "2*x", handles simple implicit multiplication
  const preval = (s) => s.toString().replace(/(\d)([a-zA-Z_(])/g, '$1*$2').replace(/\^/g, '**');

  const compiledEqns = eqns.map(eqn => 
    eqn.map(expr => {
      try { return new Function(...varNames, `return ${preval(expr)};`); } 
      catch (e) { return () => NaN; }
    })
  );

  // 2. STATE INITIALIZATION
  let values = varNames.map(k => {
    const v = initialVars[k];
    return (v === null || v === undefined) ? NaN : v;
  });

  // Strength: 0=Unknown, 1=Weak(Init), 2=Strong(Derived), 3=Hard(Literal/Pinned)
  let strength = new Int8Array(varNames.length).fill(0);
  values.forEach((v, i) => { if (!isNaN(v)) strength[i] = 1; });

  let pinned = new Set();
  let dependencies = new Map(); 

  const getDeps = (expr) => {
    const m = expr.toString().match(/[a-zA-Z_$][\w$]*/g) || [];
    return m.filter(v => varNames.includes(v));
  };

  // 3. LOGIC & ALGEBRA PASS
  for (let pass = 0; pass < varNames.length * 4; pass++) {
    let changed = false;

    eqns.forEach((eqn, eqIdx) => {
      const funcs = compiledEqns[eqIdx];
      const currentVals = funcs.map(f => f(...values));

      // A. Find Anchor
      let anchorVal = NaN;
      let anchorH = 0;

      for (let i = 0; i < eqn.length; i++) {
        const raw = eqn[i];
        const val = currentVals[i];
        
        if (typeof raw === 'number') {
          anchorVal = raw; anchorH = 3; break;
        }

        if (Number.isFinite(val)) {
          let h = 1;
          const deps = getDeps(raw);
          if (deps.length === 0) h = 3; 
          else {
             let minH = 3;
             for(let d of deps) {
               const idx = varNames.indexOf(d);
               const dh = strength[idx] || 0;
               if (dh < minH) minH = dh;
             }
             h = minH;
          }
          if (h > anchorH) { anchorH = h; anchorVal = val; }
        }
      }

      // B. Propagate
      eqn.forEach((term, termIdx) => {
        const deps = getDeps(term);

        // CASE 1: Definition / Direct Assignment
        if (deps.length === 1 && deps[0] === term) {
           const vIdx = varNames.indexOf(term);
           
           // Register Dependency (a = 3x)
           // Prevents circular locking (x=y, y=x) and protects pinned vars
           if (eqn.length === 2 && !dependencies.has(vIdx) && !pinned.has(vIdx)) {
              const otherIdx = (termIdx === 0) ? 1 : 0;
              const otherRaw = eqn[otherIdx];
              const isBareVar = varNames.includes(otherRaw);
              if (typeof otherRaw !== 'number' && !isBareVar) {
                 dependencies.set(vIdx, { eqIdx, termIdx: otherIdx });
              }
           }

           // Update Value
           if (anchorH > 0 && !pinned.has(vIdx)) {
             const currH = strength[vIdx];
             if (isNaN(values[vIdx]) || anchorH > currH || (anchorH === currH && Math.abs(values[vIdx] - anchorVal) > 1e-9)) {
               values[vIdx] = anchorVal;
               strength[vIdx] = anchorH;
               changed = true;
               if (anchorH === 3) {
                 pinned.add(vIdx);
                 dependencies.delete(vIdx);
               }
             }
           }
           return;
        }

        // CASE 2: Newton Solve
        if (anchorH === 0) return;

        // FIX: Prioritize NaNs. Treat "Weak" vars as constants if we have NaNs.
        const nans = deps.filter(d => isNaN(values[varNames.indexOf(d)]));
        const weaks = deps.filter(d => {
            const i = varNames.indexOf(d);
            return !isNaN(values[i]) && strength[i] < anchorH;
        });

        let targetVar = null;
        if (nans.length === 1) {
            targetVar = nans[0];
        } else if (nans.length === 0 && weaks.length === 1) {
            targetVar = weaks[0];
        }

        if (targetVar) {
            const tIdx = varNames.indexOf(targetVar);
            
            if (dependencies.has(tIdx) || pinned.has(tIdx)) return;

            let guess = isNaN(values[tIdx]) ? 0.1 : values[tIdx];
            if (Math.abs(guess) < 1e-9) guess = 0.1;

            for(let n=0; n<10; n++) {
                values[tIdx] = guess;
                const y1 = funcs[termIdx](...values);
                
                const d = 1e-5;
                values[tIdx] = guess + d;
                const y2 = funcs[termIdx](...values);
                
                const slope = (y2 - y1) / d;
                if (Math.abs(slope) < 1e-9) break;
                
                const next = guess - (y1 - anchorVal) / slope;
                if (!Number.isFinite(next)) break;
                if (Math.abs(next - guess) < 1e-9) { guess = next; break; }
                guess = next;
            }
            
            values[tIdx] = guess;
            const check = funcs[termIdx](...values);
            if (Math.abs(check - anchorVal) < 1e-3) {
                strength[tIdx] = anchorH;
                changed = true;
                if (anchorH === 3) {
                   pinned.add(tIdx);
                   dependencies.delete(tIdx);
                }
            }
        }
      });
    });
    if (!changed) break;
  }

  // 4. PRE-OPTIMIZATION
  for(let i=0; i<values.length; i++) if(isNaN(values[i])) values[i] = 0.5;

  const enforceDeps = () => {
    let anyChange = false;
    for(let k=0; k<3; k++) { 
      let passChange = false;
      dependencies.forEach(({eqIdx, termIdx}, vIdx) => {
        if (pinned.has(vIdx)) return;
        const val = compiledEqns[eqIdx][termIdx](...values);
        if (Number.isFinite(val) && Math.abs(values[vIdx] - val) > 1e-9) {
          values[vIdx] = val;
          passChange = true;
        }
      });
      if(passChange) anyChange = true; else break;
    }
  };

  // 5. GRADIENT DESCENT
  let gradCache = new Float64Array(values.length).fill(0);
  const DELTA = 1e-6;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    enforceDeps(); 

    let totalError = 0;
    const results = compiledEqns.map(funcs => funcs.map(f => f(...values)));
    
    for (let row of results) {
      for (let i = 0; i < row.length - 1; i++) {
        let diff = row[i] - row[i+1];
        totalError += diff * diff;
      }
    }

    if (totalError < EPSILON) break;

    for (let i = 0; i < values.length; i++) {
      if (pinned.has(i) || dependencies.has(i)) continue;

      let original = values[i];
      values[i] = original + DELTA;
      enforceDeps(); 

      let errorPlus = 0;
      for (let r = 0; r < compiledEqns.length; r++) {
        const row = compiledEqns[r].map(f => f(...values));
        for (let k = 0; k < row.length - 1; k++) {
           let diff = row[k] - row[k+1];
           errorPlus += diff * diff;
        }
      }

      values[i] = original; 
      enforceDeps(); 

      let grad = (errorPlus - totalError) / DELTA;

      gradCache[i] = DECAY * gradCache[i] + (1 - DECAY) * (grad * grad);
      let step = (LEARN_RATE * grad) / (Math.sqrt(gradCache[i]) + 1e-8);

      if (step > STEP_CLIP) step = STEP_CLIP;
      if (step < -STEP_CLIP) step = -STEP_CLIP;
      
      values[i] -= step;
    }
  }
  enforceDeps();

  let result = {};
  varNames.forEach((k, i) => result[k] = values[i]);
  return result;
}

// --- HELPER ---
solvem.solved = function(eqns, result) {
  const preval = (s) => s.toString().replace(/(\d)([a-zA-Z_(])/g, '$1*$2').replace(/\^/g, '**');
  let totalDiff = 0;
  const keys = Object.keys(result);
  const values = Object.values(result);
  
  for(let eqn of eqns) {
    const vals = eqn.map(e => {
       try { return new Function(...keys, `return ${preval(e)}`)(...values); } 
       catch(x) { return NaN; }
    });
    for(let i=0; i<vals.length-1; i++) {
      totalDiff += Math.abs(vals[i] - vals[i+1]);
    }
  }
  return totalDiff;
};

// --- QUALS SUITE ---
function check(name, result, expected) {
  console.group(`Qual: ${name}`);
  let allPassed = true;
  for (let [key, val] of Object.entries(expected)) {
    const actual = result[key];
    const diff = Math.abs(actual - val);
    const pass = diff < 1e-1; 
    if (!pass) allPassed = false;
    console.log(pass ? "✅" : "❌", `${key}: Expect ${val}, Got ${actual?.toFixed(2)}`);
  }
  if (allPassed) console.log(">> PASSED"); else console.warn(">> FAILED");
  console.groupEnd();
}

// 1. Mixed Nulls
check('Mixed Nulls & Propagation',
  solvem([['var01', 'x'],['var02', 'y'],['var03', 33, '2*x + 3*y'],['var04', 'x'],['var05', 'y'],['var06', 2, '5*x - 4*y']],
    {var01: 6, var02: null, var03: 33, var04: null, var05: null, var06: 2, x: null, y: null}),
  {var01: 6, var02: 7, x: 6, y: 7}
);

// 2. Pythagorean
check('Pythagorean Chain',
  solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
    {x: 1, a: 1, b: 1, c: 1, v1: 1}),
  {x: 1, a: 3, b: 4, c: 5, v1: 25}
);

// 3. Pyzza Tests
check('Pyzza: A=30',
  solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
    {x: 1, a: 30, b: 1, c: 1, v1: 1}),
  {x: 10, a: 30, b: 40, c: 50, v1: 2500}
);

check('Pyzza: B=40',
  solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
    {x: 1, a: 1, b: 40, c: 1, v1: 1}),
  {x: 10, a: 30, b: 40, c: 50, v1: 2500}
);

check('Pyzza: C=50',
  solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
    {x: 1, a: 1, b: 1, c: 50, v1: 1}),
  {x: 10, a: 30, b: 40, c: 50, v1: 2500}
);

// 4. Conflict
check("Impossible Conflict (Pinned)",
  solvem([['sum', 'x+y'], ['sum', 10], ['sum', 20]], {x:0, y:0, sum:0}),
  {sum: 10} 
);