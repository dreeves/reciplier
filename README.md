# Reciplier

Hosted at [reciplier.dreev.es](https://reciplier.dreev.es).
Background at [AGI Friday](https://agifriday.substack.com/p/reciplier).

See also http://doc.dreev.es/recipes which maybe I want to merge with this.

This is now more general than recipes and is kind of halfway to a spreadsheet.
But also it's better than a spreadsheet in some ways. It also subsume's my old
"calculator calculator" app that I called Sheeq.

# Functional Spec for Generalized Reciplier

Consider a recipe that has you mix 1 egg and 3 wheels of cheese in a 9-inch
diameter pan. 

But of course that 9 doesn't scale linearly with the ingredients. It's the area
that does that, because there's a certain fixed thickness required, let's say.
And the area in this case (since pi are square) comes out to 63.62 inches. If
you doubled the recipe you'd double that area to 127.24 which implies you'd need
a 12.73-inch diameter pan. And say we want to allow for a rectangular pan as
well.

Here's how we do all that by annotating the recipe:

```
Mix {1x} egg and {3x} wheels of cheese in a {d:}-inch diameter pan.
Or a {w:}x{h:}-inch rectangular pan (with a {z:}-inch diagonal) is fine.
Or any pan as long as its area is {A:} square inches.
Heat at 350 degrees.

This recipe is scaled by a factor of {x:}. <!-- defaults to 1 -->

Constraints and sanity checks:
* The original pan diameter at 1x scale is {d1: 9} (radius {r1: d1 / 2})
* Scaled radius = {r: d/2} (half the diameter, {d = 2r})
* The true circle constant is {tau: 6.28}
* The area, again, is {A = 1/2*tau*r^2 = 1/2*tau*r1^2*x = w*h}
* The squared diagonal of the rectangular pan is {w^2 + h^2 = z^2}
```

So we're explicitly marking every number in the recipe that scales linearly. We
do that by literally replacing, for example, a "12" in the recipe with "{12x}"
to show that what was originally a 12 is now a 12 multiplied by the scale 
factor, x.

(Technical note: We support Mathematica-style arithmetic syntax where "2x" means
"2*x".)

Every expression optionally has a variable name (see next section) for
referencing it in other expressions. It's an error if you specify the same name
for two expressions but you can reference a variable as much as you want. Like
how the first line of the above recipe labels the diameter as d and later in the 
bulleted list we define r as d/2 and mention the diameter again. It's actually
unnecessary there to say {d = 2r} rather than just {d} since we've defined r as
d/2, which is equivalent, but it doesn't hurt to add a redundant constraint.

(Note on prior art: Embedded Ruby (ERB) syntax has `<% code to just evaluate %>`
and `<%= code to print the output of %>` and `<%# comments %>`.)

Regardless, each expression in curly braces is shown as a numeric field in the 
Reciplier UI and the system searches for values for all the variables that make
all the equations true. In this case we see something like this initially:

```
Mix [1] egg(s) and [3] wheels of cheese in a [9]-inch pan.
Or a [0.01]x[6361.7]-inch rectangular pan ([6361.7]-inch diagonal) is fine.
Or any pan with area [63.62] square inches.
Heat at 350 degrees.

This recipe is scaled by a factor of [1].

Constraints and sanity checks:
* Radius = [4.5] (half the diameter, [9])
* The true circle constant is [6.28]
* The area of the pan before scaling is [63.62]
* The squared diagonal of the rectangular pan is [40471547]
```

The computed width and height of the rectangular pan are silly but the system
doesn't know that. It's just the first solution to the equations it found,
favoring positive, finite numbers. You could change the bare {w:} in the
template to {w:8} or {w:8x} and it would calculate h as the non-silly 7.95. Of
course both w=8 and w=8x yield more silliness if you scale way up. By setting
w=8 and x=100, you'd get an 8x795 pan. By setting w=8x and x=100, you'd get an 
800x7.95 pan. Of course what you actually want to do is replace the bare {z:}
with something like {z:11x} so the pan's diagonal scales with the recipe and the
pan doesn't become stupidly skinny as the recipe scales.

As always with Reciplier, changing any of those fields causes the rest to
insta-update.

## Data Structures and Business Logic

A cell is a data structure that includes the following three fields:

* `cvar` [previously `vname`] is the name of the variable corresponding to this cell
* `cval` [previously `value`] is the current value assigned to this cell's variable
* `ceqn` [previously `elist`] (pronounced "sequin") is a list of one or more expressions that are constrained to be equal to each other and to cval

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

4. Currently you can freeze a field by double-clicking it and it turns blue.
That's not discoverable or obvious. Especially if you make edits such that the
constraints can't be satisfied by editing the nonfrozen fields, it needs to be
obvious you should unfreeze some fields. Possibly we want an affordance for
unfreezing everything. It's even possible that that should happen automatically
if there's no other way to satisfy the constraints.

(I spoke too soon: double-clicking to freeze is terrible because I do that by
muscle memory to highlight the current contents of a field in order to overwrite
it.)

5. Related to the previous idea, I'm thinking we need to go more anti-magic.
Currently when you edit a field the system just tries changing other variables
until something works. That's pretty magical. What if instead you could see
other fields kind of cross themselves out and show the new values implied by
your edit? Or, like, if more than one cell can change to accommodate your edit
you're forced to explicitly freeze cells until that's no longer the case.

6. Wait, do we need a special case for a cell like {x: 0} which is just saying
that x is initialized to 0, not that it's a constraint that x=0? How do we 
distinguish that from something like {climbed + descended = 0} for a biking
round trip where the net elevation is always definitionally zero? I think the
answer is never use a special case (anti-magic!) and we just need to figure out
the preceding future work item here, where the user just has to be explicit that
the net-elevation cell is frozen.

SCRATCH AREA:

Bug reports (also add quals for these, TDD-style)...

---

Bug: Using the slider for pyzza, makes the c^2 cell turn red.

---

Replicata: 

1. Load the Pythagorean Triple Pizza recipe.
2. Change the "x" cell from 1 to 10. 

Expectata: 

Cell "a" changes to 30 since it's 3x, cell "b" changes to 40 since it's "4x", and cell "c" has TODO

---

Replicata:

1. Load the crepes recipe
2. Change the egg field from 12 to 24

Expectata:

That all the fields double. In particular, x=2.

Resultata:

The egg field just becomes red and nothing else changes.

---

Qual:

solvem([['x', 1], ['eggs', '12x', 24]], {x:1, eggs:12})

Expected result: No Solution.