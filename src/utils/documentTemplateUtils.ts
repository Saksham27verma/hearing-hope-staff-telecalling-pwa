export type ManagedDocumentType = 'invoice' | 'booking_receipt' | 'trial_receipt';

export type TemplateImage = {
  placeholder: string;
  url: string;
};

export const extractHtmlBody = (html: string) => {
  const styleBlocks = Array.from(html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi))
    .map((match) => match[0])
    .join('\n');
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const content = match?.[1] ?? html;
  return `${styleBlocks}${content}`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const replaceTemplateTokens = (
  html: string,
  replacements: Record<string, string>,
  images: TemplateImage[] = []
) => {
  let processed = extractHtmlBody(html);

  images.forEach((image) => {
    processed = processed.replace(new RegExp(escapeRegExp(image.placeholder), 'g'), image.url);
  });

  Object.entries(replacements).forEach(([key, value]) => {
    processed = processed.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g'), value ?? '');
  });

  return processed;
};
