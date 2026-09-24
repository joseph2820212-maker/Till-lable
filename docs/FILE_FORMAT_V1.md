# `tillfamily.price-change` — version 1

The file a Till family app (TillCalc) sends to TillLabel with **approved selling prices**. Implemented in
`src/modules/import/priceChangeFile.ts`; imported through Products → Import (the same preview and all-or-nothing
commit as CSV / XLSX).

## Rules

- Content is UTF-8 JSON with a format marker. The extension (`.tillprice`) is only a hint; the importer reads the
  content, never trusts the file name (validation V7).
- Prices only. **No costs, margins, mark-ups or supplier prices** — a file containing any such key is refused
  (`containsCosts`).
- Money is exact: `priceMinor` is an integer in the minor units of `currency` (ISO 4217).
- A SHA-256 checksum covers the currency, the batch identity and the canonical items; an edited or damaged file is
  refused (`checksumMismatch`).
- The file's currency must equal the shop currency in TillLabel; otherwise nothing is imported.
- Matching: barcode, then SKU, then exact name (only when the row has neither); a row matching two products, or a
  barcode repeated in the file, is a conflict and is skipped.

## Shape

```json
{
  "format": "tillfamily.price-change",
  "version": 1,
  "source": { "app": "TillCalc", "appVersion": "1.4.0", "batchId": "b_2026_09_24_01", "batchRevision": 3 },
  "createdAt": "2026-09-24T10:00:00Z",
  "currency": "GBP",
  "items": [
    { "sourceId": "itm_1", "name": "Heinz Cream of Tomato Soup", "priceMinor": 159, "barcode": "5000157024671", "sku": "HNZ-1", "size": "400 g" }
  ],
  "checksum": "<hex sha256>"
}
```

`checksum = sha256("<currency>|<batchId>|<batchRevision>|" + JSON.stringify(items.map(i => [sourceId, name, priceMinor, barcode ?? "", sku ?? "", size ?? ""])))`

Limits: 20,000 items; files over 10 MB are refused before parsing.

## Exporter (TillCalc)

One commit on TillCalc `main`, made only with owner approval (plan G6): "Send price changes to TillLabel" writes this
file from an accepted repricing batch and shares it. **Not yet made** — awaiting owner approval.
