// Lets Node's test runner import our extensionless TypeScript modules the way Vite does.
export async function resolve(specifier, context, nextResolve) {
  // Offline checkouts have no node_modules: fall back to a tiny stand-in for Svelte's stores.
  if (specifier === "svelte/store") {
    try {
      return await nextResolve(specifier, context);
    } catch {
      return nextResolve(new URL("./shims/svelte-store.ts", import.meta.url).href, context);
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      err?.code === "ERR_MODULE_NOT_FOUND" &&
      /^\.\.?\//.test(specifier) &&
      !/\.\w+$/.test(specifier)
    ) {
      return nextResolve(specifier + ".ts", context);
    }
    // "./platform" meaning "./platform/index.ts" (Vite allows it, Node does not)
    if (err?.code === "ERR_UNSUPPORTED_DIR_IMPORT" && /^\.\.?\//.test(specifier)) {
      return nextResolve(specifier.replace(/\/?$/, "/index.ts"), context);
    }
    throw err;
  }
}
