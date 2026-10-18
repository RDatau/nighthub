import fs from 'fs';

const files = [
  'src/components/LoadCollectionModal.tsx',
  'src/components/SubtitleSettingsModal.tsx',
  'src/components/MarkerListModal.tsx',
  'src/components/EmptyState.tsx',
  'src/components/WebSnifferModal.tsx'
];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let content = fs.readFileSync(f, 'utf8');
  
  content = content.replace(/hover:border-amber-500\/30 dark:border-amber-500\/30/g, 'hover:border-orange-500/30 dark:hover:border-amber-500/30 dark:border-amber-500/30');
  content = content.replace(/hover:border-amber-500\/50 dark:border-amber-500\/50/g, 'hover:border-orange-500/50 dark:hover:border-amber-500/50 dark:border-amber-500/50');
  
  fs.writeFileSync(f, content);
});
console.log('Done');
