// What we ask the Census for, and how each measure on the page is worked out.
// Every variable code below was looked up in the Census's own listing for the
// 2024 American Community Survey 5-year release, and its label was checked.

export const ACS_YEAR = 2024; // the 2020 to 2024 estimates
export const BOUNDARY_YEAR = 2024;

export const STATES = [
  { slug: "va", name: "Virginia", fips: "51", expectedDistricts: 100 },
  { slug: "tx", name: "Texas", fips: "48", expectedDistricts: 150 },
];

// Estimate codes. The Census publishes the margin of error for each one under the same
// code with the final E changed to M.
export const VARIABLES = [
  "B01003_001E", // total population
  "B08301_001E", // workers 16 and over (means of transportation to work), total
  "B08301_010E", // ... who go by public transportation
  "B25044_001E", // occupied homes (tenure by vehicles available), total
  "B25044_003E", // ... owner occupied, no vehicle
  "B25044_010E", // ... renter occupied, no vehicle
  "B25003_001E", // occupied homes (tenure), total
  "B25003_003E", // ... renter occupied
  "B25070_001E", // renter homes (rent as a share of income), total
  "B25070_007E", // ... 30.0 to 34.9 percent
  "B25070_008E", // ... 35.0 to 39.9 percent
  "B25070_009E", // ... 40.0 to 49.9 percent
  "B25070_010E", // ... 50.0 percent or more
  "B25070_011E", // ... not computed
  "B19013_001E", // median household income, in 2024 dollars
  "B25040_001E", // occupied homes (heating fuel), total
  "B25040_004E", // ... heated with electricity
];

// The measures shown on the page.
//   kind "share": a percentage worked out as parts / whole, with a margin of error
//   kind "value": a number the Census gives directly, with its own margin of error
export const INDICATORS = {
  transit: {
    kind: "share",
    label: "Transit commuters",
    unit: "% of workers",
    parts: ["B08301_010"],
    whole: ["B08301_001"],
    what: "Share of workers aged 16 and over who get to work by public transportation.",
  },
  novehicle: {
    kind: "share",
    label: "Homes without a vehicle",
    unit: "% of homes",
    parts: ["B25044_003", "B25044_010"],
    whole: ["B25044_001"],
    what: "Share of occupied homes with no car, truck or van available.",
  },
  renters: {
    kind: "share",
    label: "Renters",
    unit: "% of homes",
    parts: ["B25003_003"],
    whole: ["B25003_001"],
    what: "Share of occupied homes that are rented.",
  },
  rentstress: {
    kind: "share",
    label: "Rent takes 30% or more of income",
    unit: "% of renter homes",
    parts: ["B25070_007", "B25070_008", "B25070_009", "B25070_010"],
    whole: ["B25070_001"],
    wholeMinus: ["B25070_011"], // leave out homes where the Census couldn't work the share out
    what: "Share of renting homes spending 30% or more of their income on rent, out of those where the share could be worked out.",
  },
  income: {
    kind: "value",
    label: "Median household income",
    unit: "dollars a year",
    variable: "B19013_001",
    what: "The middle household income, in 2024 dollars. Half of households earn more, half earn less.",
  },
  electric: {
    kind: "share",
    label: "Homes heated by electricity",
    unit: "% of homes",
    parts: ["B25040_004"],
    whole: ["B25040_001"],
    what: "Share of occupied homes that use electricity as their main heating fuel. A rough sign of how many households depend on the power bill for heat.",
  },
  population: {
    kind: "value",
    label: "Population",
    unit: "people",
    variable: "B01003_001",
    what: "Total people living in the district.",
  },
};
