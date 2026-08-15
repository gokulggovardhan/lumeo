// bench/ocr-gate2/documents.ts
//
// The corpus content, defined once. Every class renders these SAME
// documents -- clean, skewed, photographed -- so a difference in error rate
// between classes is attributable to the degradation and nothing else. If
// each class had its own text, a class could score badly simply for
// containing harder words.

export type CorpusDocument = {
  id: string;
  title: string;
  /** Drawn in order, top to bottom. Empty strings are vertical gaps. */
  lines: string[];
};

// Deliberately ordinary business text: currency, dates, reference numbers,
// mixed case and punctuation. These are what the Recognize tool would
// actually meet, and they are also where OCR most often fails in ways that
// matter -- a misread digit in an amount is worse than a misread word in a
// sentence.
export const CORPUS_DOCUMENTS: CorpusDocument[] = [
  {
    id: "invoice",
    title: "Invoice",
    lines: [
      "INVOICE 2026-0147",
      "",
      "Northwind Design Studio",
      "14 Harbour Road, Bristol BS1 4RN",
      "VAT 412 7788 21",
      "",
      "Billed to: Acme Corporation Ltd",
      "Issued: 14 August 2026",
      "Due: 13 September 2026",
      "",
      "Description Qty Unit Amount",
      "Brand identity retainer 1 900.00 900.00",
      "Additional revision rounds 3 150.00 450.00",
      "Print-ready artwork export 2 135.00 270.00",
      "",
      "Subtotal 1620.00",
      "VAT at 20% 324.00",
      "Total Amount Due 1944.00",
      "",
      "Payment due within 30 days of the invoice date.",
      "Bank transfer to sort code 20-00-00, account 55345010.",
      "Late payment interest accrues at 8% above base rate.",
    ],
  },
  {
    id: "receipt",
    title: "Receipt",
    lines: [
      "GROVE STREET GROCERS",
      "88 Grove Street, Manchester M4 1PW",
      "Tel 0161 496 0180",
      "",
      "Receipt 4471  Till 3  15/08/2026 09:42",
      "",
      "Wholemeal loaf 800g 1.85",
      "Free range eggs x6 2.40",
      "Semi-skimmed milk 2L 1.65",
      "Cheddar mature 400g 4.20",
      "Tomatoes on the vine 1.99",
      "Coffee beans 227g 6.75",
      "",
      "Items 6",
      "Subtotal 18.84",
      "Discount applied -1.50",
      "Total 17.34",
      "",
      "Paid by card ending 4419",
      "Authorisation 004718",
      "Thank you for shopping with us.",
    ],
  },
  {
    id: "letter",
    title: "Letter",
    lines: [
      "Bramley & Fitch Solicitors",
      "27 Chancery Walk, London WC2A 1JL",
      "",
      "12 August 2026",
      "",
      "Dear Ms Okafor,",
      "",
      "Re: Property at 41 Elmfield Avenue, reference BF/2026/0912",
      "",
      "Thank you for your letter of 4 August. We have now received the",
      "completed title documents from the vendor's solicitors and have",
      "raised three additional enquiries, which are set out in the",
      "schedule enclosed with this letter.",
      "",
      "We expect a response within fourteen days. Should the replies",
      "prove satisfactory, we anticipate being in a position to exchange",
      "contracts by 5 September 2026.",
      "",
      "Please confirm that the deposit of 24,500.00 will be available",
      "on that date.",
      "",
      "Yours sincerely,",
      "",
      "H. Bramley",
      "Partner",
    ],
  },
];

/** The exact string a perfect OCR pass should return for a document. */
export function groundTruthTextFor(document: CorpusDocument): string {
  return document.lines.filter((line) => line !== "").join("\n");
}
