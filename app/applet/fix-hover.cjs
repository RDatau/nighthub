const fs = require('fs');

const file = 'src/components/BottomControls.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/dark:hover:bg-amber-500\/10 dark:bg-amber-500\/10/g, 'dark:hover:bg-amber-500/10');
content = content.replace(/dark:hover:text-amber-500 dark:text-amber-500/g, 'dark:hover:text-amber-500');

fs.writeFileSync(file, content);
console.log('Fixed BottomControls.tsx');
