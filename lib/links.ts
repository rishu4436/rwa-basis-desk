export function edgarCompanyUrl(cik: string): string {
  const digits = cik.replace(/\D/g, "");
  const padded = digits.padStart(10, "0");
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padded}&owner=exclude&count=40`;
}

export function cmcCurrencyUrl(slug: string): string {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  return `https://coinmarketcap.com/currencies/${encodeURIComponent(clean)}/`;
}
