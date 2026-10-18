const fs = require('fs');
const files = [
  'src/components/LoadCollectionModal.tsx',
  'src/components/BottomControls.tsx',
  'src/components/SubtitleSettingsModal.tsx',
  'src/components/AboutModal.tsx',
  'src/components/TopControls.tsx',
  'src/components/SaveCollectionModal.tsx',
  'src/components/MarkerListModal.tsx',
  'src/components/AudioSettingsModal.tsx',
  'src/components/EmptyState.tsx',
  'src/components/AddLoopModal.tsx',
  'src/components/PlaylistSidebar.tsx',
  'src/components/NetworkStreamModal.tsx',
  'src/components/WebSnifferModal.tsx',
  'src/components/ResumeOverlay.tsx',
  'src/components/SubtitleBrowserSidebar.tsx',
  'src/components/AddMarkerModal.tsx'
];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/hover:bg-amber-400 dark:hover:bg-amber-400/g, 'hover:bg-orange-400 dark:hover:bg-amber-400');
  content = content.replace(/hover:bg-amber-500\/10 dark:hover:bg-amber-500\/10/g, 'hover:bg-orange-500/10 dark:hover:bg-amber-500/10');
  content = content.replace(/hover:bg-amber-500\/20 dark:hover:bg-amber-500\/20/g, 'hover:bg-orange-500/20 dark:hover:bg-amber-500/20');
  content = content.replace(/hover:bg-amber-500\/30 dark:hover:bg-amber-500\/30/g, 'hover:bg-orange-500/30 dark:hover:bg-amber-500/30');
  content = content.replace(/hover:text-amber-600 dark:hover:text-amber-600/g, 'hover:text-orange-600 dark:hover:text-amber-500');
  content = content.replace(/hover:border-amber-500\/30 dark:hover:border-amber-500\/30/g, 'hover:border-orange-500/30 dark:hover:border-amber-500/30');
  
  // Also fix group-hover
  content = content.replace(/group-hover:bg-amber-500 dark:bg-amber-500/g, 'group-hover:bg-orange-500 dark:group-hover:bg-amber-500');
  
  fs.writeFileSync(f, content);
});
console.log('Done');
