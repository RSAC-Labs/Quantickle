let Readability;

const readabilityPromise = new Promise((resolve, reject) => {
  if (window.Readability) {
    resolve(window.Readability);
    return;
  }

  const script = document.createElement('script');
  script.src = '/node_modules/@mozilla/readability/Readability.js';
  script.onload = () => resolve(window.Readability);
  script.onerror = reject;
  document.head.appendChild(script);
});

Readability = await readabilityPromise;

export { Readability };
export default Readability;
