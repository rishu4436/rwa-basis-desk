export const RWA_TYPE_CHIPS = [
  { id: "all", label: "All", api: "" },
  { id: "stock", label: "Stocks", api: "stock" },
  { id: "etf", label: "ETFs", api: "etf" },
  { id: "commodity", label: "Commodities", api: "commodity" },
  { id: "treasury", label: "Treasuries", api: "treasury" },
] as const;

export type RwaTypeId = (typeof RWA_TYPE_CHIPS)[number]["id"];

export const TREASURY_SYMBOLS = [
  "TLT",
  "IEF",
  "AGG",
  "TIP",
  "BND",
  "SGOV",
  "BIL",
  "SHY",
  "GOVT",
];
