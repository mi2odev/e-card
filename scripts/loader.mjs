/**
 * Node ESM hooks for `npm run selftest`.
 *
 * Two jobs:
 *   1. Resolve extensionless TypeScript imports the way Metro does.
 *   2. Propagate a `?device=` query down through relative imports, so the test
 *      can load two completely independent copies of the app's module graph in
 *      one process and have them talk to each other over a real socket.
 */

const isRelative = (spec) => spec.startsWith('.') || spec.startsWith('/');

export async function resolve(spec, ctx, next) {
  let device = '';
  if (ctx.parentURL) {
    const q = ctx.parentURL.indexOf('?device=');
    if (q >= 0) device = ctx.parentURL.slice(q + '?device='.length).split('&')[0];
  }

  const suffix = device && isRelative(spec) ? `?device=${device}` : '';
  const attempts = suffix
    ? [spec + suffix, spec + '.ts' + suffix, spec + '/index.ts' + suffix, spec + '.tsx' + suffix]
    : [spec, spec + '.ts', spec + '/index.ts', spec + '.tsx'];

  let firstError;
  for (const attempt of attempts) {
    try {
      return await next(attempt, ctx);
    } catch (e) {
      firstError ??= e;
    }
  }
  throw firstError;
}
