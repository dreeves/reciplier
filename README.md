Hosted at [reciplier.dreev.es](https://reciplier.dreev.es).
Background at [AGI Friday](https://agifriday.substack.com/p/reciplier).

See also http://doc.dreev.es/recipes which maybe I want to merge with this.

And here's a spec for having this subsume my "calculator calculator":

## Wild Generalization to Arbitrary Constraints

Consider a recipe that has you mix 1 egg and 3 wheels of cheese in a 
9-inch diameter pan. 

But of course that 9 doesn't scale linearly with the ingredients. It's the area
that does that. And the area in this case (since pi are square) comes out to 
63.62 inches. If you doubled the recipe you'd double that area to 127.24 which
implies you'd need a 12.73-inch diameter pan. And say we want to allow for a 
rectangular pan as well.

Here's how we could do all that by annotating the recipe:

```
Mix {1x} egg and {3x} wheels of cheese in a {d:9}-inch diameter pan.
Or a {w:}x{h:}-inch rectangular pan (with a {z:}-inch diagonal) is fine.
Or any pan as long as its area is {A*x} square inches.
Heat at 350 degrees.

This recipe is scaled by a factor of {x:1}.

Constraints and sanity checks:
* Radius = {r: d/2} (half the diameter, {d = 2r})
* The true circle constant is {tau: 6.28}
* The area of the pan before scaling is {A: 1/2*tau*r^2 = w*h}
* The squared diagonal of the rectangular pan is {w^2 + h^2 = z^2}
```

So we're explicitly marking every number in the recipe that scales linearly. We
do that by literally replacing, for example, a "12" in the recipe with "{12x}"
to show that what was originally a 12 is now a 12 multiplied by the scale 
factor, x.

(Technical note: We support Mathematica-style arithmetic syntax where "2x" means
"2*x".)

Every expression optionally has a variable name aka label for referencing it in
other expressions. It's an error if you specify the same label for two
expressions but you can reference a variable as much as you want. Like how the 
first line of the above recipe labels the diameter as d and later in the 
bulleted list we define r as d/2 and mention the diameter again. It's actually
unnecessary there to say {d = 2r} rather than just {d} since we've defined r as
d/2, which is equivalent, but it doesn't hurt to add a redundant constraint.

(Implementation note: As a preprocessing pass, add nonce labels to every 
expression that doesn't have one. E.g., {1x} and {3x} become {var01: 1x} and
{var02: 3x}. That way the rest of the code can count on a consistent format of a
label, a colon, and then one or more expressions separated by equal-signs.)

[Alternate syntax idea for later: Emulate ERB (Embedded Ruby) syntax which has 
`<% code to just evaluate %>` and `<%= code to print the output of %>` and 
`<%# comments %>`.]

Regardless, each expression in curly braces is shown as a numeric field in the 
Reciplier UI and the system searches for values for all the variables that make
all the equations true. In this case we'd see something like this initially:

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

The width and height of the rectangular pan are silly but the system doesn't
know that. It's just the first solution to the equations it found, favoring 
positive, finite numbers. You could change the bare {w:} in the template to 
{w:8} or {w:8x} and it would calculate h as the non-silly 7.95. Of course both 
w=8 and w=8x yield more silliness if you scale way up. By setting w=8 and x=100,
you'd get an 8x795 pan. By setting w=8x and x=100, you'd get an 800x7.95 pan. Of
course what you actually want to do is replace the bare {z:} with something like
{z:11x} so the pan's diagonal scales with the recipe and the pan doesn't become
stupidly skinny as the recipe scales.

As always with Reciplier, changing any of those fields causes the rest to
insta-update.

### Use Cases Beyond Recipes

Consider this, which does exactly what you'd expect:

```
{a: 3}, {b: 4}, {c: sqrt(a^2 + b^2)} is a Pythagorean triple.
```

Or without solving for the hypotenuse:

```
{a: 3}, {b: 4}, {c: 5} is a Pythogorean triple.

Sanity check: {a^2 + b^2 = c^2} is the squared hypotenuse.
```

We also want some slick UI to mark fields as fixed. Maybe you want to fix side b
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

We want to fail loudly in that case and make it impossible to miss where the
problem is. Anti-magic FTW.

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

It's like making a spreadsheet and doing what-if analysis. We can put that in 
the dropdown of recipes and call it "Breakaway Biscuits".

Here's a related one for making sure we finish a family bike tour on time:

```
Distance:        {d:66} miles               <!-- {d = v*t}                 -->
Start time:      {h:6}:{m:45}am             <!-- {s: h+m/60} & {s = e-d/u} -->
End time:        {H:12}:{M:52} (24H format) <!-- {e: H+M/60} & {e = s+d/u} -->
Break 1:         {b1h:0}h{b1m:26}m          <!-- {b1: b1h+b1m/60 }         -->
Break 2:         {b2h:0}h{b2m:37}m          <!-- {b2: b2h+b2m/60 }         -->
Break 3:         {b3h:0}h{b3m:00}m          <!-- {b3: b3h+b3m/60 }         -->
Total breaks:    {b: b1+b2+b3}              <!-- {b = e-s-d/v}             -->
Avg speed:       {v: d/t}                   <!-- {v = d/(e-s-b)}           -->
Unadjusted spd:  {u: d/w}                   <!-- {u = d/(e-s)}             -->
Wall clock time: {wh:}h{wm:}m               <!-- {w: wh+wm/60 = e-s}       -->
Riding time:     {th:}h{tm:}m               <!-- {t: th+tm/60 = e-s-b}     -->
```

(This was originally
[a spreadsheet](https://docs.google.com/spreadsheets/d/1LQUDFSLpxtOojcSSLMFWPyRS70eCP59TQHppnu14Px0/edit?gid=0#gid=0)
but it was surprisingly cumbersome that way. For starters I think many of the 
constraints above aren't actually necessary to specify in the above version 
since they're implied by others. I plan to remove them one at a time when this
is implemented, which should serve as a nice sanity check.)


### Math Notes

Searching for variable assignments that satisfy the equations is easy for things
like scaled recipes but it would be cool for this to be super general. 
Mathematica's NMinimize could be a place to start.

I think currently we just pick a variable and do a binary search to find a valid
assignment for it. But if we try that for every variable and nothing works it's 
possible there's a solution that can only be found by changing more than one 
variable at once.

We'll worry about that when we find use cases where it matters.

### Errors and Corner Cases

Fail loudly in the following cases:

1. Any variable is referenced in any expression that's never defined via a label
on some other expression.

2. The template itself contains contradictions. As discussed in the example with
Pythagorean triples.

3. Any syntax error.

4. Other errors we haven't thought of yet or ways the template file violates any
expectations. Anti-Postel FTW.

5. If any expression is a bare number without a human-assigned label. Reasons to
treat it as an error: (1) It doesn't make sense to have a field that when you
change it it has zero effect on anything else. (2) If you really want that for
some reason, give the field a label. Even if you never use that label, it
demonstrates that you're creating that disconnected field intentionally.

6. Although, come to think of it, maybe we want to treat it as an error when any
field is disconnected from all others? Like if you define {tau: 6.28} and then
never use it. That would be nice to at least be warned about. The workaround if
you intentionally want to define something you're not currently using would be
something like `{tau: 6.28} <!-- {tau} not currently used -->`. So let's start 
with treating this as an error and reconsider if it's too annoying in practice.

## Future Work

1. Markdown rendering
2. Instead of making a slider for whatever variable is called "x", make a slider
for all labeled variables, and make it easy to dismiss ones you don't need.
3. Direct links to recipes. Option 1: encode the entire template verbatim in the
query string.
Option 2: encode which template file and encode every variable explicitly in the
query string.
4. Add redirects from old Sheeq URLs:
[Sugar Calculator](https://sheeq.replit.app/?eq=%28Calories_per_gram_of_sugar%2520*%2520%250AGrams_of_sugar_per_serving_in_healthy_stuff%2520*%2520%250AGrams_of_healthy_stuff%2520%252F%2520%250AGrams_per_serving_in_healthy_stuff%2520%252B%2520%250ACalories_per_gram_of_brown_sugar%2520*%2520%250AGrams_of_brown_sugar_to_add%2520%29%2520%252F%2520%28%250ACalories_per_serving_in_healthy_stuff%2520*%2520%250AGrams_of_healthy_stuff%2520%252F%2520%250AGrams_per_serving_in_healthy_stuff%2520%252B%2520%250ACalories_per_gram_of_brown_sugar%2520*%2520%250AGrams_of_brown_sugar_to_add%2520%29%2520%250A%253D%253D%2520%250ACalories_per_gram_of_sugar%2520*%2520%250AGrams_of_sugar_per_serving_in_junk_food%2520%252F%2520%250ACalories_per_serving_in_junk_food&vars=%257B%2522Calories_per_gram_of_sugar%2522%253A3.87%252C%2522Grams_of_sugar_per_serving_in_healthy_stuff%2522%253A5%252C%2522Grams_of_healthy_stuff%2522%253A233.5%252C%2522Grams_per_serving_in_healthy_stuff%2522%253A170%252C%2522Calories_per_gram_of_brown_sugar%2522%253A3.8%252C%2522Grams_of_brown_sugar_to_add%2522%253A46.10019431698941%252C%2522Calories_per_serving_in_healthy_stuff%2522%253A120%252C%2522Grams_of_sugar_per_serving_in_junk_food%2522%253A23%252C%2522Calories_per_serving_in_junk_food%2522%253A150%257D&infer=Grams_of_brown_sugar_to_add),
[Pounds<->Kilograms Calculator](https://sheeq.replit.app/?eq=pounds%2520%253D%2520kilograms%2520%252F%25200.45359237&vars=%257B%2522p%2522%253A0%252C%2522po%2522%253A0%252C%2522pou%2522%253A0%252C%2522poun%2522%253A0%252C%2522pound%2522%253A0%252C%2522pounds%2522%253A154.3235835294143%252C%2522k%2522%253A0%252C%2522ki%2522%253A0%252C%2522kil%2522%253A0%252C%2522kilo%2522%253A0%252C%2522kilob%2522%253A0%252C%2522kilog%2522%253A0%252C%2522kilogr%2522%253A0%252C%2522kilogra%2522%253A0%252C%2522kilogram%2522%253A0%252C%2522kilograms%2522%253A70%257D&infer=pounds),
and David Yang's monitor resolution calculator if I can find that.
5. Help text. 
(Include a link to Calca.io as an example of prior art.)
6. Don't show the nonce variables in the hovertext. Show the urtext.
7. Bug: when a value changes, the slider should change in real time.
8. Currently you can freeze a field by double-clicking it and it turns blue.
That's not bad but it's not discoverable or obvious. Especially if you make
edits such that the constraints can't be satisfied by editing the nonfrozen
fields, it needs to be obvious you should unfreeze some fields. Possibly we want
an affordance for unfreezing everything. It's even possible that that should 
happen automatically if there's no other way to satisfy the constraints.