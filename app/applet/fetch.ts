async function run() {
  const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://svgsilh.com/svg/1932518.svg'));
  const data = await res.json();
  console.log(data.contents);
}
run();
