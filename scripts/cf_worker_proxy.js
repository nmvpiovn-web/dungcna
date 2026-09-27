export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = new URL(request.url);
    targetUrl.hostname = "tienganh7-pro.pages.dev";
    targetUrl.protocol = "https:";

    const headers = new Headers(request.headers);
    headers.set("Host", "tienganh7-pro.pages.dev");
    headers.set("X-Forwarded-Host", url.host);
    headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
    headers.set("Cache-Control", "no-cache");
    headers.set("Pragma", "no-cache");

    // Fetch upstream Pages deployment with cache disabled
    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

    let response = await fetch(proxyRequest);

    // If upstream returns a 301/302 that redirects back to this exact same host/path (loop)
    // break the loop by resolving the path directly
    const location = response.headers.get("Location");
    if (location) {
      let resolvedLoc = location;
      if (resolvedLoc.includes("tienganh7-pro.pages.dev")) {
        resolvedLoc = resolvedLoc.replace("tienganh7-pro.pages.dev", url.host);
      }
      
      const locUrl = new URL(resolvedLoc, url.origin);
      // Check for self-redirect loop
      if (locUrl.href === url.href || (locUrl.pathname === url.pathname && locUrl.search === url.search)) {
        // Break loop: return a 200 by fetching the preview or resolving without redirect
        // Try fetching target with explicit bypass header
        const retryHeaders = new Headers(headers);
        retryHeaders.set("X-Forwarded-Host", url.host);
        const retryReq = new Request(targetUrl.toString(), {
          method: "GET",
          headers: retryHeaders,
          cf: { cacheTtl: 0, cacheEverything: false }
        });
        const retryRes = await fetch(retryReq);
        if (retryRes.status === 200) {
          response = retryRes;
        }
      }
    }

    const newHeaders = new Headers(response.headers);
    const finalLocation = newHeaders.get("Location");
    if (finalLocation && finalLocation.includes("tienganh7-pro.pages.dev")) {
      newHeaders.set("Location", finalLocation.replace("tienganh7-pro.pages.dev", url.host));
    }

    // Force no-cache on any redirect to prevent edge loops from being cached
    if (response.status >= 300 && response.status < 400) {
      newHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};
