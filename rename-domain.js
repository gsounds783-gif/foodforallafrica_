import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import * as cheerio from 'cheerio';

const outputDir = './'; // CHANGE THIS to your actual output folder

async function renameAndUpdateLinks() {
  // 1. Find all HTML and JSON files
  const htmlFiles = await glob(`${outputDir}/**/*.html`, { absolute: true });
  const jsonFiles = await glob(`${outputDir}/**/*.json`, { absolute: true });
  const allFiles = [...htmlFiles, ...jsonFiles];
  console.log(`Found ${htmlFiles.length} HTML files, ${jsonFiles.length} JSON files`);

  const renameMap = new Map(); // oldPath -> newPath

  // 2. Compute new names for both .html and .json
  for (const oldPath of allFiles) {
    const oldName = path.basename(oldPath);
    let newName = oldName;
    // Apply the same replacement pattern to both extensions
    if (oldName.includes('.com_')) {
      newName = oldName.replace(/\.com_/g, '_online_');
    } else if (oldName.includes('_com_')) {
      newName = oldName.replace(/_com_/g, '_online_');
    } else if (oldName.includes('.com.')) {
      newName = oldName.replace(/\.com\./g, '_online_');
    }

    if (newName !== oldName) {
      const newPath = path.join(path.dirname(oldPath), newName);
      renameMap.set(oldPath, newPath);
      console.log(`Will rename: ${oldName} → ${newName}`);
    }
  }

  if (renameMap.size === 0) {
    console.log('No files matched the pattern. Example filenames:');
    const samples = allFiles.slice(0, 3).map(f => path.basename(f));
    console.log(samples);
    return;
  }

  // 3. Perform renames (first HTML, then JSON)
  for (const [oldPath, newPath] of renameMap) {
    await fs.rename(oldPath, newPath);
    console.log(`✓ Renamed: ${path.basename(oldPath)} → ${path.basename(newPath)}`);
  }

  // 4. Update links inside HTML files (use the new filenames after rename)
  const updatedHtmlFiles = await glob(`${outputDir}/**/*.html`, { absolute: true });
  let updatedCount = 0;

  for (const filePath of updatedHtmlFiles) {
    let html = await fs.readFile(filePath, 'utf8');
    let changed = false;
    const $ = cheerio.load(html);

    // Update href attributes (remove .html if you want clean URLs, or just replace the pattern)
    $('a[href]').each((_, el) => {
      let href = $(el).attr('href');
      if (!href) return;
      let newHref = href;
      if (href.includes('.com_')) newHref = href.replace(/\.com_/g, '_online_');
      if (href.includes('_com_')) newHref = newHref.replace(/_com_/g, '_online_');
      if (newHref !== href) {
        $(el).attr('href', newHref);
        changed = true;
      }
    });

    // Update src attributes (assets might have the pattern)
    $('[src]').each((_, el) => {
      let src = $(el).attr('src');
      if (!src) return;
      let newSrc = src;
      if (src.includes('.com_')) newSrc = src.replace(/\.com_/g, '_online_');
      if (src.includes('_com_')) newSrc = newSrc.replace(/_com_/g, '_online_');
      if (newSrc !== src) {
        $(el).attr('src', newSrc);
        changed = true;
      }
    });

    if (changed) {
      await fs.writeFile(filePath, $.html());
      updatedCount++;
      console.log(`✓ Updated links in: ${path.basename(filePath)}`);
    }
  }

  // 5. Update index files (if they contain old links)
  for (const idxName of ['index.html', 'batch-index.html']) {
    const idxPath = path.join(outputDir, idxName);
    if (await fs.pathExists(idxPath)) {
      let content = await fs.readFile(idxPath, 'utf8');
      let newContent = content;
      if (content.includes('.com_')) newContent = content.replace(/\.com_/g, '_online_');
      if (content.includes('_com_')) newContent = newContent.replace(/_com_/g, '_online_');
      if (newContent !== content) {
        await fs.writeFile(idxPath, newContent);
        console.log(`✓ Updated links in: ${idxName}`);
      }
    }
  }

  console.log(`✅ Done! Renamed ${renameMap.size} files (HTML+JSON), updated ${updatedCount} HTML files.`);
}

renameAndUpdateLinks().catch(console.error);