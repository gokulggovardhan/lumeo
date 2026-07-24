// Vercel's edge geolocation gives country as an ISO 3166-1 alpha-2 code
// ("IN") and region as the bare ISO 3166-2 subdivision code ("MH") -- see
// lib/supabase/proxy.ts. Analytics storage keeps those codes as-is (compact,
// stable, safe to index/group by). This module is the single place codes get
// expanded to full names for display, e.g. "IN"+"MH" -> "India"/"Maharashtra",
// so every admin surface reads "Pune, Maharashtra, India" instead of
// "Pune, MH, IN".

let countryDisplayNames: Intl.DisplayNames | null = null;

function getCountryDisplayNames(): Intl.DisplayNames | null {
  if (countryDisplayNames) return countryDisplayNames;
  try {
    countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return countryDisplayNames;
  } catch {
    return null;
  }
}

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(trimmed)) return code;

  const display = getCountryDisplayNames();
  if (!display) return code;

  try {
    const name = display.of(trimmed);
    return name && name !== trimmed ? name : code;
  } catch {
    return code;
  }
}

// ISO 3166-2 subdivision code -> full name, keyed "<country>|<region>".
// Full coverage for India (Lumeo's primary market); broad coverage for a
// handful of other large English-speaking markets. Anything not listed
// falls back to the raw region code rather than guessing.
const REGION_NAMES: Record<string, string> = {
  // India -- all states and union territories.
  "IN|AN": "Andaman and Nicobar Islands",
  "IN|AP": "Andhra Pradesh",
  "IN|AR": "Arunachal Pradesh",
  "IN|AS": "Assam",
  "IN|BR": "Bihar",
  "IN|CH": "Chandigarh",
  "IN|CT": "Chhattisgarh",
  "IN|DN": "Dadra and Nagar Haveli and Daman and Diu",
  "IN|DD": "Dadra and Nagar Haveli and Daman and Diu",
  "IN|DL": "Delhi",
  "IN|GA": "Goa",
  "IN|GJ": "Gujarat",
  "IN|HR": "Haryana",
  "IN|HP": "Himachal Pradesh",
  "IN|JK": "Jammu and Kashmir",
  "IN|JH": "Jharkhand",
  "IN|KA": "Karnataka",
  "IN|KL": "Kerala",
  "IN|LA": "Ladakh",
  "IN|LD": "Lakshadweep",
  "IN|MP": "Madhya Pradesh",
  "IN|MH": "Maharashtra",
  "IN|MN": "Manipur",
  "IN|ML": "Meghalaya",
  "IN|MZ": "Mizoram",
  "IN|NL": "Nagaland",
  "IN|OR": "Odisha",
  "IN|OD": "Odisha",
  "IN|PY": "Puducherry",
  "IN|PB": "Punjab",
  "IN|RJ": "Rajasthan",
  "IN|SK": "Sikkim",
  "IN|TN": "Tamil Nadu",
  "IN|TG": "Telangana",
  "IN|TS": "Telangana",
  "IN|TR": "Tripura",
  "IN|UP": "Uttar Pradesh",
  "IN|UT": "Uttarakhand",
  "IN|UK": "Uttarakhand",
  "IN|WB": "West Bengal",

  // United States -- all states, DC, and major territories.
  "US|AL": "Alabama", "US|AK": "Alaska", "US|AZ": "Arizona", "US|AR": "Arkansas",
  "US|CA": "California", "US|CO": "Colorado", "US|CT": "Connecticut", "US|DE": "Delaware",
  "US|DC": "District of Columbia", "US|FL": "Florida", "US|GA": "Georgia", "US|HI": "Hawaii",
  "US|ID": "Idaho", "US|IL": "Illinois", "US|IN": "Indiana", "US|IA": "Iowa",
  "US|KS": "Kansas", "US|KY": "Kentucky", "US|LA": "Louisiana", "US|ME": "Maine",
  "US|MD": "Maryland", "US|MA": "Massachusetts", "US|MI": "Michigan", "US|MN": "Minnesota",
  "US|MS": "Mississippi", "US|MO": "Missouri", "US|MT": "Montana", "US|NE": "Nebraska",
  "US|NV": "Nevada", "US|NH": "New Hampshire", "US|NJ": "New Jersey", "US|NM": "New Mexico",
  "US|NY": "New York", "US|NC": "North Carolina", "US|ND": "North Dakota", "US|OH": "Ohio",
  "US|OK": "Oklahoma", "US|OR": "Oregon", "US|PA": "Pennsylvania", "US|RI": "Rhode Island",
  "US|SC": "South Carolina", "US|SD": "South Dakota", "US|TN": "Tennessee", "US|TX": "Texas",
  "US|UT": "Utah", "US|VT": "Vermont", "US|VA": "Virginia", "US|WA": "Washington",
  "US|WV": "West Virginia", "US|WI": "Wisconsin", "US|WY": "Wyoming", "US|PR": "Puerto Rico",

  // Canada -- provinces and territories.
  "CA|AB": "Alberta", "CA|BC": "British Columbia", "CA|MB": "Manitoba", "CA|NB": "New Brunswick",
  "CA|NL": "Newfoundland and Labrador", "CA|NS": "Nova Scotia", "CA|NT": "Northwest Territories",
  "CA|NU": "Nunavut", "CA|ON": "Ontario", "CA|PE": "Prince Edward Island", "CA|QC": "Quebec",
  "CA|SK": "Saskatchewan", "CA|YT": "Yukon",

  // United Kingdom -- broad country/region groupings.
  "GB|ENG": "England", "GB|SCT": "Scotland", "GB|WLS": "Wales", "GB|NIR": "Northern Ireland",

  // Australia -- states and territories.
  "AU|NSW": "New South Wales", "AU|QLD": "Queensland", "AU|SA": "South Australia",
  "AU|TAS": "Tasmania", "AU|VIC": "Victoria", "AU|WA": "Western Australia",
  "AU|ACT": "Australian Capital Territory", "AU|NT": "Northern Territory",

  // United Arab Emirates -- common Lumeo traffic source alongside India.
  "AE|AZ": "Abu Dhabi", "AE|DU": "Dubai", "AE|SH": "Sharjah", "AE|AJ": "Ajman",
  "AE|UQ": "Umm Al Quwain", "AE|RK": "Ras Al Khaimah", "AE|FU": "Fujairah",
};

export function regionName(
  countryCode: string | null | undefined,
  regionCode: string | null | undefined,
): string | null {
  if (!regionCode) return null;
  const region = regionCode.trim().toUpperCase();
  const country = countryCode?.trim().toUpperCase();
  if (!country) return regionCode;

  return REGION_NAMES[`${country}|${region}`] ?? regionCode;
}

export function formatLocationLabel(
  city: string | null | undefined,
  region: string | null | undefined,
  country: string | null | undefined,
): string {
  const parts = [
    city?.trim() || null,
    regionName(country, region),
    countryName(country),
  ].filter((part): part is string => Boolean(part && part.length > 0));

  return parts.length > 0 ? parts.join(", ") : "Unknown location";
}
