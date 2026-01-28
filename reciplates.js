/* This file is strictly human-written and human-edited */

// Recipe names as they appear in the main dropdown menu. Note that the keys in
// this hash are (will be) used in the URL query string.
const recipeDropdown = {
crepes:    "Soule-Reeves Crepes",
pyzza:     "Pythagorean Triple Pizza",
cookies:   "Camelot Chocolate Chip Cookies",
shortcake: "Shut-the-fork-up Shortcake",
simeq:     "Simultaneous Equation Soufflé",
pancakes:  "Pancakes according to Claude",
breakaway: "Breakaway Biscuits",
biketour:  "Bike Tour Burritos",
cheesepan: "Cheese Wheels in a Pan aka Geometry Puzzles",
quadratic: "Quadratic Quesadillas",
gratio:    "Golden Ratio Granola",
dial:      "Beeminder Commitment Dial Crumb Cake",
dumbdial:  "Dumb-as-Donuts Dial",
sugarcalc: "Sugar Calculator aka Junkfoodifier Jambalaya",
converter: "Unit Converter Cobbler",
auction:   "Decision Auction Au Gratin",
test:      "Just Testing Do Not Eat",
ineqtest:  "Claude's Inequality Test Kitchen",
custom:    "Custom Template",
};

// Recipe templates aka reciplates (the keys here match those in recipeDropdown)
const reciplates = {
// -----------------------------------------------------------------------------
crepes: `\
* Eggs: {12x} large
* Milk: {5.333x} cups = {1.262x} liters = {1302x} grams
* Flour: {3x} cups = {410x} grams
* Butter: {8x} tbsp melted = {115x} grams
* Salt: {2x} tsp = {14x} grams

Yield: roughly {29x} crepes

Scaled by a factor of {x : 1} 
{.1 <= x <= 10}

(Flour notes: We did ~{440x}g for years via packed cups but {360x}g (up to {365x}g) is most likely what the recipe intended. Most recently we tried {420x}g and it worked well so we're trying lower.)
`,
// -----------------------------------------------------------------------------
pyzza: `\
Scaled by a factor of x={x : 1}.

Roll out dough into a right triangle with legs of length a={a = 3x} and b={b = 4x} and hypotenuse c={c}.
Then eat it.

Sanity check: {a}^2 + {b}^2 = {a^2} + {b^2} = {a^2 + b^2 = c^2}

### Above enforces a 3-4-5 ratio; here's one that doesn't:

{A}^2 + {B}^2 = {C}^2
<!-- {A^2 + B^2 = C^2} -->
`,
// -----------------------------------------------------------------------------
cookies: `\
* {1x} cup ({200x}g) granulated sugar
* {1x} cup ({206x}g) brown sugar (up to {220x}g)
* {1x} cup ({227x}g) butter, softened
* {2x} eggs ({109x}g)
* {1.5x} teaspoons vanilla or {10x}g vanilla paste
* {1x} teaspoon ({6x}g) baking soda
* {1x} teaspoon ({5x}g) salt
* {3x} cups ({376x}g) all purpose flour (as low as {360x}g; we've done much higher via packed cups, most recently tried {376x}g)
* {12x} ounces ({338x}g) semi-sweet chocolate chips (danthany version: half semi-sweet and half milk chocolate)

Place sugar, butter, eggs, and vanilla in mixer bowl. Attach bowl and flat beater to mixer. Turn to speed 2 and mix about 30 seconds. Stop and scrape bowl.

Turn to Stir Speed. Gradually add baking soda, salt, and flour to sugar mixture and mix about 2 minutes. Turn to speed 2 and mix about 30 seconds. Stop and scrape bowl. Add chocolate chips. Turn to Stir Speed and mix about 15 seconds. 

Drop rounded teaspoonfuls onto greased baking sheets, about 2 inches apart. Bake at 375 F for 10 to 12 minutes. Remove from backing sheets *immediately* and cool on wire racks. 

Yield: {54x} cookies, 117 cal (17g carb) per cookie.

Scaled by a factor of {x : 1 }
{.1 <= x <= 10}
`,
// -----------------------------------------------------------------------------
simeq: `\
2*{x : 6} + 3*{y} = {2x + 3y = 33}
5*{x} - 4*{y} = {5x - 4y = 2}

(Expected solution: x=6, y=7)
`,
// -----------------------------------------------------------------------------
shortcake: `\
Preheat oven to 325°F. Line bottom of 9x{9x}-inch pan with parchment paper.

* {2x}    C   flour (can do half/half cake flour)
* {1x}    C   sugar
* {1/2*x} C   butter ({1x} stick)
* {2x}    tsp baking powder
* {1/2*x} tsp salt
* {3/4*x} C   milk
* {1x}    tsp vanilla

Mix together dry ingredients. Add cold butter cut up into pieces and then cut into the flour as for making pastry, until it resembles coarse crumbs.

Add milk and vanilla and mix well.

Pour into the prepared cake pan, spread evenly. 

Bake 30 to 40 minutes @ 325°F

Scaled by a factor of {x : 1}
{.1 <= x <= 10}
`,
// -----------------------------------------------------------------------------
pancakes: `\
{1x} cup all-purpose flour
{2x} tablespoons sugar
{2x} teaspoons baking powder
{0.5x} teaspoon salt
{1x} cup milk
{1x} large egg
{2x} tablespoons vegetable oil

Mix dry ingredients. Combine wet ingredients separately, then add to dry. 
Cook on a greased griddle at 350°F for about 2 minutes per side until golden.

Makes {8x} pancakes, 120 calories each.

Scaled by a factor of {x} <!-- testing: no default/initial value given -->
{.1 <= x <= 10}
`,
// -----------------------------------------------------------------------------
breakaway: `\
The riders in the break have a {m=1}:{s=30}s gap with {d=20}km ({d/M}mi) to go.
So if the break averages {vb : 40}km/h ({vbm = vb/M}mph) then the peloton needs to average {vp = pd/t}km/h ({vpm = vp/M}mph) to catch them at the line.

Break mph:   {15 < vbm < 35}
Peloton mph: {15 < vpm < 35}

Scratchpad:
* Gap time:     {gt = m/60+s/3600} hours = {m+s/60 = gt*60}m = {60m+s = gt*3600}s
* Gap distance: {gd = vb*gt}km ({gd/M}mi) <!-- note: vb not vp for this -->
* Breakaway's time till finish: {t = d/vb} hours
* Peloton's distance to the line: {pd = d+gd}km ({pd/M}mi)
* (Fully exact definition of a mile: {M = 1.609344}km)
`,
// -----------------------------------------------------------------------------
biketour: `\
Distance:        {d = 66} miles
Start time:      {h : 6}:{m : 45}am             <!-- {s = h+m/60} hours  -->
End time:        {H = 13}:{M = 00} (24H format) <!-- {e = H+M/60} hours  -->
Wall clock time: {w = e-s} hours = {floor(w)}h{(w-floor(w))*60} minutes
Rest stop 1:     {b1} hours = {b1*60 : 26} minutes
Rest stop 2:     {b2} hours = {b2*60 : 37} minutes
Rest stop 3:     {b3} hours = {b3*60 :  0} minutes
Total breaks:    {b = b1+b2+b3} hours
Riding time:     {t = w-b} hours = {floor(t)}h{(t-floor(t))*60}m
Avg speed:       {d/t} mph [8 <= v <= 34] [TODO: sliders]
Unadjusted spd:  {d/w} mph [8 <= u <= 34] (includes stops)
`,
// -----------------------------------------------------------------------------
cheesepan: `\
Mix {2x} eggs and {3x} wheels of cheese in a {d}-inch diameter pan.
Or a {w}x{h}-inch rectangular pan (with a {z}-inch diagonal) is fine.
Or any pan as long as its area is {A} square inches. Heat at 350 degrees.

This recipe is scaled by a factor of {x : 1} {.1 <= x <= 10}

Constraints, constants, and sanity checks:
* The true circle constant is {tau = 6.28}
* The original pan diameter at 1x scale is {d1 = 9} (radius {r1 = d1 / 2})
* Scaled radius is {r = d/2} and scaled diameter is {d = 2r}
* The squared diagonal of the rectangular pan is {w^2 + h^2 = z^2}
* The area again is {A = x*1/2*tau*r1^2 = 1/2*tau*r^2 = w*h}
`,
// -----------------------------------------------------------------------------
dial: `\
* Start: {y0 = 2025}/{m0 = 12}/{d0 = 25} weighing {vini = 73}kg
* End: {y : 2026}/{m : 12}/{d : 25} weighing {vfin : 70} ({(tfin-tini)/SID} days later)
* Rate: {r*SID} per day = {r*SIW} per week = {r*SIM} per month

* Start time (unixtime in seconds): {tini = unixtime(y0, m0, d0)}
* End time (unixtime in seconds): {tfin = unixtime(y, m, d)}
* Goal duration: {tfin - tini}s = {(tfin - tini)/SID}d = {(tfin - tini)/SIW}w = {(tfin - tini)/SIM}mo
* Rate in goal units per second: {r = (vfin-vini)/(tfin-tini)}
* Seconds in a day / week / month: {SID = 86400}, {SIW = SID*7}, {SIM = SID*365.25/12}
`,
// -----------------------------------------------------------------------------
dumbdial: `\
* Start: Day {tini = 0} at {vini = 0} units
* End: Day {tfin : 30}  at {vfin : 300} units
* Rate: {r = (vfin-vini)/(tfin-tini)} per day

{0 < r < 100}
`,
// -----------------------------------------------------------------------------
sugarcalc: `\
Nutrition info for healthy stuff (e.g., Greek yogurt):
* {omega = 170} grams per serving
* {gamma = 120} calories per serving
* {sigma = 5} grams of sugar per serving

Nutrition info for junk food (e.g., Go-gurt):
* w grams per serving (don't actually need to know this)
* {c = 150} calories per serving
* {s = 23} grams of sugar per serving

(Fun facts: There are {k = 3.87} calories per gram of normal sugar and {kappa = 3.80} calories per gram of brown sugar.)

"Healthiness" in this context is the fraction of calories that are from sugar. For the Greek yogurt that's {k*omega/gamma} and for the Go-gurt it's {eta = k*s/c}.

If you weigh out {y} grams of Greek yogurt and add {x} grams of brown sugar to it, the healthiness of the mixture is...

{(k*sigma*y/omega + kappa*x)/(gamma*y/omega + kappa*x) = eta}
`,
/* In the Sheeq version we had to do this:
(Calories_per_gram_of_sugar * 
Grams_of_sugar_per_serving_in_healthy_stuff * 
Grams_of_healthy_stuff / 
Grams_per_serving_in_healthy_stuff + 
Calories_per_gram_of_brown_sugar * 
Grams_of_brown_sugar_to_add ) / (
Calories_per_serving_in_healthy_stuff * 
Grams_of_healthy_stuff / 
Grams_per_serving_in_healthy_stuff + 
Calories_per_gram_of_brown_sugar * 
Grams_of_brown_sugar_to_add ) 
== 
Calories_per_gram_of_sugar * 
Grams_of_sugar_per_serving_in_junk_food / 
Calories_per_serving_in_junk_food
*/
// -----------------------------------------------------------------------------
converter: `\
### Kilograms vs Pounds
{p = k/LB} pounds = {k = p*LB : 70} kilograms
<!-- The fully exact definition of a pound is {LB = 0.45359237} kilograms -->

### Grams-per-square-meter vs Ounces-per-square-yard
{m} g/m^2 = {m*YD^2/OZ} oz/yd^2
<!-- The fully exact definition of an ounce is {OZ = 28.349523125} grams -->
<!-- The fully exact definition of a yard is {YD = 0.9144} meters -->
`,
// -----------------------------------------------------------------------------
auction: `\
Fraction of the thing/decision that's yours: 
{r = .5} ({100*(1-r)}/{100r} them/you) [TODO: slider 0 <= r <= 1]

Your Bid: (any of these imply the other two)
* Fair Market Value (FMV): {fmv}
* Most you pay if you win: {pay = (1-r)*fmv}
* What you get paid if you lose: {get = r*fmv}


If your FMV of \${fmv} is higher:
You'll pay up to \${pay} (for the {100*(1-r)}% that's not yours).


If their FMV is higher:
You'll get paid \${get} (for the {100r}% that's yours).

iou[2026.01.14, {get}, them, you, "decision auction"]
`,
// -----------------------------------------------------------------------------
quadratic: `\
{a=3}x^2+{b=4}x+{c=-20}={a*x^2+b*x+c = 0} implies x={x}
`,
// -----------------------------------------------------------------------------
gratio: `\
The reciprocal of {phi} is {1/phi = phi - 1}, same as subtracting 1.
[-2 < phi < 2] [TODO: slider]
`,
// -----------------------------------------------------------------------------
test: `\
Recipe for eggs: eat {1x} egg(s).
Scaled by a factor of x where x/2 is {x/2 = 8} for some reason.

---

Pegged: {a = 5}
Computed: {b+0} <!-- Nothing should change if this is {b} vs {b+0} -->
Constraint: {a + b = 10}
`,
// -----------------------------------------------------------------------------
ineqtest: `\
Scale factor with bounds: {0.5 <= x <= 10}
Percentage slider: {0 < p <= 100}
Temperature in Fahrenheit: {32 <= temp <= 212}

From x: {y = 2x}
From p: {z = 2p}
From temp: {c = temp - 32}

Total: {total = y + z + c}
Doubled total: {2*total}
Sanity check: {x} + {p} + {temp} = {x + p + temp}
`,
// -----------------------------------------------------------------------------
custom: `\
Replace me with {x:1} or {x+1} of your own recipes.
`,
// -----------------------------------------------------------------------------
};
