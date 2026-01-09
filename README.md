# Reciplier

Hosted at [reciplier.dreev.es](https://reciplier.dreev.es).
Background at [AGI Friday](https://agifriday.substack.com/p/reciplier).

See also http://doc.dreev.es/recipes which maybe I want to merge with this.

Turns out this is way more general than recipes and is kind of halfway to a 
spreadsheet. Much better than a spreadsheet in some ways. It also subsume's my
old "calculator calculator" app that I called Sheeq.

# Functional Spec for Generalized Reciplier

The most basic Reciplier use case starts with a recipe template like so:

```
Mix {2x} eggs and {3x} wheels of cheese. Then eat it.

This recipe is scaled by {x = 1}.
```

Each expression in curly braces is called a cell. Reciplier renders each cell as
a numeric field in the UI and you can edit any of them at will, causing the
others to change accordingly to keep all the constraints satisfied, like how the
number of wheels of cheese is always 3 times whatever x is. Or edit the field
for wheels of cheese to 18 and the number of eggs will automatically change to
12 and x to 6.

Now consider a recipe that has you mix 2 eggs and 3 wheels of cheese in a 9-inch
diameter pan. Of course that 9 doesn't scale linearly with the ingredients. It's
the area that does that, because there's a certain fixed thickness required, 
let's say. And the area in this case (since pi are square) comes out to 63.62
inches. If you doubled the recipe you'd double that area to 127.24 which implies
you'd need a 12.73-inch diameter pan. And say we want to allow for a rectangular
pan as well.

Here's how we do all that by annotating the recipe template:

```
Mix {2x} eggs and {3x} wheels of cheese in a {d}-inch diameter pan.
Or a {w}x{h}-inch rectangular pan (with a {z}-inch diagonal) is fine.
Or any pan as long as its area is {A = x*1/2*tau*r1^2 = 1/2*tau*r^2 = w*h}
square inches. Heat at 350 degrees.

This recipe is scaled by a factor of {x = 1}.

Constraints, constants, and sanity checks:
* The true circle constant is {6.28 = tau}
* The original pan diameter at 1x scale is {9 = d1} (radius {r1 = d1 / 2})
* Scaled radius is {r = d/2} and scaled diameter is {d = 2r}
* The squared diagonal of the rectangular pan is {w^2 + h^2 = z^2}
```

Any cell that scales linearly is multiplied by x. The confusing bit is the 
constraint on the area, which is constrained to be x times the _original_ area,
which is based on the original diameter, d1, which we set to 9, implying an
original radius, r1, of 4.5. The new radius, r, after scaling, is implied the
next equality in A's cell. Namely, the area must also equal pi times r^2. And,
if using a rectangular pan, the width and height need to multiply to that same
area. The final line in the template says what the diagonal of the w-by-h pan
must be, per Pythagoras.

(Side note: Having both {d = 2r} and {r = d/2} is unnecessary. If a variable is
defined/constrained elsewhere, you can just put it in braces, no equation 
needed. But redundant constraints don't hurt. They're nice sanity checks.)

(Technical note: We support Mathematica-style arithmetic syntax where "2x" means
"2*x".)

(Note on prior art: Embedded Ruby (ERB) syntax has `<% code to just evaluate %>`
and `<%= code to print the output of %>` and `<%# comments %>`.)

In any case, the above template gets rendered as something like this initially:

```
Mix [2] egg(s) and [3] wheels of cheese in a [9]-inch pan.
Or a [0.01]x[6361.7]-inch rectangular pan ([6361.7]-inch diagonal) is fine.
Or any pan with area [63.62] square inches. Heat at 350 degrees.

This recipe is scaled by a factor of [1].

Constraints and sanity checks:
* The true circle constant is [[6.28]]
* The original pan diameter at 1x scale is [[9]] (radius [4.5])
* Scaled radius is [4.5] and scaled diameter is [9]
* The squared diagonal of the rectangular pan is [40471547]
```

We use a convention that if any cell starts with a constant (arithmetic 
expressions that evaluate to a number count as constants) then by default that
cell is frozen in the UI. That's indicated above with double brackets and just
means that the solver will hold that value fixed and try to find values for the
other cells that satisfy the constraints. The user can always toggle the
frozenness of a cell any time.

(Do we need that convention? Simpler would be if any cell that includes a
constant at all is initially frozen. But we want to say {x=1} to mean x defaults
to 1 without fixing x at 1.)

The next thing to notice is that the variables in this recipe template are
actually under-constrained. Specifically, fixing one of w, h, or z to any number
implies the other two. Reciplier will pick arbitrary values satisfying the
constraints. If those choices are silly (as in the 0.01x6361.7-inch pan above)
the user can just change them and optionally freeze them. Maybe you have only
9x9-inch square pans so you fix w at 9 and then if Reciplier says that that
implies h=27, you can take that to mean 3 9x9-inch pans in a row.

Maybe you slide the slider judiciously to make sure h is a multiple of 9. Or add
more constraints. Reciplier is your oyster!

But for normal recipes, just put braces and x's on every number that scales
linearly. For example, a "12" in the recipe becomes "{12x}" to show that what
was originally a 12 is now a 12 multiplied by the scale factor, x. And then
remember to include "{x = 1}" somewhere in the template. That's what generates
a slider for scaling the recipe.

As always with Reciplier, changing any field causes the rest to insta-update.


## The Constraint Solver

This part is more technical spec than functional spec. The rest of Reciplier 
treats the solver as a black box. Inside the black box is currently an 
abomination cobbled together by Claude and Gemini and GPT. Or it's a work of
genius, I'm not sure. I just know it works for the use cases I've contrived so
far. In the future we could swap in something fancier, or call out to
Mathematica's NSolve or NMinimize or something.

In the meantime, we just need to make sure interface to the solver in the code
is clean and nice. For that, and for details about what kind of math notation
Reciplier supports, read on.

The constraint solver has three components. First is `preval` which preprocesses
a math expression string so we can eval it as JavaScript. This includes implicit
multiplication, like `2x` → `2*x`, exponentiation with `^`, and all the standard
functions like sqrt, sin, cos, etc, which JavaScript needs to have "Math."
prepended to. The idea is to support standard ascii math like "3y+cos(x)/4".

The variables in an expression must be strings that are valid identifiers in
JavaScript-like languages, like "x" or "a1" or "some_var". Note that even though
we turn "2x" into "2*x", "x2" is not "x*2", it's just its own variable.

Next is `vareval` which, after preprocessing with `preval`, evals a math
expression using a given assignment of the variables referenced in the
expression. For example, `vareval('2x+y', {x: 3, y: 1})` returns 7. If the eval
fails to return a number, `vareval` returns null.

Finally, the `solvem` function takes a list of equations and a hash of variables
with initial numerical assignments (as in `vareval` except for `solvem`, initial
values are allowed to be omitted by specifying them as null) and tries to find a
satisfying assignment of numeric values to the variables.

An equation is a list of one or more expressions taken to all be equal. Every
expression in every equation should eval via `vareval` to a number, as long as
`vareval` is given an assignment of numbers to all the variables the expression
references.

The `solvem` function returns an object with three fields:
* `ass` is a hash of variable names with their solved numeric values (an
assignment)
* `zij` (pronounced "zidge") is an array of sum-of-squared-residual-errors,
corresponding to each equation. If we say that, using assignment `ass`, the
expressions in an equation eval to values [v1, ..., vn] and that m is the mean
of those values, then the differences between the vi's and m are the residuals.
Square the residuals and sum them and that's the `zij` entry for that equation.
If `zij` is all zeros then `ass` is a valid assignment satisfying all the
constraints.
* `sat` is a boolean saying whether every entry in `zij` is zero, i.e., whether
`ass` is a satisfying assignment.

Examples:

1. `solvem([['a', '2b']], {a: null, b: null})`
returns `{ass: {a: 1, b: 0.5}, zij: [0], sat: true}`
2. `solvem([['a+b', 8], ['a', 3], ['b', 4], ['c']], {a: null, b: null, c: 0})`
returns `{ass: {a: 3, b: 4, c: 0}, zij: [1, 0, 0, 0], sat: false}`
3. `solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0})` 
returns `{ass: {x: 6, y: 7}, zij: [0, 0], sat: true}`
4. `solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']], `
  `{x: 1, a: 1, b: 1, c: 1, v1: 1})` 
returns `{ass: {x: 1, a: 3, b: 4, c: 5, v1: 25}, zij: [0, 0], sat: true}`

The constraint solver is the core of Reciplier but how it comes up with those
satisfying assignments is black magic.


## Data Structures and Business Logic

A cell is a data structure that includes the following three fields:

* `cvar` is the name of the variable corresponding to this cell
* `cval` is the current value assigned to this cell's variable
* `ceqn` (pronounced "sequin") is a list of one or more expressions that are 
  constrained to be equal to each other and to cval

TODO ---------------------------------------------------------------------------


(Implementation note: As a preprocessing pass, add nonce cvars to every 
expression that doesn't have one. E.g., {1x} and {3x} become {var01: 1x} and
{var02: 3x}. That way the rest of the code can count on a consistent format: a
cvar, a colon, and then one or more expressions separated by equal-signs.)

Initially we exclude from ceqn any expressions that are constants (either a bare
number or an arithmetic expression that evaluate to a number -- so no 
variables). Instead, cval is set to any constant specified in the cell 
definition. (More than one constant in the definition of a cell is an error).

For example, a cell defined as `{x: 3y = z}` will have cvar set to `x` and ceqn
set to [`x`, `3y`, `z`] with cval initially undefined. A cell defined as 
`{x: y = 1}` will have cvar set to `x`, ceqn set to [`x`, `y`] and cval set 
to 1. A cell like `{v:}` will have cvar `v`, cval undefined, and ceqn [`v`].

(Note that the solver needs initial values and if you pass in variables that are
undefined it defaults them to 1, so `{v:}` is functionally the same as `{v:1}`.
There's a key difference though: specifying a constant in the definition of a
cell marks it as frozen. See below.)

Every cell has a corresponding field in the UI and cval is always the current
value assigned to that cell's variable and shown in that cell's field. That
stays true keystroke by keystroke as a cell is edited.

(Terminology: Since there's a one-to-one correspondence between cells and fields
and variables, we use all three terms interchangeably but, conceptually, a cell
is an abstraction representing an assignment of a value to a variable along with
constraints. A variable in this context means one of the symbols we're assigning
to as part of the constraint satisfaction problem Reciplier is solving. And of
course fields in this context refer to the UI elements where the user can make
explicit assignments of values to variables or see those values change.)

At every moment, every cell's field is shown in red if cval differs from any of
the expressions in ceqn, given the assignments of all variables.

### Freezing and unfreezing cells

Any cell at any time may be marked as frozen. The effect of that is the cell's
cval is appended to its ceqn. In other words, cvar = cval is treated as one of
the contraints. Unfreezing removes cval from ceqn again, meaning ceqn once again
has no constants. A cell is always treated temporarily as frozen while it's
being edited. If it started frozen and you edit it, it stays frozen at its new
value.

There's no extra flag or state variable for whether a cell is frozen. If its
ceqn includes a constant, it's frozen; if not, it isn't. Freezing appends
cval to ceqn; unfreezing removes any constant from ceqn. (Again, more than
one constant in ceqn is an error.)

### Always Be Solving

Say the user edits cell c, defined with `{x: 3y = 6}` so having a cvar of `x`,
to have a cval of 12 instead of the initial 6. And suppose c is marked unfrozen,
so ceqn is [`3y`]. While c is being edited, we temporarily append the current
cval of 12 to c's ceqn and send all the ceqns and cvals to the solver.
(Implementation note: we're not literally appending to ceqn, we're just sending
all the current ceqns as they are except we're sending c's ceqn with c's cval 
tacked on.)

If the solver finds a solution, all the cells insta-update. If not, and if any
cells besides c are frozen (c's frozen status doesn't matter since we're editing
it), put up a banner saying "Overconstrained! Try unfreezing cells.". If the
solver finds no solution despite all cells other than c being unfrozen, put up a
banner saying "No solution found". These banners are shown live, while the user
is typing, i.e., they're recomputed on every keystroke.

## Use Cases Beyond Recipes

Consider this, which does exactly what you'd expect:

```
{a: 3}, {b: 4}, {c: sqrt(a^2 + b^2)} is a Pythagorean triple.
```

Or without solving for the hypotenuse:

```
{a: 3}, {b: 4}, {c: 5} is a Pythogorean triple.

Sanity check: {a^2 + b^2 = c^2} is the squared hypotenuse.
```

We also want a slick UI to mark fields as fixed. Maybe you want to fix side b
and see how changing side a affects side c. Without that ability it would be 
arbitrary which of the other fields would change when you edited one.

If the user ever causes the constraints to be violated, like by marking a=3 and
b=4 as fixed and then setting field c to something other than 5, or the squared
hypotenus field to something other than 25, then the UI always lets you but any
non-fixed field whose equation is false is shown in red. (Also you can't mark a
field fixed when in that state.)

For example, if you had a=3 (fixed), b=4 (fixed), and changed the 5 in the c 
field to 6, then the last field would turn red and show its violated equation as
"25 != 36". But as soon as you clicked away from field c, it would recompute
itself as the only value that makes all the equations true, namely 5.

If you left the c field as 5 and wrote a 49 in the last field, then it would
turn red as you were typing the 49. When you clicked away it would recompute
itself to 25.

What if the initial template is impossible? Like:

```
{a: 3}, {b: 4}, {c: 6} is a Pythagorean triple.

<!-- Hidden constraint: {a^2 + b^2 = c^2} -->
```

We fail loudly in that case and make it impossible to miss where the problem is.
Anti-magic FTW.

Side note for that example: We want to support arbitrary markdown, including 
html, so you can, for example, put intermediate equations you don't want 
cluttering the recipe in html comments.

### Use Case: Breakaway Biscuits

Stretching the concept of "recipe" far beyond the breaking point, here's a super
fun and potentially super useful tool when watching a bike race:

```
The riders in the break have a {m:1}:{s:30}s gap with {d:20}km to go.
So if the break does {vb:40}km/h ({0.621371vb}mph) then the peloton needs to do 
{vp: pd/t}km/h ({0.621371vp}mph) to catch them at the line.

Scratchpad:
* Gap in hours: {gt: m/60+s/3600} (ie, {m+s/60}m or {60m+s}s or, heck, {gt/24}d)
* Gap distance: {gd: vb*gt}km ({0.621371gd}mi) (I think vb not vp for this?)
* Breakaway's time till finish: {t: d/vb}
* Peloton's distance to the line: {pd: d+gd}
```

It's like making a spreadsheet and doing what-if analysis. We've put that and 
some of the other examples from this document in the dropdown of recipes.

Here's a related one for making sure we finish a family bike tour on time:

```
Distance:        {d:66} miles
Start time:      {h:6}:{m:45}am             <!-- {s: h+m/60} hours  -->
End time:        {H:13}:{M:00} (24H format) <!-- {e: H+M/60} hours  -->
Wall clock time: {w: e-s} hours = {floor(w)}h{(w-floor(w))*60} minutes
Rest stop 1:     {b1:} hours = {b1*60 = 26} minutes
Rest stop 2:     {b2:} hours = {b2*60 = 37} minutes
Rest stop 3:     {b3:0} hours = {b3*60} minutes
Total breaks:    {b: b1+b2+b3} hours
Riding time:     {t: w-b} hours = {floor(t)}h{(t-floor(t))*60}m
Avg speed:       {v: d/t} mph
Unadjusted spd:  {u: d/w} mph
```

(This was originally
[a spreadsheet](https://docs.google.com/spreadsheets/d/1LQUDFSLpxtOojcSSLMFWPyRS70eCP59TQHppnu14Px0/edit?gid=0#gid=0)
but it was surprisingly cumbersome that way. You have to give explicit formulas
for each variable you may want to infer from the others. You also have to keep
values and formulas separate in a spreadsheet.)

## Errors and Corner Cases

Fail loudly in the following cases:

1. Duplicate variable: More than one cell with the same cvar.

2. Undefined symbol: Any expression in any ceqn contains a symbol that does not
match the cvar of any cell.

3. Logical impossibility: The template itself contains contradictions. As
discussed in the example with Pythagorean triples.

4. Syntax error. E.g., nested curly braces or anything else we can't parse.

5. Unlabeled constant: If any expression is a constant without a human-assigned
cvar. Reasons to treat it as an error: (1) It doesn't make sense to have a field
that when you change it it has zero effect on anything else. (2) If you really
want that for some reason, just give the field an explicit cvar.

6. Unreferenced variable: A labeled cell (one with an explicit cvar) isn't
referenced by any other cell. Like if you define {tau: 6.28} and then never use
it. If you're doing that on purpose, like you want that constant defined for use
in the future, the workaround is something like 
`{tau: 6.28} <!-- {tau} not currently used -->`.
You're basically adding a comment that makes the linter shut up.

7. Multiple values: A cell has more than one numerical value, even if it's the
same value. Like {x: 1 = 2} or {x: 1 = y*z = 1}.

8. Self-reference: A cell references its own cvar and no other variables.

9. Unknown unknowns: Other errors we haven't thought of yet or ways the template
file violates any expectations. Anti-Postel FTW.

## Future Work

1. Markdown rendering

2. Instead of making a slider for whatever variable is called "x", make a slider
for all labeled cells, and make it easy to dismiss ones you don't need.

3. Direct links to recipes. Option 1: encode the entire template verbatim in the
query string. Option 2: encode which template file and encode every variable
explicitly in the query string.

4. Double-clicking to freeze/unfreeze is pretty terrible. For one thing, I 
double-click cells by muscle memory to highlight the current contents of a field
in order to overwrite it. Worse, if you don't happen to ever double-click a
cell, freezing/unfreezing is totally undiscoverable.

5. I'm thinking we need to go more anti-magic. Currently when you edit a field
the system just tries changing other variables until something works. That's
pretty magical. What if instead you could see other fields kind of cross
themselves out and show the new values implied by your edit? Or, like, if more
than one cell can change to accommodate your edit you're forced to explicitly
freeze cells until that's no longer the case?

6. Bug: "2 x" should parse to "2*x"

7. Big Anti-Colon Refactor...

The urtext of a cell is a list of one or more expressions in curly braces and
separated by equal signs. Like `{x}` or `{a^2 + b^2 = c^2}` or `{pi = tau/2}` or
`{7 = y = 3z}`. Cells are initially marked frozen in the UI if and only if their
urtext starts with a constant. So if you want to define a constant, do it like
`{6.28 = tau}`. Arithmetic expressions that eval to a number count as constants.
If you define constant with the variable first, like `{tau = 6.28}`, that's fine
but the user may need to freeze the cell in the UI to keep the solver from
finding a solution by changing the ratio of a circle's circumference to its
radius.

Consider this recipe template:

```
2*{x = 6} + 3*{y} = {33 = 2x + 3y}
5*{x} - 4*{y} = {2 = 5x - 4y}
```

Note that the only solution is x=6, y=7. We parse the template like so:

```
2*{cvar: var01, cval: 6,    ceqn: [var01, x]} + 
3*{cvar: var02, cval: null, ceqn: [var02, y]} = 
  {cvar: var03, cval: 33,   ceqn: [var03, 33, 2x + 3y]}
5*{cvar: var04, cval: null, ceqn: [var04, x]} - 
4*{cvar: var05, cval: null, ceqn: [var05, y]} = 
  {cvar: var06, cval: 2,    ceqn: [var06, 2, 5x - 4y]}
```

Every cell gets a nonce variable. We send that to solvem() like so:

```javascript
solvem([ [var01, x],
         [var02, y],
         [var03, 33, 2x + 3y],
         [var04, x],
         [var05, y],
         [var06, 2, 5x - 4y] ],
       { var01: 6, 
         var02: null,
         var03: 33,
         var04: null,
         var05: null,
         var06: 2,
         x: null,
         y: null })
```

Mathematica can solve that like so:

```wolfram
Solve[{v1 == x, v2 == y, v3 == 33 == 2 x + 3 y, v4 == x, v5 == y, 
       v6 == 2 == 5 x - 4 y}, {v1, v2, v3, v4, v5, v6, x, y}]
```





The solver treats var03 and var06 as constants. It also treats var01 and var04
and x as aliases. Same for var02 and var05 and y. So the solver isn't actually
slowed down by the superfluous cvars.

[If this works] We use only equations -- one or more expressions separated by 
equal signs -- to define cells. A cell is initially marked frozen if its urtext
starts with a constant or with a symbol and then a constant. So `{7 = x+y}` and
`{tau = 6.28}` would be initially marked frozen whereas `{x+y = 7}` and 
`{tau/2 = 3.14}` would be initially marked unfrozen.

Wait, or go more extreme anti-magic and remove that "or": the only way to make a
cell start frozen is if the urtext starts with a constant. So you have to do
`{6.28 = tau}` (or you can always manually mark it frozen in the UI).

It's still the case that having a constant in the ceqn is what defines
frozenness.

Brainstorming: 
double square brackets could indicate frozen. 
or a symbol in all caps.



SCRATCH AREA:

Wait, do we need a special case for a cell like {x: 0} which is just saying
that x is initialized to 0, not that it's a constraint that x=0? How do we 
distinguish that from something like {climbed + descended = 0} for a biking
round trip where the net elevation is always definitionally zero? I think the
answer is never use a special case (anti-magic!) and we just need to figure out
the preceding future work item here, where the user just has to be explicit that
the net-elevation cell is frozen.

7. Do we want special syntax to distinguish "here's an initial default value for
this cell but don't freeze it" vs "this is a constant we're defining that can't
change or at least should be frozen unless the user explicitly unfreezes it"?
First idea: `{tau: 6.28}` means `tau` is frozen and `{scale: (1)}` means `scale`
is being set to 1 as a default but is unfrozen. Either way, the user can always
toggle the frozenness at will.

Candidates:
1. Parens: `{x: 1}` => frozen; `{x: (1)}` => unfrozen
2. Equal-sign: `{x = 1}` => frozen; `{x: 1}` => unfrozen

Parens is a little gross and ad hoc.
Equal-sign means an awkward special case. We have to detect the case of no
explicit cvar and ceqn having two elements, a bare cvar and a constant.

Oh man, now I'm questioning the whole colon thing. Can every cell have it's cvar
just be explicit only if the cell definition starts with a variable and an equal
sign? That sure makes a lot of things cleaner. Then we could even bring back the
colon specifically to indicate "this is not a constraint, just the initial
setting for this variable".

Let's refactor this in stages:

1. Replace all colons with equal signs.
2. Except for things like `{x:}` -- that colon just goes away.
3. Pick another symbol like "~" for "set but don't constrain".
4. Make sure that all works.
5. Change "~" to ":".

What about constraints like `{2x+3y = 33}`?

...

Here's the version without universal noncing for comparison:

```
2*{cvar: x, cval: 6, ceqn: [x]} + 
3*{cvar: y, cval: null, ceqn: [y]} = 
{cvar: var01, cval: 33, ceqn: [var01, 33, 2x + 3y]}
5*{cvar: var02, cval: null, ceqn: [var02, x]} - 
4*{cvar: var03, cval: null, ceqn: [var03, y]} = 
{cvar: var04, cval: 2, ceqn: [var04, 2, 5x - 4y]}
```

```
solvem([
  ['d1', 9],                              // d1 = 9 (fixed)
  ['r1', 'd1/2'],                         // r1 = d1/2
  ['tau', 6.28],                          // tau = 6.28 (constant)
  ['x'],                                  // x is free
  ['r', 'd/2'],                           // r = d/2
  ['d'],                                  // d is free
  ['A'],                                  // A is free
  ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],  // THE BIG CONSTRAINT
], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1})
```

```wolfram
Solve[{
  v1 == 1 x,
  v2 == 3 x,
  v3 == d,
  v4 == w,
  v5 == h,
  v6 == z,
  v7 == x == 1,
  v8 == d1 == 9,
  v9 == r1 == d1/2,
  v10 == r == d/2,
  v11 == d == 2 r,
  v12 == tau == 628/100, 
  v13 == A == 1/2*tau*r^2 == 1/2*tau*r1^2*x == w*h,
  v14 == w^2 + h^2 == z^2}, 
  {v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, 
   x, d, w, h, z, A, d1, r1, r, tau}]
```

