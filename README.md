[This document is strictly human-written and human-edited.]

# Reciplier

Hosted at [reciplier.dreev.es](https://reciplier.dreev.es).
Background at [AGI Friday](https://agifriday.substack.com/p/reciplier).

It turns out this is way more general than recipes and is kind of halfway to a
spreadsheet. Better than a spreadsheet in some ways. It also subsume's my old
"calculator calculator" app that I called Sheeq.

# Functional Spec for Generalized Reciplier

[TODO: I'm trying out an idea for new syntax; not sure if I'll keep this]

The most basic Reciplier use case starts with a recipe template like so:

```
Mix [2x] eggs and [3x] wheels of cheese. Then eat it.

This recipe is scaled by [x = 1].
```

Each expression in brackets is called a cell. Reciplier renders each cell, by
default, as a numeric field in the UI and you can edit any of them at will,
causing the others to change accordingly to keep all the constraints satisfied,
like how the number of wheels of cheese is always 3 times whatever x is. Or edit
the field for wheels of cheese to 18 and the number of eggs will automatically
change to 12 and x to 6.

Also you can edit the recipe template and Reciplier reparses it and updates the 
fields and the rest of the UI, keystroke by keystroke as you edit. The template
defines the UI and you can use that UI and redefine it all on the same page. It
makes sense when you try it.

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
Mix [2x] eggs and [3x] wheels of cheese in a [d]-inch diameter pan.
Or a [w]x[h]-inch rectangular pan (with a [z]-inch diagonal) is fine.
Or any pan as long as its area is [A] square inches. Heat at 350 degrees.

This recipe is scaled by a factor of [x = 1].

Constraints, constants, and sanity checks:
* The true circle constant is {tau = 6.28}
* The original pan diameter at 1x scale is [[d1 = 9]] (radius [r1 = d1 / 2])
* Scaled radius is [r = d/2] and scaled diameter is [d = 2r]
* The squared diagonal of the rectangular pan is {w^2 + h^2 = z^2}
* The area again is {A = x*1/2*tau*r1^2 = 1/2*tau*r^2 = w*h}
```

TODO: Talk about pegged and static cells.

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
cell is pegged in the UI. That's indicated above with double brackets and just
means that the solver will hold that value fixed and try to find values for the
other cells that satisfy the constraints. The user can always toggle the
peggedness of a cell any time.

(Do we need that convention? Simpler would be if any cell that includes a
constant at all is initially pegged. But we want to say {x=1} to mean x defaults
to 1 without pegging x at 1.)

The next thing to notice is that the variables in this recipe template are
actually under-constrained. In particular, pegging one of w or h to any number
implies the other. Reciplier will pick arbitrary values satisfying the
constraints. If those choices are silly (as in the 0.01x6361.7-inch pan above)
the user can just change them and optionally peg them. Maybe you have only
9x9-inch square pans so you peg w at 9 and then if Reciplier says that that
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
* `cpeg` is a boolean saying whether the cell is pegged
* `urtext` is the exact string between the curly braces in the recipe template
that defines the cell

Recall that the user can edit the template and thus change the urtext any time.
Everything is reparsed from scratch when that happens.

Each cell in the recipe template is parsed like so:

1. Split the urtext on "=" to get a list of expressions. 
2. If the first expression in the list is a constant, set `cpeg` to true.
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

2. Set the initial pegged status of each cell according to whether the first 
expression in the urtext is a constant.

3. Use the satisfying assignment from solvem to compute the cval for each cell.

4. Set the ceqn of each cell to be the non-constant expressions in the urtext.

That's it. Now when the user edits a cell, all other nonpegged cells are free to
change.

Key invariant: When the user is editing a cell, they are directly editing the
cval. See "Always Be Solving" below.


### Pegging and unpegging cells

Any cell at any time may be marked as pegged (`cpeg` marked true). Conceptually
that means that it's treated as one of the constraints that the cell have a
value of cval. So when `cpeg` is true or when a cell is being edited, we 
non-destructively append cval to ceqn when calling solvem.

Again, if the first expression in a cell's urtext is a constant, that cell
starts pegged. This is what causes {6.28 = tau} to yield a field in the UI
that's initially pegged while {tau = 6.28} doesn't. [TODO: this will be 
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
found" and don't update any cvals. If any cells besides c are pegged (c's pegged
status doesn't matter since we're editing it) then the banner says "No solution
found (try unpegging cells)". The banner is shown live, while the user is
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

## New way to specify initially pegged cells and initial/default cvals

TODO: Editing pass for spec above to drop the stuff about starting with a
constant and to say that any cell with an equals-a-constant constraint starts
pegged at that constant.

(Historical note: In a previous version of Reciplier we used colons to label
cells by associating each cell with a specific variable. That turned out to be a
bad idea and is now ancient history. Later we tried the convention that if a
cell's urtext started with a constant, the corresponding field would start
pegged, so you could do {6.28 = tau} instead of {tau = 6.28} if you didn't want
tau inferred based on other cells. That was also a bad idea. It was too easy to
forget that having a cell like {x+y=0} was not actually a constraint unless you
pegged the cell, either in the UI or by writing it as {0=x+y} in the reciplate.
Especially if you put a cell like that in an html comment, since then you'd
naturally think of it as purely a constraint because it didn't show up in the UI
at all. Claude misguidedly tried fixing this by having a special case for cells
in html comments, which was an egregious anti-magic violation.)

We use colon syntax for specifying an expression to use as the initial/default
cval for a cell.

For example, {x: 1} means x is initially unpegged and not unconstrained, whereas
{x = 1} means the cell _is_ initially pegged, just by virtue of having a
constant expression in the list of expressions that are set equal to each other.
The user can still edit it and, orthogonally, still unpeg it. Cells like 
{a+b = 0} are no different. The constant 0 means the cell is initially pegged.
You can instead specify it as {a+b : 0} and it will start unpegged. Either way
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
* Any cell whose urtext sets it equal to a constant is initially pegged.
* So all equations are explicit constraints, at least initially.
* The user can remove an "equals a constant" constraint by unpegging the cell.
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

We have a slick UI to mark fields as pegged. Maybe you want to hold side b fixed
and see how changing side a affects side c. Without that ability it would be
arbitrary which of the other fields would change when you edited one.

If the user ever causes the constraints to be violated, like by marking a=3 and
b=4 as pegged and then setting field c to something other than 5, or the squared
hypotenuse field to something other than 25, then the UI always lets you but any
non-pegged field whose equation is false is shown in red.

For example, if you had a=3 (pegged), b=4 (pegged), and changed the 5 in the c
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

* [DCF] Double-clicking to peg/unpeg is terrible. For one thing, I
double-click cells by muscle memory to highlight the current contents of a field
in order to overwrite it. Worse, if you don't happen to ever double-click a cell
then pegging/unpegging is totally undiscoverable.

* [LNK] Direct links to recipes. When you select a recipe template from the
dropdown, update the query string like "reciplier.dreev.es/?recipe=crepes" using
the keys in `recipeDropdown`. If the user edits the template, encode the whole
thing with lz-string in real time like 
"reciplier.dreev.es/?rawcipe=GARBLEDYGOOK".
Also, as the user edits fields, append the cvals to the URL as well, like
"reciplier.dreev.es/?recipe=pyzza&x=3&a=9&b=12&c=15".

* [ARI] Support arithmetic in the fields, not just the template.

* [GAU] It shouldn't be hard to add a Gaussian elimination solver to the kitchen
sink in csolver.js, why not.

* [ISL] Render sliders iff the urtext of the cell has inequality bounds. And
render those sliders not at the top but just inline, the same way we currently
render a text field, we render sliders right in place. This means throwing away
the slider excerpts and the close buttons. Remember to think in terms of
death-to-if-statements. We want to elegantly generalize what's currently done
with text fields to include other UI elements, in this case sliders.

* [NOQ] If we have a reciplate with two cells, {2x} and {3x}, and no constraints
or initial values, currently both fields are shown in red with a question mark
in them. I think instead they should just be blank.


## Future Work

* [CRT] Crowdsource templates. If the template text area doesn't match one of
the existing reciplates (the dropdown shows "Custom Template" in this case) then
a buttom becomes clickable that opens a popup that prompts the user to submit
their template to be considered for inclusion in the dropdown. Prompt the user
for a name for their recipe too. This involves adding a back end maybe.

* [SEE] Thinking out loud about going more anti-magic: Currently when you edit a
field the system just tries changing other variables until something works.
That's pretty magical. What if instead you could see other fields kind of cross
themselves out and show the new values implied by your edit? Or, like, if more
than one cell can change to accommodate your edit you're forced to explicitly
peg cells until that's no longer the case?

* [VAR] Relatedly, should we make it easy to see the current assignment of
values to variables? Or should you just include something like 
`Variables: a={a}, b={b}, ...` in the reciplate if you want to see that? (We
could even have a macro that expands to the above string using the profile of
variables defined in the reciplate.) PS: These are now visible in the debug
panel.

* [MTH] Make it easy to add any new math functions or other utilities that we
want available for defining cells. Like how we currently have `unixtime()`.
I.e., functions or constants that can be referred to in the vareval environment.
Maybe even have that code available in the UI, unobtrusively so as not to
clutter the UI for the simple recipe use case. Just an idea for now.

* [CON] Syntax like {tau := 6.28} could define a constant and it's just
uneditable, rendering as normal text, no field. Aka static. Another option is
[MTH] above about defining new functions and constants. Just an idea for now.

* [ERB] Then could we support something like {goal_units := "kg"} and then ... I
guess that's turning this thing into a whole templating engine like ERB.
Probably the wrong direction for this tool.

* [SPN] Show a spinner or something while searching for a solution. (Not
currently necessary; could be in the future with fancier solvers.)

* [SRR] Add more recipes from http://doc.dreev.es/recipes or even make Reciplier
the master copy for those recipes.

* [LNW] See if this can subsume https://dreeves.github.io/loanwolf/

* [DER] Make error messages dismissable. That way if you, say, intentionally
make an unreferenced variable, maybe in order to have a slider for it, then you
get the warning but don't have to employ the workaround of adding a dummy cell
in an html comment in order to suppress the "unreferenced variable" banner.
(I don't think "in order to make a slider for it" makes sense currently. Ignore
this one for now.)

* [IMM] The preval function handles things like `2(a+b)`. What about `x(a+b)`?
That's ambiguous between multiplication and a function named `x`. Which is why
Mathematica uses square brackets for function, which, maybe we want to just
embrace that? In the meantime, numbers followed by parentheses should be treated
as multiplication, I think. Add lots of quals before fussing with this.

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
PS: This is probably fixed now.

* [BTB] Bike Tour Burritos doesn't properly infer an earlier or later start time
when the user bumps the average speed down or up.

* [OPA] If you try to enter a 5-12-13 triangle in the pyzza recipe, it doesn't
work because it's constrained to be similar to a 3-4-5 triangle. Which is fine
but we should find a way to make the problem more transparent to the user. See
also [SEE]. PS: This might be fine now.

* [TVR] Sometimes, as in the Beeminder commitment dial with goal date, goal
value, and goal rate, we want to say that exactly 1 out of 3 cells needs to be
unpegged. The status quo in Beeminderland is that clicking to edit a pegged cell
makes it automatically unpeg itself and one of the other two cells (with no way
to choose which) becomes pegged instead. I don't love that. It feels
insufficiently anti-magical. But having the UI complain at you for entering
values incompatible with the constraints might be annoying. I suspect there's a
best-of-all-worlds solution but I haven't found it yet.

* [SER] Bug: If you make a cell like `{12(}` the field is shown in red with a
question mark but no error is displayed. PS: Now it's just shown blank and we
get a "no solution found" if we enter a number in the field for it, which is
pretty dumb.

* [SAP] List of apps that this can or does subsume:
  - https://bid.yootl.es/
  - https://dreeves.github.io/loanwolf/
  - https://sheeq.replit.app (eg, the [sugar calculator](https://sheeq.replit.app/?eq=%28Calories_per_gram_of_sugar%2520*%2520%250AGrams_of_sugar_per_serving_in_healthy_stuff%2520*%2520%250AGrams_of_healthy_stuff%2520%252F%2520%250AGrams_per_serving_in_healthy_stuff%2520%252B%2520%250ACalories_per_gram_of_brown_sugar%2520*%2520%250AGrams_of_brown_sugar_to_add%2520%29%2520%252F%2520%28%250ACalories_per_serving_in_healthy_stuff%2520*%2520%250AGrams_of_healthy_stuff%2520%252F%2520%250AGrams_per_serving_in_healthy_stuff%2520%252B%2520%250ACalories_per_gram_of_brown_sugar%2520*%2520%250AGrams_of_brown_sugar_to_add%2520%29%2520%250A%253D%253D%2520%250ACalories_per_gram_of_sugar%2520*%2520%250AGrams_of_sugar_per_serving_in_junk_food%2520%252F%2520%250ACalories_per_serving_in_junk_food&vars=%257B%2522Calories_per_gram_of_sugar%2522%253A3.87%252C%2522Grams_of_sugar_per_serving_in_healthy_stuff%2522%253A5%252C%2522Grams_of_healthy_stuff%2522%253A233.5%252C%2522Grams_per_serving_in_healthy_stuff%2522%253A170%252C%2522Calories_per_gram_of_brown_sugar%2522%253A3.8%252C%2522Grams_of_brown_sugar_to_add%2522%253A46.10019431698941%252C%2522Calories_per_serving_in_healthy_stuff%2522%253A120%252C%2522Grams_of_sugar_per_serving_in_junk_food%2522%253A23%252C%2522Calories_per_serving_in_junk_food%2522%253A150%257D&infer=Grams_of_brown_sugar_to_add) or [pounds vs kilograms](https://sheeq.replit.app/?eq=pounds%2520%253D%2520kilograms%2520%252F%25200.45359237&vars=%257B%2522p%2522%253A0%252C%2522po%2522%253A0%252C%2522pou%2522%253A0%252C%2522poun%2522%253A0%252C%2522pound%2522%253A0%252C%2522pounds%2522%253A154.3235835294143%252C%2522k%2522%253A0%252C%2522ki%2522%253A0%252C%2522kil%2522%253A0%252C%2522kilo%2522%253A0%252C%2522kilob%2522%253A0%252C%2522kilog%2522%253A0%252C%2522kilogr%2522%253A0%252C%2522kilogra%2522%253A0%252C%2522kilogram%2522%253A0%252C%2522kilograms%2522%253A70%257D&infer=pounds))
  - [Ride Speed Calculator](https://docs.google.com/spreadsheets/d/1LQUDFSLpxtOojcSSLMFWPyRS70eCP59TQHppnu14Px0/edit?gid=0#gid=0)

* [COL] For sharing recipes, we might want to present a clean interface. I'm
thinking that the template textarea should be collapsible and the collapsed/
expanded state should be encoded in the URL. So if you share, for example, 
reciplier.dreev.es/recipe=crepes&template=collapsed then the template textarea
loads in the collapsed state. I'm not sure what the default should be. Or maybe
the template should just always be collapsed on page load? Related idea: just
have the template textarea below the rendered recipe.

* [BFL] I changed my mind: I think the syntax for inequalities should require 
that the bounds occur first and last in the cell:
  {0 < x : 5 < 10}
  {0 < x = 5 < 10}
Anything else should be a syntax error.

* [AUC] In the decision auction reciplate, how do we have both a field and a
slider for the shares that are both treated as pegged? Like you want to change
either the number in the field or slide the slider and have the two stay in sync
which implies they're not pegged. But then when you change the other fields, the
shares shouldn't change, because they *are* pegged. We could do something like
peg propagation. For example, {x} and {2x} are both expressions of the same
variable so they're... linked? We can't say that pegging one pegs the other
because then if you tried to change one of them, it would fail, since the other
is pegged at its current value. Tricky! Need to think this through better.

* [SPG] Probably sliders should have the UI for pegging/unpegging, same as
fields. For consistency at least?

* [ESC] Support syntax like "Footnote: \[1\]" if you want literal brackets in
the recipe. Similar for curly braces of course.

* [REF] (a) Move propagation logic from initSeeds into solvem. (b) Consolidate
repetitive search loops in csolver.js findTarget

* [SYH] Syntax highlighting in the template textarea will be super nice, so you
can see that you've formatted cells correctly, etc.

* [ADV] Idea for advanced syntax: a way to specify that a field starts in focus
when the reciplate is rendered.

* [PYZ] Play with the pyzza reciplate in the UI and watch the browser console to
see if we can still make it generate spurious solver failures.


## Half-baked ideas for cell syntax: JSON objects with syntactic sugar

What if every cell were a JSON object:
  {eq: "x = 2y", min: 0, max: 99, ini: 50, qua: 'field', peg: false, ...}
As syntactic sugar you could omit "eq" by just leading with it:
  {x = 2y, min: 0, max: 99, ini: 50, qua: 'slider', peg: false, ...}
You could omit "ini" by having one of the "eq" expressions be a constant:
  {x = 2y = 50, min: 0, max: 99, qua: 'field', peg: false, ...}
You could specify the min/max like so:
  {0 < x = 2y = 50 < 99, qua: 'slider', peg: false, ...}
Double braces could be syntactic sugar for setting "peg" to true:
  {{x = 1, qua: 'slider'}}
And specifying the bounds via inequalities could make "qua" default to "slider":
  {{0 <= x = 1 <= 10}}


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
slider and, orthogonally, the ability to specify bounds, or perhaps arbitrary
inequalities. But, pragmatically...

* Eggs: {12x} large
* Milk: {5.333x} cups = {1.262x} liters = {1302x} grams
* Flour: {3x} cups = {410x} grams
* Butter: {8x} tbsp melted = {115x} grams
* Salt: {2x} tsp = {14x} grams

Yield: roughly {29x} crepes

Scaled by a factor of {x : 1} {.1 <= x <= 10}


SCRATCH AREA: ------------------------------------------------------------------

can you find the 10 symbol names you're most sure I came up with and the 10 you're most sure an ai agent came up with?

* [DEQ] A reciplate consisting of just `{A = B} {B = A}` yields initial values,
as shown in the fields of the rendered reciplate, of 1.015. That is weird and
surprising. If they were both initialized to zero, that would probably be least
surprising. Of course we don't adhere to POLA here, we adhere to anti-magic. So
let's just think what's the simplest thing for this to do:
  solvem([['A', 'B'], ['B', 'A']], {A: null, B: null})
Wait, never mind, that returns {A: 1, B: 1} which is expected. So there's
soemthing else going on. Let's find out what exactly is getting sent to the
solver for an initial reciplate of `{A = B} {B = A}`. Are we sometimes sending
null as one of the expressions in one of the equations sent to solvem()? Let's
add an assert to ensure that never happens and debug it.

---

this is if-statement thinking: "The fix is to have newtRaphson always defer to kludgeOrama for potentially underdetermined systems".

(i seem to be failing miserably at conveying the anti-magic principle. i worry that terms like "if-statement thinking" are not capturing it well. do you have better ideas? please jot them down in the agents section of AGENTS.md.)

back to the object-level, i now see that you're actually removing conditions from an if-statement, not adding them, so that's laudable. thank you. but let's go deeper. i doubt we want any conditionals. just try each subsolver. if it can come up with a satisfying assignment, great. if not, try the next one. if there are detectable conditions that indicate one solver will fare better than another, like a simple check for an underconstrained system that will cause gaussJordan to barf, put that check at the top of gaussJordan itself. let it return early, let solvem see that it failed to return a satisfying assignment, and let it try the next subsolver. see what i mean? if complexity is needed (big if, haha) then at least keep it contained in the appropriate black box, like one of the subsolvers, keeping the higher-level business logic as simple as possible.

but in this case, maybe gaussJordan could work fine? it's returning {A: 1, B: 1} with sat=false, you say? why isn't it returning {A: 1, B: 1} with sat=true? there may be a good reason, i'm just asking. obviously don't just change gaussJordan's behavior by adding an if-statement without discussing why it's currently doing what it's doing.

---

Brainstorming ways to indicate an initially pegged field:
* NIX: number first in urtext: {6.28 = tau} or {0 < 6.18 = tau < 7}
* double curly braces: {{tau = 6.28}}
* double square brackets: [[tau = 6.28]]
* NIX: symbol in all caps: {TAU = 6.28}
* colon-equals: {tau := 6.28}
* cell has a constant as one of the sides of the equation [GOING WITH THIS]


Bug report 1:

Replicata:

1. Load the dial recipe
2. Peg the vini cell at 73
3. Peg the vfin cell at 70
4. Peg the start time (tini) field (the one in unixtime in seconds)
5. Change the rate (r) to -1

Expectata: That the end date changes.

Resultata: "No solution (try unpegging cells)" and the tfin field is red.

Bug report 2:

Replicata:

1. Load the dial recipe
2. Peg the vini cell at 73
3. Peg the vfin cell at 70
4. Peg the start time (tini) field (the one in unixtime in seconds)
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


BUG REPORT: simeq correctly uses gauss-jordan to find a solution when the reciplate loads but if you change one of the cells it says "no solution found (try unpegging cells)". the only way to have it use gauss-jordan again to compute the solution is to make a dummy edit to one of the pegged cells. this kind of makes sense because if you're editing one of the other cells then we treat that cell as temporarily pegged while you're editing it, and indeed there is no solution when you do that, unless you edit one of the cells to be consistent with the solution.

BUG REPORT: 
Load breakaway reciplate and slide the peloton (vpm) slider.
Also possible to mess it up with just changing the fields.

---

can we talk about the subtlety you mentioned? about how we need the full list of variables, including those that occur only in singletons (recall: a singleton is a degenerate equation, namely an equation with only one expression. to count as an equation there should be 2 or more expressions equated).

i believe that's false. if there's a singleton like "3x+4" and x doesn't occur in any non-singleton equation then the solver need not consider x.

perhaps the subtlety is that in reciplogic we may need to pick a value for x and if x is never sent to solvem then where does that happen?

let's think about this carefully from first principles...

maybe this only matters for the initial call to solvem after parsing the reciplate. that's when we have a bunch of equations and singletons:

1. equations are like 2x=3y or 7=4z or w=4 or a=b=5.
2. a colon can be used instead of an equal sign. the only difference is whether cpeg=true or not.
3. if an equation includes a constant, cval is set to that constant.
4. if a cell is unpegged (cpeg=false), send ceqn to solvem; if a cell is pegged (cpeg=true) or its field is in focus, send ceqn+cval to solvem [this is a rare if-statement that, so far, we believe we want to keep, but let's keep questioning that]
5. a pegged cell can't be a singleton: even if the urtext is a single expression, being pegged means the cval is appended to ceqn when sending the constraints to solvem.
6. an unpegged cell where the urtext is a single expression is a singleton.

idea 1: suppose we have cells {3x} and {2x} but in no cell is x ever part of an equation. then x is not sent to solvem and does not end up with a numeric value. can that just be an error when rendering the reciplate? the fields for {3x} and {2x} don't yield numeric values and we see the error banner, "Undefined variable x". 

idea 2: those fields are just blank. if the user types, say, 12, into the cell for {3x} then, while that cell is in focus, "3x=12" will go to solvem, which will yield x=4, which will make the {2x} cell appear as 8.

are there other ideas besides those? which is best?

---

the amount of anti-magic violations and anti-postel violations still in this codebase is depressing. can you take another pass, replacing any fallbacks with asserts, and adding lots of quals?

also, new bug report: if i go to the pyzza reciplate and clear out the a field, i see this in the browser console:

Uncaught Error: solvem: variable "a" required by equations but missing from init
solvem @ csolver.js:1374
solveAndApply @ reciplogic.js:495
handleFieldInput @ reciplui.js:386

is that a regression? what are we doing wrong that quals aren't already catching such things? please go crazy with adding quals.