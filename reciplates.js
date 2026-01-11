// Recipe names as they appear in the main dropdown menu. Note that the keys in
// this hash are (will be) used in the URL query string.
const recipeDropdown = {
'crepes':    "Soule-Reeves Crepes",
'pyzza':     "Pythagorean Triple Pizza",
'cookies':   "Camelot Chocolate Chip Cookies",
'shortcake': "Shortcake",
'simeq':     "Simultaneous Equation Cake",
'pancakes':  "Pancakes according to Claude",
'breakaway': "Breakaway Biscuits",
'biketour':  "Bike Tour Burritos",
'dial':      "Beeminder Commitment Dial",
'sugarcalc': "Sugar Calculator aka Junkfoodifier",
'converter': "Unit Converter",
'cheesepan': "Cheese Wheels in a Pan aka Geometry Puzzles",
'test':      "Just Testing",
'blank':     "Blank — go crazy",
'custom':    "Custom Template",
};

// Recipe templates.
const reciplates = {
// -----------------------------------------------------------------------------
'crepes': `\
* Eggs: {12x} large
* Milk: {5.333x} cups = {1.262x} liters = {1302x} grams
* Flour: {3x} cups = {410x} grams
* Butter: {8x} tbsp melted = {115x} grams
* Salt: {2x} tsp = {14x} grams

Yield: roughly {29x} crepes

Scaled by a factor of {x = 1}

(Flour notes: We did ~{440x}g for years via packed cups but {360x}g (up to {365x}g) is most likely what the recipe intended. Most recently we tried {420x}g and it worked well so we're trying lower.)
`,
// -----------------------------------------------------------------------------
'pyzza': `\
Scaled by a factor of x={x = 1}.

Roll out dough into a right triangle with legs of length a={a = 3x} and b={b = 4x} and hypotenuse c={c}.
Then eat it.

Sanity check: {a}^2 + {b}^2 = {a^2} + {b^2} = {a^2 + b^2 = c^2}
`,
// -----------------------------------------------------------------------------
'cookies': `\
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

Scaled by a factor of {x = 1 }
`,
// -----------------------------------------------------------------------------
'simeq': `\
2*{x = 6} + 3*{y} = {33 = 2x + 3y}
5*{x} - 4*{y} = {2 = 5x - 4y}

(Expected solution: x=6, y=7)
`,
// -----------------------------------------------------------------------------
'shortcake': `\
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

Scaled by a factor of {x = 1}
`,
// -----------------------------------------------------------------------------
'pancakes': `\
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

Scaled by a factor of {x} <!-- prius: x:1 -->
`,
// -----------------------------------------------------------------------------
'breakaway': `\
The riders in the break have a {1 = m}:{30 = s}s gap with {20 = d}km ({k*d}mi) to go.
So if the break averages {40 = vb}km/h ({k*vb}mph) then the peloton needs to average {vp = pd/t}km/h ({k*vp}mph) to catch them at the line.

Scratchpad:
* Gap time:     {gt = m/60+s/3600} hours = {m+s/60 = gt*60}m = {60m+s = gt*3600}s
* Gap distance: {gd = vb*gt}km ({k*gd}mi) <!-- I think vb not vp for this?) -->
* Breakaway's time till finish: {t = d/vb} hours
* Peloton's distance to the line: {pd = d+gd}km ({k*pd}mi)
* Miles in a kilometer: {0.621371 = k}mi/km
`,
// -----------------------------------------------------------------------------
'biketour': `\
Distance:        {66 = d} miles
Start time:      {h = 6}:{m = 45}am             <!-- {s = h+m/60} hours  -->
End time:        {13 = H}:{00 = M} (24H format) <!-- {e = H+M/60} hours  -->
Wall clock time: {w = e-s} hours = {floor(w)}h{(w-floor(w))*60} minutes
Rest stop 1:     {b1} hours = {b1*60 = 26} minutes
Rest stop 2:     {b2} hours = {b2*60 = 37} minutes
Rest stop 3:     {0 = b3} hours = {b3*60} minutes
Total breaks:    {b = b1+b2+b3} hours
Riding time:     {t = w-b} hours = {floor(t)}h{(t-floor(t))*60}m
Avg speed:       {v = d/t} mph
Unadjusted spd:  {u = d/w} mph
`,
// -----------------------------------------------------------------------------
dial: `\
* Start: {y0 = 2025}/{m0 = 12}/{d0 = 25} weighing {vini = 73}kg
* End: {y = 2026}/{m = 12}/{d = 25} weighing {vfin = 70} ({(tfin-tini)/SID} days later)
* Rate: {r*SID} per day = {r*SIW} per week = {r*SIM} per month

* Start time (unixtime in seconds): {tini = unixtime(y0, m0, d0)}
* End time (unixtime in seconds): {tfin = unixtime(y, m, d)}
* Goal duration: {tfin - tini}s = {(tfin - tini)/SID}d = {(tfin - tini)/SIW}w = {(tfin - tini)/SIM}mo
* Rate in goal units per second: {r = (vfin-vini)/(tfin-tini)}
* Seconds in a day / week / month: {86400 = SID}, {SIW = SID*7}, {SIM = SID*365.25/12}
`,
// -----------------------------------------------------------------------------
'sugarcalc': `\
Nutrition info for healthy stuff (e.g., Greek yogurt):
* {170 = omega} grams per serving
* {120 = gamma} calories per serving
* {5 = sigma} grams of sugar per serving

Nutrition info for junk food (e.g., Go-gurt):
* w grams per serving (don't actually need to know this) <!-- {w} -->
* {150 = c} calories per serving
* {23 = s} grams of sugar per serving

(Fun facts: There are {3.87 = k} calories per gram of normal sugar and {3.80 = kappa} calories per gram of brown sugar.)

"Healthiness" in this context is the fraction of calories that are from sugar. For the Greek yogurt that's {h = k*omega/gamma} and for the Go-gurt it's {eta = k*s/c}.

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
'converter': `\
# Kilograms vs Pounds
{p = k/LB} pounds = {k = 70} kilograms
<!-- The fully exact definition of a pound is {0.45359237 = LB} kilograms -->

# Grams-per-square-meter vs Ounces-per-square-yard
{m} g/m^2 = {m*YD^2/OZ} oz/yd^2
<!-- The fully exact definition of an ounce is {28.349523125 = OZ} grams -->
<!-- The fully exact definition of a yard is {0.9144 = YD} meters -->
`,
// -----------------------------------------------------------------------------
'cheesepan': `\
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
`,
// -----------------------------------------------------------------------------
'test': `\
Recipe for eggs: eat {1x} egg(s).
Scaled by a factor of x where x/2 is {x/2 = 8} for some reason.
`,
// -----------------------------------------------------------------------------
'blank': ``,
};
