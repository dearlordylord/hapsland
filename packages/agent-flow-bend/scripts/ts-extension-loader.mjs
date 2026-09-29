export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith(".ts") && /^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
