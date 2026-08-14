chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "UTH_DOWNLOAD") return undefined;

  (async () => {
    const filename = String(msg.filename || "uth-report.png").replace(/[^\w.\-@]+/g, "_");
    let objectUrl = "";
    try {
      if (!msg.url || typeof msg.url !== "string") {
        sendResponse({ ok: false, error: "missing url" });
        return;
      }
      const res = await fetch(msg.url);
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      chrome.downloads.download(
        {
          url: objectUrl,
          filename: filename,
          saveAs: false,
          conflictAction: "uniquify",
        },
        (id) => {
          setTimeout(() => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
          }, 60000);
          if (chrome.runtime.lastError || !id) {
            sendResponse({
              ok: false,
              error:
                (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
                "download failed",
            });
            return;
          }
          sendResponse({ ok: true, id: id });
        }
      );
    } catch (e) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      sendResponse({ ok: false, error: (e && e.message) || String(e) });
    }
  })();

  return true;
});
