# Rules for Agents 
 
0. Don't edit these rules. Only edit the scratchpad area below.
1. Before finalizing your response, reread it and ask yourself if it's impeccably, exquisitely, technically correct and true.
2. Never modify human-written comments, not even a tiny bit. LLMs will often slightly rephrase things when copying them. That drives me insane. Always preserve the exact characters, even whitespace. 
3. Don't ever delete human-written code. Instead you can comment it out and add your own comment about why it's safe to delete.
4. Never say "you're absolutely right" or any other form of sycophancy or even mild praise. Really zero personality of any kind. 
5. Follow Beeminder's [Pareto Dominance Principle (PDP)](https://blog.beeminder.com/pdp). Get explicit approval if any change would not be a Pareto improvement.
6. Follow Beeminder's [Anti-Magic Principle](https://blog.beeminder.com/magic). Don't fix problems by adding if-statements. Even if you're fixing a bug like "when X happens the app does Y instead of Z", resist the urge to add "if X then Z". If you're sure an if-statement is needed, make the case to me, the human.
7. Follow Beeminder's [Anti-Robustness Principle](https://blog.beeminder.com/postel) aka Anti-Postel. Fail loudly and immediately. Never silently fix inputs. See also the branch of defensive programming known as offensive programming.
8. We [call them quals](https://blog.beeminder.com/quals), not tests.

---

# Scratchpad / Implementation Plan

## Overview

Transform Reciplier from simple linear scaling to a generalized constraint-based system supporting arbitrary mathematical relationships between variables.

**Current state:** Numbers auto-detected and scaled linearly; `=` prefix marks constants.  
**Target state:** Full `{expr}` syntax with labels, constraints, and constraint solving.

## Phase 1: New Expression Parser

### 1.1 Parse `{...}` expressions
- Regex to find all `{...}` blocks in recipe text
- Leave non-braced text as literal segments (not auto-scaled)
- Handle nested parens inside braces correctly

### 1.2 Expression syntax parsing
Within each `{...}` block, parse these forms:
- `{expr}` → anonymous expression (auto-generate nonce label like `var01`)
- `{label: expr}` → labeled expression
- `{expr1 = expr2 = ...}` → constraint (multiple expressions that must be equal)
- `{label: expr1 = expr2}` → labeled constraint

### 1.3 Mathematica-style syntax support
- `2x` → `2*x` (implicit multiplication)
- `x^2` → `Math.pow(x, 2)` (exponentiation)
- Support `sqrt()`, basic trig if needed

### 1.4 Variable extraction
- Build symbol table: for each label, track its defining expression
- Build dependency graph: which variables reference which others
- Detect undefined variable references → fail loudly
- Detect duplicate label definitions → fail loudly

## Phase 2: Constraint Solver

### 2.1 Simple evaluation
- Given current variable assignments, evaluate any expression
- Use `util.js`'s `laxeval()` as foundation (handles deoctalization)

### 2.2 Initial value assignment
- Variables with explicit values (e.g., `{d:9}`) get those values
- Variables without values (e.g., `{w:}`) start at some default (1? 0.01?)
- Scale factor `x` defaults to 1

### 2.3 Constraint satisfaction
- For each constraint `{expr1 = expr2 = ...}`, all expressions must evaluate equal
- Use binary search to find valid assignment when one variable changes
- Start simple: when user changes field F, find new values for non-fixed fields

### 2.4 Multi-variable solving (future)
- Current approach: binary search on one variable at a time
- Note in README: "We'll worry about [multi-variable] when we find use cases where it matters"

## Phase 3: UI Rendering

### 3.1 Field rendering
- Each `{...}` becomes an editable input field showing computed value
- Non-braced text rendered as-is (no longer auto-scaled)

### 3.2 Fixed/unfixed toggle
- Click or UI gesture to mark a field as "fixed"
- Fixed fields don't change when other fields are edited
- Visual indicator for fixed vs unfixed

### 3.3 Constraint violation feedback
- When constraints violated, show affected fields in red
- On blur from invalid state, recompute to valid values
- Show violated equation (e.g., "25 != 36")

### 3.4 Error display
- Parse errors, undefined variables, contradictions → don't render fields
- Show clear error message pointing to the problem

## Phase 4: Migration & Compatibility

### 4.1 Update existing recipes
- Convert old `=` constant syntax to new `{...}` syntax as needed
- Keep old recipes working or convert them explicitly

### 4.2 Backward compatibility decisions
- Do we still support bare numbers scaling? (Probably not — require `{...}`)
- Do we still support `=` prefix? (Probably deprecate in favor of expressions)

## Phase 5: Extended Features

### 5.1 Markdown support
- Render recipe text as markdown
- Support HTML comments for hidden constraints

### 5.2 Additional use cases
- "Breakaway Biscuits" bike racing calculator
- Bike tour timing calculator
- Pythagorean triple demo

## Error Cases (Anti-Postel: Fail Loudly)

1. **Undefined variable** — referenced but never labeled
2. **Contradictory constraints** — no solution exists
3. **Syntax error** — malformed expression
4. **Duplicate labels** — same label defined twice
5. **Bare number** — `{5}` without variable reference (maybe error?)
6. **Disconnected field** — defined but never used (warn or error)

## Open Questions

- Should `{5}` (bare number, no variable) be an error? README says probably yes.
- Should disconnected variables be errors or warnings?
- What default value for uninitialized variables like `{w:}`?
- How to handle circular dependencies? (Fail loudly)

## Files to Modify

- `script.js` — main parsing and rendering logic
- `util.js` — expression evaluation utilities
- `styles.css` — styling for fixed fields, errors, etc.
- `index.html` — possibly add error display area

## Next Immediate Steps

1. [ ] Implement `{...}` regex parser (extract expressions from recipe text)
2. [ ] Parse expression internals (label, expressions, constraints)
3. [ ] Build symbol table and dependency graph
4. [ ] Implement expression evaluator with Mathematica-style syntax
5. [ ] Render fields for new syntax
6. [ ] Wire up basic constraint solving (binary search)
7. [ ] Add fixed/unfixed toggle UI
8. [ ] Add error states and constraint violation display
9. [ ] Convert existing recipes to new syntax
10. [ ] Add new use cases (Breakaway Biscuits, etc.)