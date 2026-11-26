# Design: a district data explorer that works on a phone

This is the plan I'm building from. I checked the data sources before writing it, so everything here is something I've confirmed exists, not something I'm hoping exists.

## What I'm building

A public map where anyone can pick a state legislative district and see how it compares on a handful of everyday measures: how many people ride transit, how many households have no car, how many people rent and how many of them are stretched by the rent, what households earn, and how many homes are heated with electricity.

It covers the state House districts of Virginia and Texas, the same two states as my first project. It's meant for people who need a quick, honest picture of their district without a data background: a legislative staffer prepping for a meeting, a reporter checking a claim, a resident curious about their own district.

It's a portfolio project. I'm not working with any organization on it, and it isn't a finished policy product.

## Why these measures

I wanted measures that connect to questions legislators actually argue about, and that the Census publishes for legislative districts. That narrows things down a lot.

- **Public transit commuters.** Share of workers who ride transit to work. Districts with more riders depend more on transit funding decisions.
- **Households without a vehicle.** Share of households with no car. This shows who can't easily get around without transit or a ride.
- **Renters.** Share of households that rent.
- **Rent stretched.** Share of renting households that spend 30% or more of their income on rent, out of those where the Census could work out the share.
- **Median household income.** The middle household income, in 2024 dollars.
- **Homes heated by electricity.** Share of occupied homes heated with electricity. It's the closest thing the Census has to a household power bill context, which connects to my first project's topic of who pays for grid costs.
- **Population,** for context.

One honest limit: the Census doesn't measure clean energy by district. I'm not going to label a measure "clean energy" when it isn't. Electric heating is a household energy context, and the page will say exactly that.

## Where the data comes from

I confirmed each of these by asking the source directly.

- **The numbers.** The Census Bureau's American Community Survey, 5-year estimates for 2020 to 2024 (the 2024 release). I looked up every variable by its code in the Census's own listing and checked its label, because I got one code wrong from memory while planning, so I'm not trusting memory for the rest. The district level data needs a free Census API key. I'll request one myself and keep it in a local file that never goes into the repository.
- **The shapes.** The Census Bureau's cartographic boundary files for state House districts, 2024, at the 1:500,000 scale. The Virginia file is about 0.45 MB zipped and the Texas file about 0.9 MB. They're already simplified for mapping.
- **A caution on dates.** The numbers and shapes are both from the 2024 release, so they match each other. Boundaries can change when states redraw their maps, so the page will say which year it uses.

## What to do about uncertainty

The ACS is a survey, not a full count, and a legislative district is a small area. Every estimate has a margin of error, and for small groups it can be large. Showing a clean number with no warning would be misleading.

So the pipeline will fetch the Census's margin of error for each count, work out a margin for each percentage using the Census's published method, and the page will show it. When a margin is large compared with the number itself, the page will flag it instead of presenting the figure with false confidence. I'll also test the calculation.

## How it will work

**A build step, then a plain page.** A script runs once on my computer. It downloads the shapes and the numbers, joins them, works out the percentages and margins, trims the map shapes down, and writes one small data file per state. The web page just reads those files, so it needs no server, no key, and no live calls to the Census. It's fast, it works if the Census is down, and nobody's visit touches the Census.

**The page itself** is plain HTML, CSS and JavaScript, like my first two projects. For the map I'll use D3's map tools, loaded from a public file host, to draw the districts as an SVG. I picked SVG over a tile map on purpose: there are only 100 or 150 shapes, no background map is needed, it needs no account or key, each district can be a real element a keyboard and a screen reader can reach, and it prints cleanly.

**What you can do:**

- Switch state, and switch measure from a list.
- Tap or click a district, or pick one from a list or by number, to see all its measures, and how it ranks among its state's districts.
- Zoom and move around the map, because some city districts are tiny, especially in Texas.
- Switch to a table of every district that you can sort. It shows the same information as the map, for anyone who can't or would rather not use a map.
- Share a link that opens on the same state, measure and district, like my first project.

**What it won't do on purpose:** no address search. Typing an address would send where someone lives to an outside service, and I'd rather the page keep everything in the visitor's browser. Picking a district by map, list or number does the job.

## Making it work for everyone

- **Phone first.** Designed at phone width first. The map sits on top, the controls and the district details underneath, with tap targets big enough for a finger.
- **Color that doesn't depend on color.** A color scheme that stays readable for people with color blindness, plus the actual value shown as a number whenever a district is selected or focused, plus the table.
- **Keyboard and screen readers.** Every district can be reached and chosen with the keyboard, with a clear focus outline, and each has a text label with its name and value. Controls are real, labeled controls.
- **Not just a picture.** The map always has a text summary beside it, and the table is the full alternative.
- **Fast and small.** Each state's data should be well under a megabyte, and the page should work with no cookies and no tracking.

## How I'll test it

- The calculations (percentages, margins of error, ranks) get automated tests with hand-worked examples.
- The data files get checked: every district is present, no missing or impossible numbers, and the district populations add up to the state total the Census publishes.
- I'll run the page at phone width and on desktop, test it by keyboard alone, and run the same automated page checks I used on my first project.

## What I'm leaving out

- Address lookup, for the privacy reason above.
- State Senate districts and states beyond Virginia and Texas. The pipeline will work state by state, so adding more later should be simple, but I'm not promising it.
- Any claim about why a district looks the way it does. The page shows what the numbers say and how sure they are.

## Done means

- A visitor on a phone can pick a state and a measure, find any district, and read its numbers and how uncertain they are.
- The same thing works by keyboard, and through the table.
- The numbers pass the checks above, and the README says plainly where they come from and what they can't tell you.
- It's on the Managed Analytics site, with the code on GitHub.
