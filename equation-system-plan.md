The idea is to have reciplier subsume my "calculator calculator" aka Sheeq where
you can have arbitrary expressions with variables.

A canonical example would be something like:

```
1 egg and 2 wheels of cheese in a @{d = 9}-inch diameter pan (so a surface area 
of {A = 3.14*(d/2)^2}) heated at @350 degrees.
```

That's saying that the area should scale with the other numbers and the diameter
of the pan should not (note the @ symbol in front of values that should not 
scale). But not scaling is different from not changing. If you 10x the number of
eggs then you'll also 10x the number of wheels of cheese and the area of the pan
which means the current diameter of 9 should get multiplied by 3.16.

And then you could cover all the use cases for Sheeq. For example:

```
@{a = 3}, @{b = 4}, @{c = sqrt(a^2 + b^2)} is a Pythagorean triple.
```

Although a cool thing about Sheeq is you don't have to solve the equation for
one of the variables.

So more planning needed to Pareto-dominate it...

-- Begin AI-generated text --

# Equation System for Reciplier

## Goal
Add support for embedded mathematical relationships in recipes using:
- `@{var = value}` - variable declarations that don't scale with recipe
- `{expression}` - computed expressions that depend on variables

## Implementation Steps

### 1. Extend the Parser
- Modify `parseRecipe()` to detect `@{...}` and `{...}` patterns
- Extract variable declarations and expressions
- Build dependency graph between variables and expressions

### 2. Expression Evaluation
- Create simple expression evaluator for basic math operations
- Support variables, numbers, and common functions (like `3.14`, `*`, `/`, `^`, `()`)
- Handle circular dependencies gracefully

### 3. Variable System
- Track variables separately from regular recipe scaling numbers
- Variables don't scale with recipe multiplier
- Expressions update when their dependencies change

### 4. UI Integration
- Render variables as editable inputs (like current numbers)
- Render expressions as computed values (read-only, highlighted differently)
- Update all dependent expressions when a variable changes

### 5. Example Implementation
Transform this input:
```
1 egg and 2 wheels of cheese in a @{d = 9}-inch diameter pan (so a surface area of {A = 3.14*(d/2)^2}) heated at @350 degrees.
```

Into this rendered output:
- `1` → editable input (scales with recipe)
- `2` → editable input (scales with recipe) 
- `@{d = 9}` → `9` editable input (doesn't scale)
- `{A = 3.14*(d/2)^2}` → `63.585` computed display
- `@350` → `350` constant display

### 6. Data Structures
```javascript
// New state for equation system
let variables = {}; // {varName: value}
let expressions = {}; // {exprId: {formula, dependencies, value}}
```

### 7. Parsing Regex Patterns
- Variable declarations: `/@\{([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^}]+)\}/g`
- Expressions: `/\{([^}]+)\}/g`

### 8. Expression Dependencies
- Parse expressions to find variable references
- Build dependency graph to determine update order
- Detect and handle circular dependencies

This creates a foundation for "Sheeq-like" functionality within recipes while maintaining backward compatibility with existing recipe scaling.