// // export interface ParsedBody {
// //   description: string | null;
// //   dimensions: string | null;
// //   caseQty: number | null;
// //   uom: string | null;
// //   uses: string | null;
// //   manufacturerUrl: string | null;
// //   submittalUrl: string | null;
// // }

// // function decodeEntities(s: string): string {
// //   if (!s) return s;
// //   return s
// //     // Common UTF-8-read-as-CP1252 mojibake (smart quotes / dashes) first.
// //     .replace(/\u00e2\u20ac\u009d/g, '\u201d') // ”
// //     .replace(/\u00e2\u20ac\u009c/g, '\u201c') // “
// //     .replace(/\u00e2\u20ac\u2122/g, '\u2019') // ’
// //     .replace(/\u00e2\u20ac"/g, '\u2013')      // –
// //     .replace(/\u00e2\u20ac/g, '"')            // catch-all remnant
// //     // Named/numeric entities. Decode &amp; LAST so we don't double-decode
// //     // sequences like "&amp;lt;" into "<".
// //     .replace(/&nbsp;/gi, ' ')
// //     .replace(/&quot;/gi, '"')
// //     .replace(/&#39;|&apos;/gi, "'")
// //     .replace(/&lt;/gi, '<')
// //     .replace(/&gt;/gi, '>')
// //     .replace(/&amp;/gi, '&');
// // }

// // export function stripTags(html: string): string {
// //   if (!html) return '';
// //   return decodeEntities(
// //     html
// //       .replace(/<\s*br\s*\/?\s*>/gi, ' ')
// //       .replace(/<\/(p|li|ul|ol|h\d|div|tr|td|th)\s*>/gi, ' ')
// //       .replace(/<[^>]+>/g, '')
// //   )
// //     .replace(/\s+/g, ' ')
// //     .trim();
// // }

// // function splitSections(html: string): Record<string, string> {
// //   const sections: Record<string, string> = {};
// //   // [\s\S] inside the heading capture so headings spanning newlines still match.
// //   const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|$)/gi;
// //   let m: RegExpExecArray | null;
// //   while ((m = re.exec(html)) !== null) {
// //     const key = stripTags(m[1]).toLowerCase().trim();
// //     if (key) sections[key] = m[2] || '';
// //   }
// //   return sections;
// // }

// // function getAnchors(html: string): { href: string; text: string }[] {
// //   const anchors: { href: string; text: string }[] = [];
// //   const re = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
// //   let m: RegExpExecArray | null;
// //   while ((m = re.exec(html)) !== null) {
// //     anchors.push({ href: m[1].trim(), text: stripTags(m[2]) });
// //   }
// //   return anchors;
// // }

// // function getListItems(html: string): string[] {
// //   const items: string[] = [];
// //   const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
// //   let m: RegExpExecArray | null;
// //   while ((m = re.exec(html)) !== null) items.push(m[1]);
// //   return items;
// // }

// // const UOM_NORMALIZE: Record<string, string> = {
// //   box: 'Box', boxes: 'Box', bx: 'Box',
// //   piece: 'Each', pieces: 'Each', pc: 'Each', pcs: 'Each', ea: 'Each', each: 'Each',
// //   pack: 'Pack', packs: 'Pack', pk: 'Pack',
// //   case: 'Case', cases: 'Case', cs: 'Case',
// //   roll: 'Roll', rolls: 'Roll',
// //   bag: 'Bag', bags: 'Bag',
// //   carton: 'Carton', bundle: 'Bundle', pair: 'Pair', set: 'Set', kit: 'Kit',
// // };
// // const normalizeUom = (noun: string): string =>
// //   UOM_NORMALIZE[noun.toLowerCase()] ?? (noun.charAt(0).toUpperCase() + noun.slice(1).toLowerCase());

// // export function parseBodyHtml(rawHtml: string | null | undefined): ParsedBody {
// //   const result: ParsedBody = {
// //     description: null, dimensions: null, caseQty: null,
// //     uom: null, uses: null, manufacturerUrl: null, submittalUrl: null,
// //   };
// //   if (!rawHtml || typeof rawHtml !== 'string') return result;

// //   const html = rawHtml;
// //   const sections = splitSections(html);

// //   // Match a section heading by keyword, but prefer the MOST specific heading
// //   // so "description" does not accidentally grab "category description".
// //   const findSection = (...names: string[]): string => {
// //     for (const n of names) {
// //       const exact = sections[n];
// //       if (exact != null) return exact;
// //     }
// //     for (const n of names) {
// //       const key = Object.keys(sections).find(k => k.includes(n));
// //       if (key) return sections[key];
// //     }
// //     return '';
// //   };

// //   const descSection = findSection('product description', 'description');
// //   if (descSection) {
// //     result.description = stripTags(descSection) || null;
// //   } else {
// //     const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
// //     if (p) result.description = stripTags(p[1]) || null;
// //   }

// //   const infoSection = findSection('product information', 'specifications', 'details');
// //   const infoItems = getListItems(infoSection || html).map(stripTags);
// //   for (const item of infoItems) {
// //     if (result.dimensions == null && /dimension|^\s*size\b/i.test(item)) {
// //       result.dimensions = item.replace(/^\s*(dimensions?|size)\s*[:\-]?\s*/i, '').trim() || null;
// //     }
// //   }

// //   const haystack = stripTags(infoSection || '') + ' ' + stripTags(html);
// //   const sold =
// //     haystack.match(/sold\s+as\s+(\d+)\s*(?:per|\/)\s*([a-z]+)/i) ||
// //     haystack.match(/(\d+)\s*(?:per|\/)\s*(box|case|pack|bag|roll|carton|bundle)/i) ||
// //     haystack.match(/(?:pack|case)\s+of\s+(\d+)\s*([a-z]+)?/i);
// //   if (sold) {
// //     const qty = parseInt(sold[1], 10);
// //     if (!Number.isNaN(qty)) result.caseQty = qty;
// //     if (sold[2]) result.uom = normalizeUom(sold[2]);
// //   }
// //   if (result.uom == null) {
// //     const uomMatch = haystack.match(/\bper\s+(box|case|pack|piece|bag|roll|each)\b/i);
// //     if (uomMatch) result.uom = normalizeUom(uomMatch[1]);
// //   }

// //   const usesSection = findSection('product use cases', 'use cases', 'applications', 'uses');
// //   if (usesSection) {
// //     const anchors = getAnchors(usesSection).map(a => a.text).filter(Boolean);
// //     const list = getListItems(usesSection).map(stripTags).filter(Boolean);
// //     const combined = anchors.length ? anchors : list;
// //     if (combined.length) result.uses = combined.join('; ');
// //     else {
// //       const txt = stripTags(usesSection);
// //       if (txt) result.uses = txt;
// //     }
// //   }

// //   for (const a of getAnchors(html)) {
// //     const t = (a.text || '').toLowerCase();
// //     const href = a.href.toLowerCase();
// //     if (result.manufacturerUrl == null && (/manufacturer/.test(t) || /\bmfr\b/.test(t))) {
// //       result.manufacturerUrl = a.href;
// //     }
// //     if (result.submittalUrl == null && (/submittal|spec\s*sheet|specification/.test(t) || /submittal/.test(href))) {
// //       result.submittalUrl = a.href;
// //     }
// //   }

// //   return result;
// // }
// export interface ParsedBody {
//   description: string | null;
//   descriptionHtml: string | null;
//   dimensions: string | null;
//   caseQty: number | null;
//   uom: string | null;
//   uses: string | null;
//   manufacturerUrl: string | null;
//   submittalUrl: string | null;
// }

// function decodeEntities(s: string): string {
//   if (!s) return s;
//   return s
//     // Common UTF-8-read-as-CP1252 mojibake (smart quotes / dashes) first.
//     .replace(/\u00e2\u20ac\u009d/g, '\u201d') // ”
//     .replace(/\u00e2\u20ac\u009c/g, '\u201c') // “
//     .replace(/\u00e2\u20ac\u2122/g, '\u2019') // ’
//     .replace(/\u00e2\u20ac"/g, '\u2013')      // –
//     .replace(/\u00e2\u20ac/g, '"')            // catch-all remnant
//     // Named/numeric entities. Decode &amp; LAST so we don't double-decode
//     // sequences like "&amp;lt;" into "<".
//     .replace(/&nbsp;/gi, ' ')
//     .replace(/&quot;/gi, '"')
//     .replace(/&#39;|&apos;/gi, "'")
//     .replace(/&lt;/gi, '<')
//     .replace(/&gt;/gi, '>')
//     .replace(/&amp;/gi, '&');
// }

// export function stripTags(html: string): string {
//   if (!html) return '';
//   return decodeEntities(
//     html
//       .replace(/<\s*br\s*\/?\s*>/gi, ' ')
//       .replace(/<\/(p|li|ul|ol|h\d|div|tr|td|th)\s*>/gi, ' ')
//       .replace(/<[^>]+>/g, '')
//   )
//     .replace(/\s+/g, ' ')
//     .trim();
// }

// function splitSections(html: string): Record<string, string> {
//   const sections: Record<string, string> = {};
//   // [\s\S] inside the heading capture so headings spanning newlines still match.
//   const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|$)/gi;
//   let m: RegExpExecArray | null;
//   while ((m = re.exec(html)) !== null) {
//     const key = stripTags(m[1]).toLowerCase().trim();
//     if (key) sections[key] = m[2] || '';
//   }
//   return sections;
// }

// function getAnchors(html: string): { href: string; text: string }[] {
//   const anchors: { href: string; text: string }[] = [];
//   const re = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
//   let m: RegExpExecArray | null;
//   while ((m = re.exec(html)) !== null) {
//     anchors.push({ href: m[1].trim(), text: stripTags(m[2]) });
//   }
//   return anchors;
// }

// function getListItems(html: string): string[] {
//   const items: string[] = [];
//   const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
//   let m: RegExpExecArray | null;
//   while ((m = re.exec(html)) !== null) items.push(m[1]);
//   return items;
// }

// const UOM_NORMALIZE: Record<string, string> = {
//   box: 'Box', boxes: 'Box', bx: 'Box',
//   piece: 'Each', pieces: 'Each', pc: 'Each', pcs: 'Each', ea: 'Each', each: 'Each',
//   pack: 'Pack', packs: 'Pack', pk: 'Pack',
//   case: 'Case', cases: 'Case', cs: 'Case',
//   roll: 'Roll', rolls: 'Roll',
//   bag: 'Bag', bags: 'Bag',
//   carton: 'Carton', bundle: 'Bundle', pair: 'Pair', set: 'Set', kit: 'Kit',
// };
// const normalizeUom = (noun: string): string =>
//   UOM_NORMALIZE[noun.toLowerCase()] ?? (noun.charAt(0).toUpperCase() + noun.slice(1).toLowerCase());

// export function parseBodyHtml(rawHtml: string | null | undefined): ParsedBody {
//   const result: ParsedBody = {
//     description: null, descriptionHtml: null, dimensions: null, caseQty: null,
//     uom: null, uses: null, manufacturerUrl: null, submittalUrl: null,
//   };
//   if (!rawHtml || typeof rawHtml !== 'string') return result;

//   const html = rawHtml;
//   const sections = splitSections(html);

//   // Match a section heading by keyword, but prefer the MOST specific heading
//   // so "description" does not accidentally grab "category description".
//   const findSection = (...names: string[]): string => {
//     for (const n of names) {
//       const exact = sections[n];
//       if (exact != null) return exact;
//     }
//     for (const n of names) {
//       const key = Object.keys(sections).find(k => k.includes(n));
//       if (key) return sections[key];
//     }
//     return '';
//   };

//   const descSection = findSection('product description', 'description');
//   if (descSection) {
//     result.description = stripTags(descSection) || null;
//     // Keep the section's own rich HTML (the content after the <h2>, before the
//     // next <h2>) so the description doesn't swallow Information / Use Cases.
//     result.descriptionHtml = descSection.trim() || null;
//   } else {
//     const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
//     if (p) {
//       result.description = stripTags(p[1]) || null;
//       result.descriptionHtml = p[0].trim() || null; // keep the whole <p>…</p>
//     }
//   }

//   const infoSection = findSection('product information', 'specifications', 'details');
//   const infoItems = getListItems(infoSection || html).map(stripTags);
//   for (const item of infoItems) {
//     if (result.dimensions == null && /dimension|^\s*size\b/i.test(item)) {
//       result.dimensions = item.replace(/^\s*(dimensions?|size)\s*[:\-]?\s*/i, '').trim() || null;
//     }
//   }

//   const haystack = stripTags(infoSection || '') + ' ' + stripTags(html);
//   const sold =
//     haystack.match(/sold\s+as\s+(\d+)\s*(?:per|\/)\s*([a-z]+)/i) ||
//     haystack.match(/(\d+)\s*(?:per|\/)\s*(box|case|pack|bag|roll|carton|bundle)/i) ||
//     haystack.match(/(?:pack|case)\s+of\s+(\d+)\s*([a-z]+)?/i);
//   if (sold) {
//     const qty = parseInt(sold[1], 10);
//     if (!Number.isNaN(qty)) result.caseQty = qty;
//     if (sold[2]) result.uom = normalizeUom(sold[2]);
//   }
//   if (result.uom == null) {
//     const uomMatch = haystack.match(/\bper\s+(box|case|pack|piece|bag|roll|each)\b/i);
//     if (uomMatch) result.uom = normalizeUom(uomMatch[1]);
//   }

//   const usesSection = findSection('product use cases', 'use cases', 'applications', 'uses');
//   if (usesSection) {
//     const anchors = getAnchors(usesSection).map(a => a.text).filter(Boolean);
//     const list = getListItems(usesSection).map(stripTags).filter(Boolean);
//     const combined = anchors.length ? anchors : list;
//     if (combined.length) result.uses = combined.join('; ');
//     else {
//       const txt = stripTags(usesSection);
//       if (txt) result.uses = txt;
//     }
//   }

//   for (const a of getAnchors(html)) {
//     const t = (a.text || '').toLowerCase();
//     const href = a.href.toLowerCase();
//     if (result.manufacturerUrl == null && (/manufacturer/.test(t) || /\bmfr\b/.test(t))) {
//       result.manufacturerUrl = a.href;
//     }
//     if (result.submittalUrl == null && (/submittal|spec\s*sheet|specification/.test(t) || /submittal/.test(href))) {
//       result.submittalUrl = a.href;
//     }
//   }

//   return result;
// }
export interface ParsedBody {
  description: string | null;
  descriptionHtml: string | null;
  dimensions: string | null;
  caseQty: number | null;
  uom: string | null;
  uses: string | null;
  manufacturerUrl: string | null;
  submittalUrl: string | null;
}

function decodeEntities(s: string): string {
  if (!s) return s;
  return s
    // Common UTF-8-read-as-CP1252 mojibake (smart quotes / dashes) first.
    .replace(/\u00e2\u20ac\u009d/g, '\u201d') // ”
    .replace(/\u00e2\u20ac\u009c/g, '\u201c') // “
    .replace(/\u00e2\u20ac\u2122/g, '\u2019') // ’
    .replace(/\u00e2\u20ac"/g, '\u2013')      // –
    .replace(/\u00e2\u20ac/g, '"')            // catch-all remnant
    // Named/numeric entities. Decode &amp; LAST so we don't double-decode
    // sequences like "&amp;lt;" into "<".
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

export function stripTags(html: string): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<\s*br\s*\/?\s*>/gi, ' ')
      .replace(/<\/(p|li|ul|ol|h\d|div|tr|td|th)\s*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSections(html: string): Record<string, string> {
  const sections: Record<string, string> = {};
  // [\s\S] inside the heading capture so headings spanning newlines still match.
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = stripTags(m[1]).toLowerCase().trim();
    if (key) sections[key] = m[2] || '';
  }
  return sections;
}

function getAnchors(html: string): { href: string; text: string }[] {
  const anchors: { href: string; text: string }[] = [];
  const re = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    anchors.push({ href: m[1].trim(), text: stripTags(m[2]) });
  }
  return anchors;
}

function getListItems(html: string): string[] {
  const items: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) items.push(m[1]);
  return items;
}

const UOM_NORMALIZE: Record<string, string> = {
  box: 'Box', boxes: 'Box', bx: 'Box',
  piece: 'Each', pieces: 'Each', pc: 'Each', pcs: 'Each', ea: 'Each', each: 'Each',
  pack: 'Pack', packs: 'Pack', pk: 'Pack',
  case: 'Case', cases: 'Case', cs: 'Case',
  roll: 'Roll', rolls: 'Roll',
  bag: 'Bag', bags: 'Bag',
  carton: 'Carton', bundle: 'Bundle', pair: 'Pair', set: 'Set', kit: 'Kit',
};
const normalizeUom = (noun: string): string =>
  UOM_NORMALIZE[noun.toLowerCase()] ?? (noun.charAt(0).toUpperCase() + noun.slice(1).toLowerCase());

export function parseBodyHtml(rawHtml: string | null | undefined): ParsedBody {
  const result: ParsedBody = {
    description: null, descriptionHtml: null, dimensions: null, caseQty: null,
    uom: null, uses: null, manufacturerUrl: null, submittalUrl: null,
  };
  if (!rawHtml || typeof rawHtml !== 'string') return result;

  const html = rawHtml;
  const sections = splitSections(html);

  // Match a section heading by keyword, but prefer the MOST specific heading
  // so "description" does not accidentally grab "category description".
  const findSection = (...names: string[]): string => {
    for (const n of names) {
      const exact = sections[n];
      if (exact != null) return exact;
    }
    for (const n of names) {
      const key = Object.keys(sections).find(k => k.includes(n));
      if (key) return sections[key];
    }
    return '';
  };

  const descSection = findSection('product description', 'description');
  if (descSection) {
    result.description = stripTags(descSection) || null;
    // Keep the section's own rich HTML (the content after the <h2>, before the
    // next <h2>) so the description doesn't swallow Information / Use Cases.
    result.descriptionHtml = descSection.trim() || null;
  } else {
    const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (p) {
      result.description = stripTags(p[1]) || null;
      result.descriptionHtml = p[0].trim() || null; // keep the whole <p>…</p>
    }
  }

  const infoSection = findSection('product information', 'specifications', 'details');
  const infoItems = getListItems(infoSection || html).map(stripTags);
  for (const item of infoItems) {
    if (result.dimensions == null && /dimension|^\s*size\b/i.test(item)) {
      result.dimensions = item.replace(/^\s*(dimensions?|size)\s*[:\-]?\s*/i, '').trim() || null;
    }
  }

  const haystack = stripTags(infoSection || '') + ' ' + stripTags(html);
  const sold =
    haystack.match(/sold\s+as\s+(\d+)\s*(?:per|\/)\s*([a-z]+)/i) ||
    haystack.match(/(\d+)\s*(?:per|\/)\s*(box|case|pack|bag|roll|carton|bundle)/i) ||
    haystack.match(/(?:pack|case)\s+of\s+(\d+)\s*([a-z]+)?/i);
  if (sold) {
    const qty = parseInt(sold[1], 10);
    if (!Number.isNaN(qty)) result.caseQty = qty;
    if (sold[2]) result.uom = normalizeUom(sold[2]);
  }
  if (result.uom == null) {
    const uomMatch = haystack.match(/\bper\s+(box|case|pack|piece|bag|roll|each)\b/i);
    if (uomMatch) result.uom = normalizeUom(uomMatch[1]);
  }

  const usesSection = findSection('product use cases', 'use cases', 'applications', 'uses');
  if (usesSection) {
    const anchors = getAnchors(usesSection).map(a => a.text).filter(Boolean);
    const list = getListItems(usesSection).map(stripTags).filter(Boolean);
    const combined = anchors.length ? anchors : list;
    if (combined.length) result.uses = combined.join('; ');
    else {
      const txt = stripTags(usesSection);
      if (txt) result.uses = txt;
    }
  }

  for (const a of getAnchors(html)) {
    const t = (a.text || '').toLowerCase();
    const href = a.href.toLowerCase();

    // A "manufacturer" link is classified as manufacturer and nothing else,
    // even if its URL carries a "#submittals" fragment — otherwise the fragment
    // would falsely claim the submittal slot before the real PDF is reached.
    if (/manufacturer/.test(t) || /\bmfr\b/.test(t)) {
      if (result.manufacturerUrl == null) result.manufacturerUrl = a.href;
      continue;
    }

    // Submittal: trust the link TEXT first; only fall back to the href when it
    // points at an actual document (submittalpro / a .pdf), not any URL that
    // merely contains the word "submittal".
    const submittalByText = /submittal|spec\s*sheet|specification/.test(t);
    const submittalByHref = /submittalpro|\.pdf(?:[?#]|$)/.test(href);
    if (result.submittalUrl == null && (submittalByText || submittalByHref)) {
      result.submittalUrl = a.href;
    }
  }

  return result;
}