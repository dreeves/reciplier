[This document is strictly human-written and human-edited.]

# Reciplier

Hosted at [reciplier.dreev.es](https://reciplier.dreev.es).
Background at [AGI Friday](https://agifriday.substack.com/p/reciplier).

It turns out this is way more general than recipes and is kind of halfway to a
spreadsheet. Better than a spreadsheet in some ways. It also subsume's my old
"calculator calculator" app that I called Sheeq.

# Functional Spec for Generalized Reciplier

The most basic Reciplier use case starts with a recipe template like so:

```
Mix {2x} eggs and {3x} wheels of cheese. Then eat it.

This recipe is scaled by {x : 1}.
```

Each expression in curly braces is called a cell. Reciplier renders each cell,
by default, as a numeric field in the UI and you can edit any of them at will,
causing the others to change accordingly to keep all the constraints satisfied,
like how the number of wheels of cheese is always 3 times whatever x is. Or edit
the field for wheels of cheese to 18 and the number of eggs will automatically
change to 12 and x to 6.

Also you can edit the recipe template and Reciplier reparses it and updates the 
fields and the rest of the UI keystroke by keystroke as you edit. The template
defines the UI and you can use that UI and redefine it all on the same page. It
will make sense when you try it.

### Fancier Constraints

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
Or any pan as long as its area is {A} square inches. Heat at 350 degrees.

This recipe is scaled by a factor of {x : 1}.

Constraints, constants, and sanity checks:
* The true circle constant is {tau = 6.28}
* The original pan diameter at 1x scale is {d1 = 9} (radius {r1 = d1 / 2})
* Scaled radius is {r = d/2} and scaled diameter is {d = 2r}
* The squared diagonal of the rectangular pan is {w^2 + h^2 = z^2}
* The area again is {A = x*1/2*tau*r1^2 = 1/2*tau*r^2 = w*h}
```

Any cell that scales linearly is multiplied by x, what we're using in this
template as the scale variable. The confusing bit is the area, A, which is
constrained to be x times the _original_ area, which is based on the original
diameter, d1, which we set to 9, implying an original radius, r1, of 4.5. The
new radius, r, after scaling, is implied by the next expression in A's cell in
the final line. Namely, the area must also equal pi times r^2 (`1/2*tau*r^2`).
And, if using a rectangular pan, the width and height need to multiply to that
same area. The penultimate line in the template says what the diagonal of the
w-by-h pan must be, per Pythagoras. Phew.

(Side note: Having both {d = 2r} and {r = d/2} is unnecessary. If a variable is
defined/constrained elsewhere, you can just put it in braces, no equation
needed. But redundant constraints don't hurt. They're nice sanity checks.)

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
a slider for scaling the recipe. TODO: no longer.

As always with Reciplier, changing any field causes the rest to insta-update.

## Math Syntax

We support normal JavaScript syntax for expressions, like `2+x*y` with these 
additions/exceptions:

1. Equality uses single equal signs, `=` not `==`.
2. We do the thing Mathematica does where you can say `2x` to mean `2*x`. Just
note that only works for a number followed by a variable, not the other way
around. So `x2` is just a variable and `x 2` with a space is a syntax error.
3. Exponentiation is done with `^` but JavaScript's `**` works as well.
4. Standard functions like sqrt, sin, cos, etc, don't need `Math.` prepended.
5. We've defined additional custom functions like `unixtime(y, m, d)`.

The idea is to support standard ascii math like `3y+cos(x)/4`.

The variables in an expression must be strings that are valid identifiers in
JavaScript-like languages, like `x` or `a1` or `some_var`.

Technical note: The `preval` function preprocesses a math expression string so
we can eval it as JavaScript. It turns `^` into `**`, prepends the `Math.`
prefix as needed, adds explicit multiplication symbols, etc.


## The Constraint Solver

This part is more technical spec than functional spec. The rest of Reciplier 
treats the solver as a black box. Inside the black box is currently an 
abomination cobbled together by Claude and Gemini and GPT. Or it's a work of
genius, who knows. I just know it works for the use cases I've contrived so far.
In the future we could swap in something fancier, or call out to Mathematica's
NSolve or NMinimize or something. In the meantime, we just need to make sure the
interface to the solver in the code is clean and nice. 

The solver defines a few helper functions. First is `vareval` which, after
preprocessing with `preval` (described in the previous section on math syntax),
evals a math expression using a given assignment of values to the variables
referenced in the expression. For example, `vareval('2x+y', {x: 3, y: 1})`
returns 7. If the eval fails to return a number, `vareval` returns null.

Another helper function we need is `varparse` which takes an expression and
returns the list of variables used in it. Also `isconstant` which just checks if
an expression evals to a number using `vareval` with an empty hash for the
variable assignments. And `isbarevar` to check if an expression consists solely
of a variable.

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

(PS: I might want to rename those fields to `bum`, `zij`, and `sol` for better
greppability; `bum` being a more polite abbreviation for "assignment" than 
`ass`.)

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

Optionally, two additional hashes can be passed to `solvem`: An infimum hash
gives lower bounds for variables, and a supremum hash gives upper bounds. For
example, if we only want positive values for a Pythagorean triple, we could do
this: `solvem([['a^2+b^2', 'c^2']], {a: 3, b: 4, c: null}, {c: 0}, {})`.
The final two arguments default to empty hashes, meaning no constraints on the
variables.

The constraint solver is the core of Reciplier but how it comes up with its
satisfying assignments is black magic.


## Data Structures and Business Logic

A cell is a data structure that includes these fields:

* `cval` is the current value assigned to this cell
* `ceqn` (pronounced "sequin") is a list of one or more non-constant expressions
that are constrained to be equal to each other and possibly to cval
* `fix` is a boolean saying whether the cell is frozen
* `urtext` is the exact string between the curly braces in the recipe template
that defines the cell

(PS: `fix` is not greppable and kind of pseudovernacular jargon where you have
to disambiguate it in English, so I'm considering something cute like `icy`
instead. But I could also change the terminology to something like "pegged"
or "static" instead of "frozen". I don't think `peg` has the pseudovernacular
jargon problem. Ok, I convinced myself. TODO: Change the terms in the spec from
"frozen"/"freeze" to "pegged"/"peg".)

Recall that the user can edit the template and thus change the urtext any time.
Everything is reparsed from scratch when that happens.

Each cell in the recipe template is parsed like so:

1. Split the urtext on "=" to get a list of expressions. 
2. If the first expression in the list is a constant, set `fix` to true.
3. Filter out all constant expressions. If more than one, that's an error.
4. Set cval to the constant if there is one, null otherwise.
5. Set ceqn to the list of non-constant expressions.

TODO: Update the above in light of bounds (inf/sup) and colon syntax for
specifying an expression for the initial cval.

### Core Algorithm

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

Key invariant: When the user is editing a cell, they are directly editing the
cval. See "Always Be Solving" below.


### Freezing and unfreezing cells

Any cell at any time may be marked as frozen (`fix` set to true). Conceptually
that means that it's treated as one of the constraints that the cell have a
value of cval. So when `fix` is true or when a cell is being edited, we 
non-destructively append cval to ceqn when calling solvem.

Again, if the first expression in a cell's urtext is a constant, that cell
starts frozen. This is what causes {6.28 = tau} to yield a field in the UI
that's initially frozen while {tau = 6.28} doesn't. [TODO: this will be 
changing]

For example, if a cell in the template is defined as `{x = 3y = z}` then
its ceqn will be set to [`x`, `3y`, `z`], and its cval set to null. A cell 
`{x = y = 1}` will have a ceqn of [`x`, `y`] and cval of 1. A plain `{v}` will
have a cval of null and ceqn [`v`].

Every cell has a corresponding field in the UI and, again, cval is always the
current value in that field. That stays true keystroke by keystroke as a cell is
edited.

### Always Be Solving

At every moment, every cell's field is shown in red if cval differs from any of
the expressions in ceqn, given the assignments of all variables returned by 
solvem.

Say the user edits a cell c defined with `{x = 3y = 6}` to have a cval of 12
instead of the initial 6. Cell c's ceqn is [`x`, `3y`]. As soon as the edit
happens, we call `solvem([..., ['x', '3y', 12], ...], {x: null, y: null})`.
The 12 is included because the user is editing the field for cell c.

If the solver finds a solution, all the cells' cvals insta-update to it, by
calling vareval for each cell with the first expression in ceqn and the
assignment from the solver. The solution will necessarily match the cval of 12
that the user entered in cell c since that value was included as a constraint.
If the solver doesn't find a solution, insert a banner saying "No solution
found" and don't update any cvals. If any cells besides c are frozen (c's frozen
status doesn't matter since we're editing it) then the banner says "No solution
found (try unfreezing cells)". The banner is shown live, while the user is
typing, i.e., it's recomputed on every keystroke.

## Inequalities 

If a cell includes any inequalities then all of the following criteria must be
met:

* The cell urtext starts with a constant followed by `<` or `<=`. We call this
  constant the inf (or infimum).
* The cell urtext ends with a constant preceded by `<` or `<=`. We call this
  constant the sup (or supremum).
* After removing the the inf and sup and the adjacent inequality symbols, the
  urtext is a normal equation with no other inequality symbols.
* One of the expressions in the urtext is a bare variable.
* Either inf < sup or, if inf = sup, then both inequalities in the urtext are
  nonstrict. So you can have `3 <= x <= 3` but not `3 < x <= 3`.

If any of those are not met, we show a corresponding error banner:
* "Inequalities must start and end with a constant"
* "Inequalities must be possible to satisfy"


## Sliders

For every variable which appears as a bare variable (see `isbarevar` in the 
Constraint Solver section) in a cell, we create a slider for that variable. Each
slider is created with a close button in the upper right so the user can dismiss
sliders they don't want.

If a cell does not include inequalities (see previous section) then default to
`cval/10` and `cval*10` for the slider bounds.

Above the slider [where we previously show "x:" on the left and the numeric
value on the right] we show the variable name, a colon, and then the line from
the template where the variable occurs, with all values filled in, and with the
value for the slider variable highlighted. If the line is too long, replace the
beginning and/or end of it with ellipses so it fits nicely

PS: Wait, I just realized we can kill an if-statement: make a slider for every
variable across all cells.

PPS: More anti-magic advice: A slider for a variable foo is no different in any
way than if the reciplate had a cell {foo}. The only difference is at the UI
level -- a slider rather than a numeric field.

PPPS: Which has me thinking, maybe we should insert sliders in the rendered 
template just like we do with numeric fields. A cell specified with curly braces
is rendered inline as a numeric field and a cell specified like... hmmm...
`{~ a = b ~}` (?) means render it as a slider. Ok, let's not let scope creep get
out of control though. Ignore this PPPS for now.

## New way to specify initially frozen cells and initial/default cvals

TODO: Editing pass for spec above to drop the stuff about starting with a
constant and to say that any cell with an equals-a-constant constraint starts
frozen at that constant.

(Historical note: In a previous version of Reciplier we used colons to label
cells by associating each cell with a specific variable. That turned out to be a
bad idea and is now ancient history. Later we tried the convention that if a
cell's urtext started with a constant, the corresponding field would start
frozen, so you could do {6.28 = tau} instead of {tau = 6.28} if you didn't want
tau inferred based on other cells. That was also a bad idea. It was too easy to
forget that having a cell like {x+y=0} was not actually a constraint unless you
froze the cell, either in the UI or by writing it as {0=x+y} in the reciplate.
Especially if you put a cell like that in an html comment, since then you'd
naturally think of it as purely a constraint because it didn't show up in the UI
at all. Claude misguidedly tried fixing this by having a special case for cells
in html comments, which was an egregious anti-magic violation.)

We use colon syntax for specifying an expression to use as the initial/default
cval for a cell.

For example, {x: 1} means x is initially unfrozen and not unconstrained, whereas
{x = 1} means the cell _is_ initially frozen, just by virtue of having a
constant expression in the list of expressions that are set equal to each other.
The user can still edit it and, orthogonally, still unfreeze it. Cells like 
{a+b = 0} are no different. The constant 0 means the cell is initially frozen.
You can instead specify it as {a+b : 0} and it will start unfrozen. Either way
the field for the cell will start with a 0 in it. 

If you do something like {x = 1 : 2} that's an error:
"Initial value for cell {x = 1 : 2} incompatible with constraints"
But that's fully general. Maybe you have {x : 3} and also have other cells that
imply x=2. Then you'd get that same error.

The expression after the colon doesn't even need to be a constant. The only
difference is that if it is a constant, it will be used in the initial call to
solvem to find a valid assignment of all the variables. If it's a variable
expression it won't be. But the assignment that comes back from solvem is used
to then eval the post-colon expression. We run solvem _again_ with those values
as constraints and give the above error if that's not a valid assignment. Like
if there are cells {x : 2y} and {6 = y+1} then we make a call to solvem with the
equations x (an "equation" with just one side, which doesn't do anything but we
send it anyway to avoid the if-statement) and 6 = y+1 and with x and y
initialized to null. We get back a valid assignment like x=1, y=5. Using that
assignment we can eval (with vareval) the post-colon expression for the {x : 2y}
cell, yielding 10. So on the follow-on call to solvem we send x = 2y and 6 = y+1
as the equations and with x = 10 and y = 5 as the initial assignments. This 
echoes back x = 10 and y = 5 as a valid assignment and we're done. Again, the
failure to echo back the assignment on the second solvem call yields the above
error about incompatible initial values. 

From that point on, when reciplate is rendered and the user is editing values in
the fields, the post-colon expression is irrelevant. Again, post-colon
expressions are only used to get initial numbers to populate the fields, i.e.,
the initial cvals.

Review of this new world order:

* Order never matters for equations.
* Any cell whose urtext sets it equal to a constant is initially frozen.
* So all equations are explicit constraints, at least initially.
* The user can remove an "equals a constant" constraint by unfreezing the cell.
* (As before, a cell keeps all the non-constant expressions from its urtext in
  in ceqn. The constant, if there is one, is in cval. Then iff the fix field of
  the cell is true, cval is included in the constraint equation that's sent
  to solvem.)
* Any cell can optionally specify an initial value, using a colon followed by an
  expression as the last part of the cell's urtext.

Note how this makes the distinction nice and clear between constraints and 
initial/default cell assignments.

What about {0 < x < 9 : 5} vs {0 < x : 5 < 9}? Parsing is a bit messier if we
allow both so we pick the former. Parsing a cell's urtext means first getting
the expression after the colon for use as the cval, if present. Then remove the
colon and everything to the right of it and get the bounds, if present. Remove
those and, finally, split on "=" to parse the ceqn.

It's an error to have more than one colon in a cell and if this is a colon then
no equal signs or inequality signs can appear to the right of it. The errorcopy
is as follows:
* "Cell {urtext} has multiple colons"
* "Cell {urtext} has more than one expression after the colon"


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
So if the break does {vb:40}km/h ({0.621371vb}mph) then the peloton needs to do
{vp = pd/t}km/h ({0.621371vp}mph) to catch them at the line.

Scratchpad:
* Gap in hours: {gt= m/60+s/3600} (ie, {m+s/60}m or {60m+s}s or, heck, {gt/24}d)
* Gap distance: {gd= vb*gt}km ({0.621371gd}mi) (I think vb not vp for this?)
* Breakaway's time till finish: {t = d/vb}
* Peloton's distance to the line: {pd = d+gd}
```

TODO: Update to match reciplates.js version.

It's like making a spreadsheet and doing what-if analysis. We've put that and 
some of the other examples from this document in the dropdown of recipes.

Here's a related one for making sure we finish a family bike tour on time:

```
Distance:        {d=66} miles
Start time:      {h:6}:{m:45}am             <!-- {s = h+m/60} hours  -->
End time:        {H=13}:{M=00} (24H format) <!-- {e = H+M/60} hours  -->
Wall clock time: {w = e-s} hours = {floor(w)}h{(w-floor(w))*60} minutes
Rest stop 1:     {b1} hours = {b1*60 = 26} minutes
Rest stop 2:     {b2} hours = {b2*60 = 37} minutes
Rest stop 3:     {b3} hours = {b3*60 =  0} minutes
Total breaks:    {b = b1+b2+b3} hours
Riding time:     {t = w-b} hours = {floor(t)}h{(t-floor(t))*60}m
Avg speed:       {v = d/t} mph
Unadjusted spd:  {u = d/w} mph
```

TODO: Update to match reciplates.js version.

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


## Things that are implemented that want incorporated into the spec

* [MDC] Markdown rendering, including html comments.

* [COQ] Each time solvem returns sat=false, print to the browser console a qual
for it. Also print the constraint satisfaction problem in Mathematica syntax so
I can confirm if it's really true that there's no solution. For example:
Solve[{c == 50, a == 3x, b == 4x, 25 == a^2 + b^2 == c^2}, {c, a, b, x}]


## Future Work

* [LNK] Direct links to recipes. When you select a recipe template from the
dropdown, update the query string like "reciplier.dreev.es/?recipe=crepes" using
the keys in `recipeDropdown`. If the user edits the template, encode the whole
thing with lz-string in real time like 
"reciplier.dreev.es/?rawcipe=GARBLEDYGOOK".
Also, as the user edits fields, append the cvals to the URL as well, like
"reciplier.dreev.es/?recipe=pyzza&x=3&a=9&b=12&c=15".

* [CRT] Crowdsource templates. If the template text area doesn't match one of
the existing reciplates (the dropdown shows "Custom Template" in this case) then
a buttom becomes clickable that opens a popup that prompts the user to submit
their template to be considered for inclusion in the dropdown. Prompt the user
for a name for their recipe too.

* [DCF] Double-clicking to freeze/unfreeze is terrible. For one thing, I
double-click cells by muscle memory to highlight the current contents of a field
in order to overwrite it. Worse, if you don't happen to ever double-click a cell
then freezing/unfreezing is totally undiscoverable.

* [SEE] Thinking out loud about going more anti-magic: Currently when you edit a
field the system just tries changing other variables until something works.
That's pretty magical. What if instead you could see other fields kind of cross
themselves out and show the new values implied by your edit? Or, like, if more
than one cell can change to accommodate your edit you're forced to explicitly
freeze cells until that's no longer the case?

* [MTH] Make it easy to add any new math functions or other utilities that we
want available for defining cells. Like how we currently have `unixtime()`.
I.e., functions or constants that can be referred to in the vareval environment.
Maybe even have that code available in the UI, unobtrusively so as not to
clutter the UI for the simple recipe use case. Just an idea for now.

* [CON] Syntax like {tau := 6.28} could define a constant and it's just
uneditable, rendering as normal text, no field. Another option is [MTH] above
about defining new functions and constants. Just an idea for now.

* [ERB] Then could we support something like {goal_units := "kg"} and then ... I
guess that's turning this thing into a whole templating engine like ERB.

* [ARI] Support arithmetic in the fields, not just the template.

* [SPN] Show a spinner or something while searching for a solution. (Not
currently necessary; could be in the future with fancier solvers.)

* [SRR] Add more recipes from http://doc.dreev.es/recipes or even make Reciplier
the master copy for those recipes.

* [BAN] Insert the error banners directly below where the problem is, so that
the UI you're trying to interact with never shifts on you.

* [LNW] See if this can subsume https://dreeves.github.io/loanwolf/

* [DER] Make error messages dismissable. That way if you, say, intentionally
make an unreferenced variable, maybe in order to have a slider for it, then you
get the warning but don't have to employ the workaround of adding a dummy cell
in an html comment in order to suppress the "unreferenced variable" banner.
(I don't think "in order to make a slider for it" makes sense currently. Ignore
this one for now.)

* [GAU] It shouldn't be hard to add a Gaussian elimination solver to the kitchen
sink in csolver.js, why not.

* [IMM] The preval function should handle things like `2(a+b)`. And what about
`x(a+b)`? That's ambiguous between multiplication and a function named `x`.
Which is why Mathematica uses square brackets for function, which, maybe we want
to just embrace that? In the meantime, numbers followed by parentheses should be
treated as multiplication, I think. Add lots of quals before fussing with this.

* [PER] While we're at it, supporting "23%" to mean 0.23 might be handy. Or
maybe we want the percent sign to mean mod. TBD.

* [SYN] When the solver fails and we generate a qual, the version in Mathematica
syntax is buggy. Oh, wait, maybe both the JavaScript and Mathematica syntax are
buggy. Example:
```
solvem([["r",0.5],["100*(1-r)"],["100r"],["fmv"],["pay","(1-"],["get"]], {"r":1,"fmv":1,"pay":1,"get":1})
Solver returned: {"r":0.5,"fmv":1,"pay":1,"get":1}
Mathematica syntax:
Solve[{r == 0.5, pay == (1-}, {fmv, get, pay, r}]
```
I need to find replicata for this. Maybe in pyzza?

* [BTB] Bike Tour Burritos doesn't properly infer an earlier or later start time
when the user bumps the average speed down or up.

* [SLE] The length of the excerpts shown for the sliders should depend on the
display width. Also it should show as rendered, eg, it shouldn't show html
comments. But ignore this; we may be revamping sliders.

* [OPA] If you try to enter a 5-12-13 triangle in the pyzza recipe, it doesn't
work because it's constrained to be similar to a 3-4-5 triangle. Which is fine
but we should find a way to make the problem more transparent to the user. See
also [SEE].

* [TVR] Sometimes, as in the Beeminder commitment dial with goal date, goal
value, and goal rate, we want to say that exactly 1 out of 3 cells needs to be
frozen. The status quo in Beeminderland is that clicking to edit a pegged cell
makes it automatically unpeg itself and one of the other two cells (with no way
to choose which) becomes pegged instead. I don't love that. It feels
insufficiently anti-magical. But having the UI complain at you for entering
values incompatible with the constraints might be annoying. I suspect there's a
best-of-all-worlds solution but I haven't found it yet.


## Latest half-baked ideas for cell syntax

What if every cell is a JSON object:
  {eq: "x = 2y", min: 0, max: 99, ini: 50, elm: 'field', ...}
As syntactic sugar you can omit "eq" like so:
  {x = 2y, min: 0, max: 99, ini: 50, elm: "slider", ...}
And you can omit "ini" like so:
  {x = 2y : 50, min: 0, max: 99, elm: "slider", ...}
And you can specify the min/max like so:
  {0 < x = 2y < 99 : 50, elm: "slider", ...}

Interestingly, we don't ever need to specify in the reciplate whether a cell is
frozen/pegged or not. Consider all possible combinations:
  {x = y, peg: true} -- Error: pegged field needs initial value.
  {x = y : 1, peg: true} -- Same as {x = y = 1}.
  {x = y, peg: false} -- Same as {x = y}.
  {x = y = 7, peg: true} -- Same as {x = y = 7}.
  {x = y = 7, peg: false} -- Error: constant in equation implies pegged.

So for the original use case of a recipe, you'd do this:
Mix {2x} eggs and {3x} cups of flour.
Scaling factor: {x : 1}
{.1 <= x <= 10, elm: 'slider'}

Man, I'm torn. Having a simple syntax for cells is super slick. We could even
say that specifying a cell with bounds makes it render as a slider.

Maybe elegance and simplicity matter more here than full generality of
constraint-solving. So jettison use cases like specifying bounds without
creating a slider. Or use the workaround of creating a slider but commenting it
out so it doesn't actually appear.

There's something I'm still missing. The conflation of specifying constraints
with specifying cells/fields/sliders is messy. I almost want to revisit the old
idea that a cell is associated with a particular variable. Like totally separate
from the rendered reciplate you can specify any list of constraints and
definitions and variables. Then the reciplate lays out text with expressions 
interspersed -- no equations. A simple recipe just has a variable x, with
initial value of 1. The reciplate just inserts expressions involving x.

But then what's the syntax or new UI for constraints vs expressions?

And, actually, the whole beauty is that you can change the value of expressions
and Reciplier figures out what everything has to equal to make that true. So
never mind, I think.

What if specifying bounds for a cell is what makes it render as a slider? On the
one hand, that's messy design. Better to have an explicit indicator for field vs
slider and, orthogonally, the ability to specifying bounds, or perhaps arbitrary
inequalities. But, pragmatically...

* Eggs: {12x} large
* Milk: {5.333x} cups = {1.262x} liters = {1302x} grams
* Flour: {3x} cups = {410x} grams
* Butter: {8x} tbsp melted = {115x} grams
* Salt: {2x} tsp = {14x} grams

Yield: roughly {29x} crepes

Scaled by a factor of {x : 1} {.1 <= x <= 10}
{.1 <= x : 1 < 10}
{.1 <= x < 10 : 1}




SCRATCH AREA: ------------------------------------------------------------------

Brainstorming ways to indicate an initially frozen field:
* NIX: number first in urtext: {6.28 = tau} or {0 < 6.18 = tau < 7}
* double curly braces: {{tau = 6.28}}
* double square brackets: [[tau = 6.28]]
* NIX: symbol in all caps: {TAU = 6.28}
* colon-equals: {tau := 6.28}
* cell has a constant as one of the sides of the equation [GOING WITH THIS]


Bug report 1:

Replicata:

1. Load the dial recipe
2. Freeze the vini cell at 73
3. Freeze the vfin cell at 70
4. Freeze the start time (tini) field (the one in unixtime in seconds)
5. Change the rate (r) to -1

Expectata: That the end date changes.

Resultata: "No solution (try unfreezing cells)" and the tfin field is red.

Bug report 2:

Replicata:

1. Load the dial recipe
2. Freeze the vini cell at 73
3. Freeze the vfin cell at 70
4. Freeze the start time (tini) field (the one in unixtime in seconds)
5. Change the rate (r) to 0

Expectata: To see a "no solution" banner.

Resultata:
TODO


```
Scaled by a factor of x={x=1}.

Roll out dough into a right triangle with legs of length a={A = a*x} and b={B = b*x} and hypotenuse c={C = c*x}.
Then eat it.

Sanity check unscaled: {a}^2 + {b}^2 = {a^2} + {b^2} = {a^2 + b^2 = c^2}
Sanity check scaled:   {A}^2 + {B}^2 = {A^2} + {B^2} = {A^2 + B^2 = C^2}
```

The following call to solvem:

solvem([["2x"],["3x"],["d",18.2383],["w"],["h"],["z"],["A"],["x"],["tau",6.28],["d1",9],["r1","d1 / 2"],["r","d/2"],["d","2r"],["w^2 + h^2","z^2"],["A","x*1/2*tau*r1^2","1/2*tau*r^2","w*h"]], {"x":4.106625693690123,"d":18.23833,"w":128.853787372502,"h":2.0264813325076596,"z":128.86972160608155,"A":261.11979473328654,"tau":6.28,"d1":9,"r1":4.5,"r":9.119165})

returns 

ass = {x: 4.106625693690123, d: 18.2383, w: 128.85357542252515, h: 2.0264779991739617, z: 128.86950962989468, A: 261.11893570865, tau: 6.28, d1: 9, r1: 4.499992598006505, r: 9.11915}
zij = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2.7394753846919868e-11, 0, 0, 1.3234889800848443e-23, 6.462348535570529e-27]
sat=false
