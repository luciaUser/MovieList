importScripts('similarity.config.js', 'similarity.js', 'layout.js');

let active = 0;

self.onmessage = async (event) => {
  const data = event.data || {};
  const id = data.id;
  active = id;
  try {
    const result = await self.Layout.relayout(data.films || [], data.positions || {}, {
      shouldStop() { return active !== id; },
    });
    if (active !== id) return;
    if (!result) {
      self.postMessage({ id, cancelled: true });
      return;
    }
    self.postMessage({ id, nodes: result.nodes });
  } catch (error) {
    if (active !== id) return;
    self.postMessage({ id, error: error && error.message ? error.message : 'Layout fehlgeschlagen' });
  }
};
