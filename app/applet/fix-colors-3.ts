import fs from 'fs';

const files = [
  'src/components/WebSnifferModal.tsx',
  'src/components/SubtitleBrowserSidebar.tsx'
];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let content = fs.readFileSync(f, 'utf8');
  
  content = content.replace(/hover:bg-amber-500\/30 dark:bg-amber-500\/30/g, 'hover:bg-orange-500/30 dark:hover:bg-amber-500/30 dark:bg-amber-500/30');
  content = content.replace(/hover:text-amber-400/g, 'hover:text-orange-400 dark:hover:text-amber-400');
  
  fs.writeFileSync(f, content);
});
console.log('Done');
