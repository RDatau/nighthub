import fs from 'fs';
import path from 'path';

function walk(dir: string) {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;

  newContent = newContent.replace(/dark:hover:bg-amber-500\/10 dark:bg-amber-500\/10/g, 'dark:hover:bg-amber-500/10');
  newContent = newContent.replace(/dark:hover:text-amber-500 dark:text-amber-500/g, 'dark:hover:text-amber-500');
  newContent = newContent.replace(/dark:hover:bg-amber-500\/20 dark:bg-amber-500\/20/g, 'dark:hover:bg-amber-500/20');
  newContent = newContent.replace(/dark:hover:bg-amber-500\/30 dark:bg-amber-500\/30/g, 'dark:hover:bg-amber-500/30');
  newContent = newContent.replace(/dark:hover:shadow-\[rgba\(245,158,11,\)\] dark:shadow-\[rgba\(245,158,11,\)\]/g, 'dark:hover:shadow-[rgba(245,158,11,)]');
  newContent = newContent.replace(/dark:group-hover\/volume:text-orange-600 dark:group-hover\/volume:text-orange-600 dark:text-amber-500/g, 'dark:group-hover/volume:text-amber-500');

  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    console.log(`Fixed ${file}`);
  }
}
