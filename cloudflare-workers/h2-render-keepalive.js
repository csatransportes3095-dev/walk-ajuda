addEventListener("scheduled", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("https://walk-ajuda.onrender.com/api/ping", {
        headers: {
          "User-Agent": "h2-render-keepalive/1.0",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`Ping Render falhou: HTTP ${response.status}`);
      }

      if (response.body) {
        await response.body.cancel();
      }
    })(),
  );
});

addEventListener("fetch", (event) => {
  event.respondWith(new Response(null, { status: 204 }));
});
