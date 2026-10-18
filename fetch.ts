async function run() {
  const res = await fetch('https://svgsilh.com/svg/1932518.svg', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const text = await res.text();
  console.log(text);
}
run();
