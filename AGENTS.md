# Rules for Agents 
 
0. Don't edit these rules. Only edit the scratchpad area below.
1. Before finalizing your response, reread it and ask yourself if it's impeccably, exquisitely, technically correct and true.
2. Never modify human-written comments, not even a tiny bit. LLMs will often slightly rephrase things when copying them. That drives me insane. Always preserve the exact characters, even whitespace. 
3. Don't ever delete human-written code. Instead you can comment it out and add your own comment about why it's safe to delete.
4. Never say "you're absolutely right" or any other form of sycophancy or even mild praise. Really zero personality of any kind. 
5. Follow Beeminder's [Pareto Dominance Principle (PDP)](https://blog.beeminder.com/pdp). Get explicit approval if any change would not be a Pareto improvement.
6. Follow Beeminder's [Anti-Magic Principle](https://blog.beeminder.com/magic). Don't fix problems by adding if-statements. Even if you're fixing a bug like "when X happens the app does Y instead of Z", resist the urge to add "if X then Z". If you're sure an if-statement is needed, make the case to me, the human. In general we need constant vigilance to minimize code paths. Even when we do need an if-statement, we want to change the program's behavior as little as possible. Like add an error banner if there's an error, don't render a different page. Always prefer to conditionally gray something out rather than suppress it.

7. Follow Beeminder's [Anti-Robustness Principle](https://blog.beeminder.com/postel) aka Anti-Postel. Fail loudly and immediately. Never silently fix inputs. See also the branch of defensive programming known as offensive programming.
8. We [call them quals](https://blog.beeminder.com/quals), not tests.

---
Humans above, robots below
---

# Scratchpad / Implementation Plan

## Overview

Transform Reciplier from simple linear scaling to a generalized constraint-based 
system supporting arbitrary mathematical relationships between variables.

**Current state:** Numbers auto-detected and scaled linearly; `=` prefix marks 
constants.  
**Target state:** Full `{...}` expression syntax with labels, constraints, and 
constraint solving.

## Syntax Specification

Every `{...}` block contains: an optional label (before a colon), then one or 
more expressions separated by `=` signs. Expressions separated by `=` are 
constraints: they must all evaluate to the same value. The field displays that 
common value.

### Raw input forms:
- `{3x}` — expression: 3 times x. Displays the value of 3x.
- `{d:9}` — defines variable d with value 9. Displays 9.
- `{w:}` — defines variable w with no initial value (solver picks one).
- `{r: d/2}` — defines variable r as expression d/2. Displays d/2.
- `{d = 2r}` — references d and 2r, constrains them equal. Displays that value.
- `{A: 1/2*tau*r^2 = w*h}` — defines A, constrains both expressions equal. 
  Displays the common value.
- `{a^2 + b^2 = c^2}` — constraint (Pythagorean). Displays the common value.

### Key distinction:
- LABEL (before colon): defines a NEW variable name
- EXPRESSION (after colon, or whole thing if no colon): references existing 
  variables, gets evaluated to produce the displayed value

### After preprocessing:
Add nonce labels to unlabeled blocks: `{3x}` → `{var01: 3x}`

Result: all blocks have format `label: expr1 = expr2 = ...`

### Mathematica-style syntax:
- `2x` means `2*x` (implicit multiplication)
- `x^2` means `x` squared (exponentiation) 
- Support `sqrt()` and basic math functions

### HTML comments:
Expressions inside HTML comments define variables/constraints but do NOT render
visible fields. Use for hidden intermediate calculations:
```
<!-- {s: h+m/60} & {s = e-d/u} -->
```
This defines s and adds a constraint, but shows no field. (The `&` is just 
comment text; multiple `{...}` blocks can appear in one comment.)

## Phase 1: Expression Parser

### 1.1 Extract `{...}` blocks
- Regex to find all `{...}` in recipe text
- Non-braced text stays as literal (no auto-scaling)
- Handle nested parens inside braces

### 1.2 Parse each block's internals
- Split on first `:` to get optional label
- Split remainder on `=` to get list of expressions that must be equal
- If no label, auto-generate nonce (var01, var02, ...)

### 1.3 Build symbol table
- For each label, record: defining expression(s), initial value (if any)
- Track which variables each expression references

### 1.4 Validation (fail loudly)
- Undefined variable referenced → error
- Duplicate label defined → error  
- Bare number like `{5}` with no variable → error
- Disconnected variable (defined but never referenced elsewhere) → error
  - Workaround: `{tau: 6.28} <!-- {tau} not currently used -->`

## Phase 2: Expression Evaluator

### 2.1 Convert to JavaScript
- `2x` → `2*x`
- `x^2` → `Math.pow(x,2)`
- Use `util.js` `laxeval()` as foundation

### 2.2 Evaluate with current variable assignments
- Given map of {varName: value}, evaluate any expression
- Return numeric result or error

## Phase 3: Constraint Solver

### 3.1 Initial values
- Variables with explicit values: use those (e.g., `{d:9}` → d=9)
- Variables without values: solver picks (favor small positive numbers)
- Scale factor `x` defaults to 1

### 3.2 Satisfy constraints
- For each constraint `{expr1 = expr2 = ...}`, all must evaluate equal
- When user edits a field, use binary search to find new values for unfixed 
  variables that satisfy all constraints

### 3.3 Contradiction detection
- If initial template has no valid solution → fail loudly, don't render
- Point to the problematic constraint

## Phase 4: UI Rendering

### 4.1 Field display
- Each `{...}` becomes an editable numeric input showing computed value
- Non-braced text rendered literally

### 4.2 Fixed/unfixed toggle
- UI to mark fields as "fixed" (won't change when others edited)
- Visual indicator for fixed state
- Can't mark field fixed if constraints currently violated

### 4.3 Constraint violation feedback
- While typing invalid value: field turns red
- Show violated equation (e.g., "25 ≠ 36")
- On blur: auto-recompute to valid value

### 4.4 HTML/Markdown support
- Render recipe as markdown
- Support HTML comments for hidden constraints:
  `<!-- {s: h+m/60} -->` defines s but doesn't display a field

## Phase 5: Migration

### 5.1 Convert existing recipes
- Old `=325` constant syntax → handled differently or deprecated
- Recipes already using new `{...}` syntax in script.js

### 5.2 New use cases
- Breakaway Biscuits (bike race calculator)
- Bike tour timing calculator
- Pythagorean triple demo

## Error Cases (Anti-Postel: Fail Loudly)

1. **Undefined variable** — referenced in expression but never defined via a 
   label. E.g., `{foo*2}` where foo was never defined.
2. **Contradictory constraints** — initial template has no valid solution. 
   E.g., `{a:3}, {b:4}, {c:6}` with hidden constraint `{a^2+b^2=c^2}`.
3. **Syntax error** — malformed expression.
4. **Duplicate label** — same variable name defined twice.
5. **Bare number, no label** — `{5}` is an error because it affects nothing and 
   can't be referenced. Give it a label: `{foo:5}`.
6. **Disconnected variable** — defined but never referenced elsewhere. E.g., 
   `{tau:6.28}` where tau never appears in any other expression. Workaround: 
   `{tau:6.28} <!-- {tau} not used yet -->`

## Files to Modify

- `script.js` — main parsing and rendering logic
- `util.js` — expression evaluation utilities  
- `styles.css` — fixed fields, error states
- `index.html` — error display area

## Next Steps

1. [x] Implement `{...}` regex extraction
2. [x] Parse block internals (label, expressions, constraints)
3. [x] Preprocessing pass to add nonce labels
4. [x] Build symbol table and validate (undefined vars, duplicates, etc.)
5. [x] Expression evaluator with Mathematica-style syntax
6. [x] Basic constraint solver (binary search)
7. [x] Render fields for new syntax
8. [x] Fixed/unfixed toggle (double-click)
9. [x] Constraint violation UI (red fields, auto-recompute on blur)
10. [x] HTML comment support for hidden constraints
11. [x] Add README examples to dropdown (Pythagorean, Breakaway, Bike Tour)