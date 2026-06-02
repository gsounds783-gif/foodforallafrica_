import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import * as cheerio from 'cheerio';

const outputDir = './'; // CHANGE THIS to your actual output folder

async function simplifyFilenames() {
  // 1. Find all HTML and JSON files
  const htmlFiles = await glob(`${outputDir}/**/*.html`, { absolute: true });
  const jsonFiles = await glob(`${outputDir}/**/*.json`, { absolute: true });
  console.log(`Found ${htmlFiles.length} HTML files, ${jsonFiles.length} JSON files`);

  const renameMap = new Map(); // oldPath -> newPath

  // 2. Compute new names by stripping the prefix "foodforallafrica_online_"
  const prefix = 'foodforallafrica_online_';

  for (const oldPath of [...htmlFiles, ...jsonFiles]) {
    const oldName = path.basename(oldPath);
    if (oldName.startsWith(prefix)) {
      const newName = oldName.slice(prefix.length); // remove prefix
      const newPath = path.join(path.dirname(oldPath), newName);
      renameMap.set(oldPath, newPath);
      console.log(`Will rename: ${oldName} → ${newName}`);
    } else {
      console.log(`Skipping (no prefix): ${oldName}`);
    }
  }

  if (renameMap.size === 0) {
    console.log('No files matched the prefix. Example filenames:');
    const samples = [...htmlFiles, ...jsonFiles].slice(0, 3).map(f => path.basename(f));
    console.log(samples);
    return;
  }

  // 3. Perform renames
  for (const [oldPath, newPath] of renameMap) {
    await fs.rename(oldPath, newPath);
    console.log(`✓ Renamed: ${path.basename(oldPath)} → ${path.basename(newPath)}`);
  }

  // 4. Update links inside HTML files (after rename)
  const updatedHtmlFiles = await glob(`${outputDir}/**/*.html`, { absolute: true });
  let updatedCount = 0;

  for (const filePath of updatedHtmlFiles) {
    let html = await fs.readFile(filePath, 'utf8');
    let changed = false;
    const $ = cheerio.load(html);

    // Replace any occurrence of the old prefixed filename with the new short name
    // We need to match the pattern "foodforallafrica_online_*.html" in href/src
    // and replace it with just the base name (keeping the .html extension).
    // Also handle cases where the link is absolute (starting with / or full URL)
    const oldPattern = /foodforallafrica_online_([^/\\?#]+\.html)/g;

    // Update href attributes
    $('a[href]').each((_, el) => {
      let href = $(el).attr('href');
      if (!href) return;
      const newHref = href.replace(oldPattern, '$1');
      if (newHref !== href) {
        $(el).attr('href', newHref);
        changed = true;
      }
    });

    // Update src attributes (images, scripts, etc.)
    $('[src]').each((_, el) => {
      let src = $(el).attr('src');
      if (!src) return;
      const newSrc = src.replace(oldPattern, '$1');
      if (newSrc !== src) {
        $(el).attr('src', newSrc);
        changed = true;
      }
    });

    // Also update any plain text that might contain the pattern (e.g., inline JavaScript)
    // This is safer but may be overkill. We'll do a simple string replace on the whole HTML.
    const htmlString = $.html();
    const newHtmlString = htmlString.replace(/foodforallafrica_online_([^/\\?#"]+\.html)/g, '$1');
    if (newHtmlString !== htmlString) {
      await fs.writeFile(filePath, newHtmlString);
      changed = true;
    } else if (changed) {
      await fs.writeFile(filePath, $.html());
    }

    if (changed) {
      updatedCount++;
      console.log(`✓ Updated links in: ${path.basename(filePath)}`);
    }
  }

  // 5. Update index files (index.html, batch-index.html)
  for (const idxName of ['index.html', 'batch-index.html']) {
    const idxPath = path.join(outputDir, idxName);
    if (await fs.pathExists(idxPath)) {
      let content = await fs.readFile(idxPath, 'utf8');
      const newContent = content.replace(/foodforallafrica_online_([^/\\?#"]+\.html)/g, '$1');
      if (newContent !== content) {
        await fs.writeFile(idxPath, newContent);
        console.log(`✓ Updated links in: ${idxName}`);
      }
    }
  }

  console.log(`✅ Done! Renamed ${renameMap.size} files, updated ${updatedCount} HTML files.`);
}

simplifyFilenames().catch(console.error);