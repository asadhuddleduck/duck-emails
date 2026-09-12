const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "•",
  gt: ">",
  hellip: "...",
  ldquo: '"',
  lsquo: "'",
  lt: "<",
  mdash: "-",
  middot: "·",
  nbsp: " ",
  ndash: "-",
  pound: "£",
  quot: '"',
  rarr: "->",
  rdquo: '"',
  rsquo: "'",
  zwnj: "",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) =>
      HTML_ENTITIES[name.toLowerCase()] ?? entity,
    );
}

function plainInline(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
      .replace(
        /<div\b[^>]*style=["'][^"']*(?:display:\s*none|max-height:\s*0)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
        "",
      )
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, "")
      .replace(
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_, href: string, label: string) =>
          `${plainInline(label)} (${decodeHtmlEntities(href)})`,
      )
      .replace(
        /<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi,
        (_, alt: string) => plainInline(alt),
      )
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<\/(?:div|h[1-6]|li|p|table|td|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
