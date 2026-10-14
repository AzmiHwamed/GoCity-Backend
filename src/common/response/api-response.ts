import { HttpStatus, SetMetadata } from '@nestjs/common';

/**
 * The shape of every JSON response, success or error:
 * { status_code, response_title, response_body, response_error }
 */
export interface ApiEnvelope<T = unknown> {
  status_code: number;
  response_title: string;
  response_body: T | null;
  response_error: string | null;
}

export const RESPONSE_TITLE_KEY = 'responseTitle';

/** Sets `response_title` for a route's successful response, e.g. @ResponseTitle('Trip created'). */
export const ResponseTitle = (title: string) => SetMetadata(RESPONSE_TITLE_KEY, title);

const ACRONYMS = new Set(['OK', 'URI', 'HTTP']);

/** 200 → 'OK', 404 → 'Not Found', 422 → 'Unprocessable Entity'. */
export function statusPhrase(status: number): string {
  const name: string | undefined = HttpStatus[status];
  if (!name) return status >= 400 ? 'Error' : 'OK';
  return name
    .split('_')
    .map((w) => (ACRONYMS.has(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ');
}
