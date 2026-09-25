export function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await registration.update();
    } catch (error) {
      console.warn('PWA service worker registration failed:', error);
    }
  });
}
