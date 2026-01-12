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

Also you can edit the recipe template and Reciplier reparses it and updates the 
fields and the rest of the UI keystroke by keystroke as you edit. The template
defines the UI and you can use that UI and redefine it all on the same page. It
should make sense when you try it.

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

Any cell that scales linearly is multiplied by x, what we're using in this
template as the scale variable. The confusing bit is the area, A, which is
constrained to be x times the _original_ area, which is based on the original
diameter, d1, which we set to 9, implying an original radius, r1, of 4.5. The
new radius, r, after scaling, is implied by the next equality in A's cell.
Namely, the area must also equal pi times r^2. And, if using a rectangular pan,
the width and height need to multiply to that same area. The final line in the
template says what the diagonal of the w-by-h pan must be, per Pythagoras.

(Side note: Having both {d = 2r} and {r = d/2} is unnecessary. If a variable is
defined/constrained elsewhere, you can just put it in braces, no equation
needed. But redundant constraints don't hurt. They're nice sanity checks.)

(Technical note: We support Mathematica-style arithmetic syntax where "2x" means
"2*x". More on math syntax in the section about the constraint solver.)

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
actually under-constrained. In particular, fixing one of w or h to any number
implies the other. Reciplier will pick arbitrary values satisfying the
constraints. If those choices are silly (as in the 0.01x6361.7-inch pan above)
the user can just change them and optionally freeze them. Maybe you have only
9x9-inch square pans so you fix w at 9 and then if Reciplier says that that
implies h=27, you can take that to mean 3 9x9-inch pans in a row.

Maybe you slide the slider judiciously to make sure h is a multiple of 9. Or add
more constraints. Reciplier is your oyster!

But for normal recipes, just put braces and x's on every number that should
scale linearly. For example, a "12" in the recipe becomes "{12x}" to show that
what was originally a 12 is now a 12 multiplied by the scale factor, x. And then
remember to include "{x = 1}" somewhere in the template. That's what generates
a slider for scaling the recipe.

As always with Reciplier, changing any field causes the rest to insta-update.

[TODO: put the supported math syntax in its own section]

## The Constraint Solver

This part is more technical spec than functional spec. The rest of Reciplier 
treats the solver as a black box. Inside the black box is currently an 
abomination cobbled together by Claude and Gemini and GPT. Or it's a work of
genius, who knows. I just know it works for the use cases I've contrived so far.
In the future we could swap in something fancier, or call out to Mathematica's
NSolve or NMinimize or something.

In the meantime, we just need to make sure the interface to the solver in the
code is clean and nice. For that, and for details about what kind of math
notation Reciplier supports, read on.

The constraint solver has a few components. First is `preval` which preprocesses
a math expression string so we can eval it as JavaScript. This includes implicit
multiplication, like `2x` → `2*x`, exponentiation with `^`, and all the standard
functions like sqrt, sin, cos, etc, which JavaScript needs to have `Math.`
prepended to. The idea is to support standard ascii math like `3y+cos(x)/4`.

The variables in an expression must be strings that are valid identifiers in
JavaScript-like languages, like `x` or `a1` or `some_var`. Note that even though
we turn `2x` into `2*x`, `x2` is not `x*2`, it's just its own variable.

Next is `vareval` which, after preprocessing with `preval`, evals a math
expression using a given assignment of the variables referenced in the
expression. For example, `vareval('2x+y', {x: 3, y: 1})` returns 7. If the eval
fails to return a number, `vareval` returns null.

Another helper function we need is `varparse` which takes an expression and
returns the list of variables used in it. Also `isconstant` which just checks if
an expression evals to a number using `vareval` with an empty hash for the
variable assignments.

Finally, the `solvem` function takes a list of equations and a hash of variables
with initial numerical assignments (as in `vareval` except that for `solvem`,
initial values are allowed to be omitted by specifying them as null) and tries
to find a satisfying assignment of numeric values to the variables.

An equation is a list of one or more expressions taken to all be equal. Every
expression in every equation should eval via `vareval` to a number, as long as
`vareval` is given an assignment of numbers to all the variables the expression
references.

The `solvem` function returns an object with three attributes:
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

If the variables are underconstrained `solvem` returns a satisfying assignment
arbitrarily. In practice it may prefer positive values and smaller values.

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

A cell is a data structure that includes these fields:

* `cval` is the current value assigned to this cell
* `ceqn` (pronounced "sequin") is a list of one or more non-constant expressions
that are constrained to be equal to each other and possibly to cval
* `fix` is a boolean saying whether the cell is frozen
* `urtext` is the exact string between the curly braces in the recipe template
that defines the cell

Recall that the user can edit the template and thus change the urtext any time.
Everything is reparsed from scratch when that happens.

Each cell in the recipe template is parsed like so:

1. Split the urtext on "=" to get a list of expressions. 
2. If the first expression in the list is a constant, set `fix` to true.
3. Filter out all constant expressions. If more than one, that's an error.
4. Set cval to the constant if there is one, null otherwise.
5. Set ceqn to the list of non-constant expressions.

## Core Algorithm

1. Initially we just send everything to solvem as written. Each urtext is parsed
as an list of expressions, including constants, and we use varparse to get the 
union of all symbols used in all the expressions. There has to be a satisfying
assignment at this point or it's just a bad template and we show an error 
banner. 

2. Set the initial frozen status of each cell according to whether the first 
expression in the urtext is a constant.

3. Use the satisfying assignment from solvem to compute the cval for each cell.

4. Set the ceqn of each cell to be the non-constant expressions in the urtext.

That's it. Now when the user edits a cell, all other nonfrozen cells are free to
change.

### Freezing and unfreezing cells

Any cell at any time may be marked as frozen (`fix` set to true). Conceptually
that means that it's treated as one of the constraints that the cell have a
value of cval. So when `fix` is true or when a cell is being edited, we 
non-destructively append cval to ceqn when calling solvem.

Again, if the first expression in a cell's urtext is a constant, that cell
starts frozen. This is what causes {6.28 = tau} to yield a field in the UI
that's initially frozen while {tau = 6.28} doesn't.

For example, if a cell in the template is defined as `{x = 3y = z}` then
it will ceqn set to [`x`, `3y`, `z`], and cval set to null. A cell `{x = y = 1}`
will have ceqn set to [`x`, `y`] and cval set to 1. A plain `{v}` will have a
cval of null and ceqn [`v`].

Every cell has a corresponding field in the UI and cval is always the current
value in that field. That stays true keystroke by keystroke as a cell is edited.

### Always Be Solving

At every moment, every cell's field is shown in red if cval differs from any of
the expressions in ceqn, given the assignments of all variables returned by 
solvem.

Say the user edits a cell c defined with `{x = 3y = 6}` to have a cval of 12
instead of the initial 6. Cell c's ceqn is [`x`, `3y`]. As soon as the edit
happens, we call `solvem([..., ['x', '3y', 12], ...], {x: null, y: null})`.
The 12 is included because the user is editing the field for cell c.

If the solver finds a solution, all the cells insta-update. If not, put up a
banner saying "No solution found". If any cells besides c are frozen (c's frozen
status doesn't matter since we're editing it) then the banner says "No solution
found (try unfreezing cells)". The banner is shown live, while the user is
typing, i.e., it's recomputed on every keystroke.

## Use Cases Beyond Recipes

Consider this, which does exactly what you'd expect:

```
{a = 3}, {b = 4}, {c = sqrt(a^2 + b^2)} is a Pythagorean triple.
```

Or without solving for the hypotenuse:

```
{a = 3}, {b = 4}, {c = 5} is a Pythogorean triple.

Sanity check: {a^2 + b^2 = c^2} is the squared hypotenuse.
```

We have a slick UI (TBD) to mark fields as frozen or fixed. Maybe you want to
fix side b and see how changing side a affects side c. Without that ability it
would be arbitrary which of the other fields would change when you edited one.

If the user ever causes the constraints to be violated, like by marking a=3 and
b=4 as fixed and then setting field c to something other than 5, or the squared
hypotenuse field to something other than 25, then the UI always lets you but any
non-fixed field whose equation is false is shown in red. (Also you can't mark a
field frozen when in that state.)

For example, if you had a=3 (fixed), b=4 (fixed), and changed the 5 in the c 
field to 6, then the last field would turn red and show its violated equation as
"25 != 36". But as soon as you clicked away from field c, it would recompute
itself as the only value that makes all the equations true, namely 5.

If you left the c field as 5 and wrote a 49 in the last field, then it would
turn red as you were typing the 49. When you clicked away it would recompute
itself to 25.

What if the initial template is impossible? Like:

```
{a = 3}, {b = 4}, {c = 6} is a Pythagorean triple.

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
The riders in the break have a {m=1}:{s=30}s gap with {d=20}km to go.
So if the break does {vb=40}km/h ({0.621371vb}mph) then the peloton needs to do
{vp = pd/t}km/h ({0.621371vp}mph) to catch them at the line.

Scratchpad:
* Gap in hours: {gt= m/60+s/3600} (ie, {m+s/60}m or {60m+s}s or, heck, {gt/24}d)
* Gap distance: {gd= vb*gt}km ({0.621371gd}mi) (I think vb not vp for this?)
* Breakaway's time till finish: {t = d/vb}
* Peloton's distance to the line: {pd = d+gd}
```

It's like making a spreadsheet and doing what-if analysis. We've put that and 
some of the other examples from this document in the dropdown of recipes.

Here's a related one for making sure we finish a family bike tour on time:

```
Distance:        {d=66} miles
Start time:      {h=6}:{m=45}am             <!-- {s = h+m/60} hours  -->
End time:        {H=13}:{M=00} (24H format) <!-- {e = H+M/60} hours  -->
Wall clock time: {w = e-s} hours = {floor(w)}h{(w-floor(w))*60} minutes
Rest stop 1:     {b1} hours = {b1*60 = 26} minutes
Rest stop 2:     {b2} hours = {b2*60 = 37} minutes
Rest stop 3:     {b3=0} hours = {b3*60} minutes
Total breaks:    {b = b1+b2+b3} hours
Riding time:     {t = w-b} hours = {floor(t)}h{(t-floor(t))*60}m
Avg speed:       {v = d/t} mph
Unadjusted spd:  {u = d/w} mph
```

(This was originally
[a spreadsheet](https://docs.google.com/spreadsheets/d/1LQUDFSLpxtOojcSSLMFWPyRS70eCP59TQHppnu14Px0/edit?gid=0#gid=0)
but it was surprisingly cumbersome that way. You have to give explicit formulas
for each variable you may want to infer from the others. You also have to keep
values and formulas separate in a spreadsheet.)

## Errors and Corner Cases

Fail loudly in the following cases:

1. Logical impossibility: The template itself contains contradictions. As
discussed in the example with Pythagorean triples.

2. Syntax error. E.g., nested curly braces or anything else we can't parse.

3. Bare constant: A cell contains nothing but a constant. Reasons to treat it as
an error: (1) It doesn't make sense to have a field that when you change it it
has zero effect on anything else. (2) If you really want that for some reason,
just assign a variable to that you don't use elsewhere.

4. Unreferenced variable: A variable in a cell isn't referenced by any other
cell. Like if you define {6.28 = tau} and then never use tau. If you're doing
that on purpose, like you want that constant defined for use in the future, the
workaround is something like `{6.28 = tau} <!-- {tau} not currently used -->`.
You're basically adding a comment that makes the linter shut up.

5. Multiple values: A cell has more than one numerical value, even if it's the
same value. Like {x = 1 = 2} or {x = 1 = y*z = 1}.

6. Unknown unknowns: Other errors we haven't thought of yet or ways the template
file violates any expectations. Anti-Postel FTW.

## Future Work

1. Markdown rendering.

2. Instead of making a slider for whatever variable is called "x", make a slider
for every cell for which the first expression in the urtext is a variable. And
make it easy to dismiss ones you don't need. Also remove the variable name from
two of the three places it currently appears in the UI, namely, the bounds of
the slider. Finally, right above the slider, where we currently show "x:" on the
left and the numeric value on the right, instead show the variable name, a
colon, and then the line from the template where the variable occurs, with
values filled in and with the value for the slider variable highlighted.

2.5 Idea for syntax for specifying the bounds of the sliders (which by default
can be cvar/10 to cvar*10): {0 < x = 1 < 10}

3. Direct links to recipes. When you select a recipe template from the dropdown,
update the query string like "reciplier.dreev.es/?recipe=crepes" using the keys
in `recipeDropdown`. If the user edits the template, encode the whole thing with
lz-string in real time like "reciplier.dreev.es/?rawcipe=GARBLEDYGOOK". Also, as
the user edits fields, append the cvals to the URL as well, like
"reciplier.dreev.es/?recipe=pyzza&x=3&a=9&b=12&c=15".

4. Crowdsource templates. If the template text area doesn't match one of the 
existing reciplates (the dropdown shows "Custom Template" in this case) then 
a buttom becomes clickable that opens a popup that prompts the user to submit 
their template to be considered for inclusion in the dropdown. Prompt the user
for a name for their recipe too.

5. Double-clicking to freeze/unfreeze is terrible. For one thing, I double-click
cells by muscle memory to highlight the current contents of a field in order to
overwrite it. Worse, if you don't happen to ever double-click a cell then
freezing/unfreezing is totally undiscoverable.

6. Bug: "2 x" should parse to "2*x".

7. Thinking out loud about going more anti-magic: Currently when you edit a
field the system just tries changing other variables until something works.
That's pretty magical. What if instead you could see other fields kind of cross
themselves out and show the new values implied by your edit? Or, like, if more
than one cell can change to accommodate your edit you're forced to explicitly
freeze cells until that's no longer the case?

8. Make it easy to add any utility functions we want available for defining
cells. I.e., functions or constants that can be referred to in the vareval
environment. Maybe even have that code available in the UI, unobtrusively so as
not to clutter the UI for the simple recipe use case.

9. Is it too weird to define constants via constraints where the constant part
comes first? Syntax like {tau := 6.28} could define a constant and it's just
uneditable, rendering as normal text, no field. Another option is the idea above
about utility functions.

10. Then could we support something like {goal_units := "kg"} and then ... I
guess that's turning this thing into a whole templating engine like ERB.

11. Support arithmetic in the fields, not just the template.

13. Kitchen-sink solver: Try as many solvers as we can scrounge up. The outer
solvem function can call out to each solver and if any return a satisfying 
assignment, Bob is one's uncle. The beauty of NP-complete problems is it's easy
to check candidate solutions. In particular, move the solver currently in 
gemini-solver.js into a sub-black-box in the solvem() black box. Keep track of
whether its solution is ever used.

14. Each time solvem returns sat==false, print to the browser console the qual 
for it. Also print the constraint satisfaction problem in Mathematica syntax so
I can confirm if it's really true that there's no solution. For example:
Solve[{c == 50, a == 3x, b == 4x, 25 == a^2 + b^2 == c^2}, {c, a, b, x}]

15. It's kind of buggy-seeming how choosing "Custom Template" doesn't change
what's in the recipe template text area. PS: I fixed that, so now maybe we can
just ditch the Blank one.

16. Show a spinner or something while searching for a solution.

SCRATCH AREA:

Brainstorming: 
* double square brackets could indicate frozen, or a symbol in all caps


Bug report 1:

Replicata:

1. Load the dial recipe
2. Freeze the vini cell at 73
3. Freeze the vfin cell at 70
4. Freeze the start time (tini) field
5. Change the rate (r) to -1

Expectata: That the end date changes.

Resultata: "No solution (try unfreezing cells)" and the tfin field is red.


one of the kitchen sink solvers must be way too slow. everything's laggy :(
is it the gradient descent solver? do all quals still pass without that one?

also i'm seeing this:

Contradiction: {A^2 + B^2 = C^2} evaluates to 1.4023 ≠ 1.4023

```
Scaled by a factor of x={x=1}.

Roll out dough into a right triangle with legs of length a={A = a*x} and b={B = b*x} and hypotenuse c={C = c*x}.
Then eat it.

Sanity check: {A}^2 + {B}^2 = {A^2} + {B^2} = {A^2 + B^2 = C^2}
{a^2 + b^2 = c^2}