# District data explorer: Virginia and Texas House districts

This is a map where you can pick a state legislative district and see how it compares with the rest of its state on a few everyday measures: how many people ride transit, how many homes have no car, how many people rent and how many of them are stretched by the rent, what households earn, and how many homes are heated with electricity.

It covers the state House districts of Virginia (100) and Texas (150). It works on a phone, it has a table version for anyone who'd rather not use a map, and every number comes with its margin of error.

It's a portfolio project. I'm not working with any organization on it, and it isn't a finished policy product.

## Why I built it

People who work with legislators, like staff, reporters and advocates, often need a quick, honest picture of a district. The data exists, but it's spread across Census tables that are hard to read by district, and most maps hide how uncertain the numbers are. I wanted to see if I could make something that's quick to use on a phone and doesn't oversell the data.

## Try it yourself

You'll need Node 22 or newer (I built it on Node 24), and Python 3 for the little server. In the project folder:

```bash
npm install
```

To open the page:

```bash
npm run serve
```

Then go to `http://localhost:8767`. Pick a state, pick a measure, and tap a district. You can also open a link that already points somewhere, like this one for rent burden in Texas District 32: `http://localhost:8767/#s=tx&m=rentstress&d=032`.

To run the tests:

```bash
npm test
```

You don't need a Census key to run the page or the tests. The finished data files are already in the project. You only need a key if you want to download the numbers again (see "Rebuilding the data" below).

## What's in this folder

- `docs/01-design.md` is the plan I wrote before building: what the page is for, where the data comes from, and what I decided to leave out.
- `site/` is the page itself. It's plain HTML, CSS and JavaScript with no build step. The map is drawn with D3, loaded from a public file host. `site/data/` holds the finished data files.
- `scripts/` downloads the Census numbers and district shapes, works out each measure, and writes the data files.
- `tests/` has the tests.

## What it shows, and how the numbers are worked out

The numbers come from the Census Bureau's American Community Survey, 5-year estimates for 2020 to 2024. There are seven measures:

- **Transit commuters:** the share of workers who go to work by public transportation.
- **Homes without a vehicle:** the share of occupied homes with no car, truck or van.
- **Renters:** the share of occupied homes that are rented.
- **Rent takes 30% or more of income:** the share of renting homes in that group, out of the ones where the Census could work the share out.
- **Median household income:** the middle income, in 2024 dollars.
- **Homes heated by electricity:** the share of occupied homes whose main heating fuel is electricity.
- **Population.**

Shares are worked out from counts (parts divided by the whole). Because a survey only samples some households, every Census count comes with a margin of error. For each share, I work out its margin using the Census's own published method. I also give each estimate a plain label, based on how big the margin is compared with the estimate: solid, use with care, or shaky. Those cutoffs (15% and 30%) are a common rule of thumb, not a Census rule, and the page says so.

Districts are shaded in five groups of equal size, so each shade holds a fifth of the state's districts. Districts with a shaky estimate get light diagonal stripes, and a switch turns that off. For transit commuters that's a lot of districts (41 of 100 in Virginia and 67 of 150 in Texas), because a small share in a small area is noisy. I decided to show that instead of hiding it.

Two special cases the Census flags, which I handle on purpose:

- **Top income group.** One Virginia district sits in the Census's top income bracket, so its median income is shown as "$250,000 or more" and no margin is made up.
- **Controlled population.** For 17 Texas districts, the Census pins the population to an official count, so there's no sampling error, and I show the margin as zero.

## Rebuilding the data

The district numbers need a free Census API key. You get one at `https://api.census.gov/data/key_signup.html`, and it's emailed to you. Put it in a file called `.env` in the project folder:

```
CENSUS_API_KEY=your-key-goes-here
```

That file is ignored by Git and is never printed or committed. Then:

```bash
npm run build
```

That downloads the boundary files (about 1.3 MB) and the numbers, checks them, and rewrites `site/data/`. A new key can take a few minutes to start working after you click the activation link in the email.

## How I tested it

There are 33 tests:

- **12 on the arithmetic,** checked against examples I worked out by hand, including the margin of error for a share, the special Census codes, ranks and ties.
- **21 on the finished data files.** Every district has numbers and a shape and nothing extra. Every value is sensible, with shares between 0 and 100. Ranks agree with the values. District populations add up exactly to each state's own total. Shapes are real, closed polygons inside the state. And the files are small enough to load fast on a phone.
- **One of those checks recalculates every measure for all 250 districts** from the raw Census download, using separate, plainly written formulas, and compares them with what the build produced.

The build also refuses to write anything if its own checks fail. That caught two real things while I was building it: a median income with no margin (the top income group), and a Texas population margin the Census marks as "controlled". It was my code that was too strict, and I fixed it. A third check caught a tiny Texas island that collapsed to nothing when I simplified the shapes.

I also corrupted the data on purpose in four ways (changing a number, deleting a district, breaking a rank, and pushing a shape outside Texas) and confirmed the tests caught each one. For the page, I ran an automated accessibility scan (axe) on the map and table views, and it found no violations.

## What I haven't done, and what you shouldn't take from this

I'd rather say this up front.

- **It hasn't been tested with real people,** and I haven't tried it with a screen reader or with a keyboard alone. All 150 Texas districts are separate tab stops, which is a lot. There's a "skip the map" link and the table as the alternative, but I can't say how well that works for someone who relies on them.
- **I haven't put a district side by side with the Census website's own table.** I checked the numbers against the raw download, and the populations against each state's total, but I haven't compared individual districts against the Census's own site.
- **"Electric heating" is not clean energy.** The Census doesn't count clean energy by district. Electric heating is a rough sign of how many households depend on the power bill for warmth, and the page says exactly that.
- **The 5-year numbers are averages, not a snapshot of today,** and small groups in small districts can have wide margins.
- **The map shapes are simplified** so the page stays fast. They're good for looking at, not for anything legal, and they come from the 2024 Census boundary files, so they won't match a district map that was redrawn since.
- **On a phone, one finger scrolls the page.** To move the map, use two fingers or the zoom buttons.
- **It only covers Virginia and Texas,** the state House only. The pipeline works state by state, so adding more should be simple, but I haven't tried.
- **The page shows what the numbers say, not why.** It makes no claims about causes.
- **It needs an internet connection** for the map's drawing tools, which load from a public file host.
- **It records nothing about your visit.** No cookies, no tracking, and it never asks for an address.

## Data and credits

- **Numbers:** American Community Survey 5-year estimates, 2020 to 2024 (the 2024 release), US Census Bureau.
- **Shapes:** Census Bureau cartographic boundary files for state legislative districts (lower chamber), 2024, at 1:500,000.
- **Drawing:** D3, loaded from cdnjs.

I used standard open source libraries for drawing the map and reading the shape files (D3, topojson and shapefile) and wrote everything else myself.

## What I practiced

- finding the data that actually exists for a question, and checking each variable against the source before trusting it,
- being honest about uncertainty on a map, where a clean color usually hides it,
- designing for a phone first, with a table as a full alternative to the map,
- writing tests that check the data and the arithmetic, and testing the tests,
- documentation someone else could pick up.

Powered by [Managed Analytics](https://managedanalytics.co).
