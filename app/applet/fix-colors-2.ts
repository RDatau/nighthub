import fs from 'fs';

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
  
  // Fix hover:bg-amber-500/20 without dark:hover
  content = content.replace(/hover:bg-amber-500\/20(?!\s+dark:hover:bg-amber-500\/20)/g, 'hover:bg-orange-500/20 dark:hover:bg-amber-500/20');
  
  // Fix hover:text-amber-600 without dark:hover
  content = content.replace(/hover:text-amber-600(?!\s+dark:hover:text-amber-500)/g, 'hover:text-orange-600 dark:hover:text-amber-500');
  
  // Fix group-hover:text-amber-400
  content = content.replace(/group-hover:text-amber-400/g, 'group-hover:text-orange-400 dark:group-hover:text-amber-400');
  
  // Fix hover:shadow-[rgba(245,158,11,)]
  content = content.replace(/hover:shadow-\[rgba\(245,158,11,\)\]/g, 'hover:shadow-[rgba(249,115,22,)] dark:hover:shadow-[rgba(245,158,11,)]');
  
  fs.writeFileSync(f, content);
});
console.log('Done');
