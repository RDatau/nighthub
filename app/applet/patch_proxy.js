const fs = require('fs');
let code = fs.readFileSync('electron/main.cjs', 'utf8');

const idx = code.indexOf("'User-Agent': snifferIsMobile ? mobileUA : desktopUA");
if (idx === -1) {
  console.error('Could not find User-Agent line');
  process.exit(1);
}

const startHeaders = code.lastIndexOf('const headers = {', idx);
const endHeaders = code.indexOf('};', idx) + 2;

console.log('Found headers block at', startHeaders, 'to', endHeaders);

const replacement = `const headers = {
        'User-Agent': snifferIsMobile ? mobileUA : desktopUA,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'identity',
        ...(spoofedReferer && { 'Referer': spoofedReferer }),
        ...(cookiesStr && { 'Cookie': cookiesStr })
      };`;

code = code.substring(0, startHeaders) + replacement + code.substring(endHeaders);

const reqRangeTarget = `// Forward range request from the browser to the target server.
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }`;

const reqRangeReplacement = `// Forward range request from the browser to the target server.
      let startPos = 0;
      let endPos = null;
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
        const parts = req.headers.range.replace(/bytes=/, "").split("-");
        startPos = parseInt(parts[0], 10) || 0;
        if (parts[1]) {
          endPos = parseInt(parts[1], 10);
        }
      }`;

if (!code.includes(reqRangeTarget)) {
  console.error('reqRangeTarget not found!');
  process.exit(1);
}

code = code.replace(reqRangeTarget, reqRangeReplacement);

fs.writeFileSync('electron/main.cjs', code, 'utf8');
console.log('Successfully patched headers & range in electron/main.cjs');
