#!/usr/bin/env node
/**
 * VibeCode Desktop — Icon Generation Pipeline
 *
 * Generates all required icon formats from a master SVG source.
 * Outputs: favicon, PNG variants, ICO, ICNS, tray assets, installer assets
 *
 * Usage:
 *   node scripts/generate-icons.js
 *   node scripts/generate-icons.js --source=./my-icon.svg
 *
 * Requires: sharp (npm install sharp)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const resourcesDir = path.join(projectRoot, 'resources');
const iconsDir = path.join(resourcesDir, 'icons');

// ── Ensure directories ─────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(iconsDir);

// ── VibeCode Master SVG ────────────────────────────────────────
// A minimal geometric logo: overlapping diamond shapes forming a "V"
const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#0a0a0f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#818cf8"/>
      <stop offset="100%" style="stop-color:#a78bfa"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <!-- Outer glow -->
  <path d="M256 120 L396 320 L356 320 L256 180 L156 320 L116 320 Z" fill="url(#glow)" opacity="0.3"/>
  <!-- Main V shape -->
  <path d="M256 140 L386 320 L346 320 L256 200 L166 320 L126 320 Z" fill="url(#accent)"/>
  <!-- Inner V accent -->
  <path d="M256 200 L326 320 L296 320 L256 260 L216 320 L186 320 Z" fill="url(#glow)" opacity="0.5"/>
  <!-- Center dot -->
  <circle cx="256" cy="340" r="16" fill="#6366f1"/>
  <circle cx="256" cy="340" r="8" fill="#818cf8"/>
</svg>`;

// ── Tray Icon SVG ──────────────────────────────────────────────
const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M12 2 L22 18 L18 18 L12 8 L6 18 L2 18 Z" fill="#6366f1"/>
  <path d="M12 8 L18 18 L14 18 L12 13 L10 18 L6 18 Z" fill="#818cf8" opacity="0.6"/>
  <circle cx="12" cy="20" r="1.5" fill="#6366f1"/>
</svg>`;

// ── Generate PNG variants ──────────────────────────────────────
async function generatePngs() {
  try {
    const sharp = require('sharp');

    // Save master SVG
    const svgPath = path.join(iconsDir, 'icon.svg');
    fs.writeFileSync(svgPath, masterSvg);

    // Save tray SVG
    const traySvgPath = path.join(resourcesDir, 'tray-icon.svg');
    fs.writeFileSync(traySvgPath, traySvg);

    // PNG sizes needed
    const sizes = [
      { name: 'icon-16x16.png', size: 16 },
      { name: 'icon-32x32.png', size: 32 },
      { name: 'icon-48x48.png', size: 48 },
      { name: 'icon-64x64.png', size: 64 },
      { name: 'icon-128x128.png', size: 128 },
      { name: 'icon-256x256.png', size: 256 },
      { name: 'icon-512x512.png', size: 512 },
      { name: 'icon.png', size: 512 },       // Linux main icon
      { name: 'favicon.png', size: 32 },     // Fallback favicon
    ];

    for (const { name, size } of sizes) {
      const outputPath = path.join(iconsDir, name);
      await sharp(Buffer.from(masterSvg))
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`  Generated: ${name} (${size}x${size})`);
    }

    // Tray icon variants
    const traySizes = [
      { name: 'tray-icon.png', size: 16 },
      { name: 'tray-icon@2x.png', size: 32 },
      { name: 'tray-iconTemplate.png', size: 16 }, // macOS template
      { name: 'tray-iconTemplate@2x.png', size: 32 },
    ];

    for (const { name, size } of traySizes) {
      const outputPath = path.join(resourcesDir, name);
      await sharp(Buffer.from(traySvg))
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`  Generated: ${name} (${size}x${size})`);
    }

    // Favicon
    const faviconPath = path.join(projectRoot, 'src', 'renderer', 'public', 'favicon.png');
    ensureDir(path.dirname(faviconPath));
    await sharp(Buffer.from(masterSvg))
      .resize(32, 32)
      .png()
      .toFile(faviconPath);
    console.log('  Generated: favicon.png');

    return true;
  } catch (error) {
    console.warn('  sharp not available, generating SVG-only icons');
    // Fallback: save SVG files only
    const svgPath = path.join(iconsDir, 'icon.svg');
    fs.writeFileSync(svgPath, masterSvg);
    const traySvgPath = path.join(resourcesDir, 'tray-icon.svg');
    fs.writeFileSync(traySvgPath, traySvg);
    return false;
  }
}

// ── Generate ICO (Windows) ─────────────────────────────────────
async function generateIco() {
  try {
    const sharp = require('sharp');

    // ICO needs 16, 32, 48, 256 sizes packed together
    // We'll generate each PNG and then create ICO using png-to-ico or manual packing
    const icoSizes = [16, 32, 48, 256];
    const pngBuffers = [];

    for (const size of icoSizes) {
      const buf = await sharp(Buffer.from(masterSvg))
        .resize(size, size)
        .png()
        .toBuffer();
      pngBuffers.push(buf);
    }

    // Simple ICO format: header + directory entries + image data
    const numImages = pngBuffers.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    const dirSize = dirEntrySize * numImages;
    let dataOffset = headerSize + dirSize;

    // Calculate total size
    let totalSize = headerSize + dirSize;
    for (const buf of pngBuffers) {
      totalSize += buf.length;
    }

    const ico = Buffer.alloc(totalSize);
    let offset = 0;

    // ICO Header
    ico.writeUInt16LE(0, offset); offset += 2;     // Reserved
    ico.writeUInt16LE(1, offset); offset += 2;     // Type: ICO
    ico.writeUInt16LE(numImages, offset); offset += 2; // Number of images

    // Directory entries
    let imageDataOffset = dataOffset;
    for (let i = 0; i < numImages; i++) {
      const size = icoSizes[i];
      const pngLen = pngBuffers[i].length;

      ico.writeUInt8(size >= 256 ? 0 : size, offset); offset += 1;  // Width
      ico.writeUInt8(size >= 256 ? 0 : size, offset); offset += 1;  // Height
      ico.writeUInt8(0, offset); offset += 1;     // Color palette
      ico.writeUInt8(0, offset); offset += 1;     // Reserved
      ico.writeUInt16LE(1, offset); offset += 2;  // Color planes
      ico.writeUInt16LE(32, offset); offset += 2; // Bits per pixel
      ico.writeUInt32LE(pngLen, offset); offset += 4;    // Image size
      ico.writeUInt32LE(imageDataOffset, offset); offset += 4; // Image offset

      imageDataOffset += pngLen;
    }

    // Image data
    for (const buf of pngBuffers) {
      buf.copy(ico, offset);
      offset += buf.length;
    }

    const icoPath = path.join(iconsDir, 'icon.ico');
    fs.writeFileSync(icoPath, ico);
    console.log(`  Generated: icon.ico (Windows)`);
    return true;
  } catch (error) {
    console.warn('  ICO generation failed (sharp not available)');
    return false;
  }
}

// ── Generate ICNS placeholder (macOS) ──────────────────────────
async function generateIcns() {
  // ICNS requires iconutil on macOS or a Node library
  // For now, create the iconset directory structure
  try {
    const sharp = require('sharp');
    const iconsetDir = path.join(iconsDir, 'icon.iconset');
    ensureDir(iconsetDir);

    const icnsSizes = [
      { name: 'icon_16x16.png', size: 16 },
      { name: 'icon_16x16@2x.png', size: 32 },
      { name: 'icon_32x32.png', size: 32 },
      { name: 'icon_32x32@2x.png', size: 64 },
      { name: 'icon_128x128.png', size: 128 },
      { name: 'icon_128x128@2x.png', size: 256 },
      { name: 'icon_256x256.png', size: 256 },
      { name: 'icon_256x256@2x.png', size: 512 },
      { name: 'icon_512x512.png', size: 512 },
      { name: 'icon_512x512@2x.png', size: 1024 },
    ];

    for (const { name, size } of icnsSizes) {
      const outputPath = path.join(iconsetDir, name);
      await sharp(Buffer.from(masterSvg))
        .resize(size, size)
        .png()
        .toFile(outputPath);
    }

    // Try to generate ICNS using iconutil (macOS only)
    if (process.platform === 'darwin') {
      try {
        execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(iconsDir, 'icon.icns')}"`, {
          stdio: 'ignore',
        });
        console.log('  Generated: icon.icns (macOS)');
      } catch {
        console.warn('  iconutil not available, ICNS not generated');
      }
    } else {
      console.log('  ICNS generation requires macOS (iconutil)');
      console.log('  icon.iconset directory created for CI generation');
    }

    return true;
  } catch (error) {
    console.warn('  ICNS generation failed');
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  VibeCode Desktop — Icon Generation Pipeline            ║
╚══════════════════════════════════════════════════════════╝
`);

  console.log('[Icons] Generating PNG variants...');
  await generatePngs();

  console.log('[Icons] Generating ICO (Windows)...');
  await generateIco();

  console.log('[Icons] Generating ICNS (macOS)...');
  await generateIcns();

  // Copy main icon to resources root for electron-builder
  try {
    const iconPng = path.join(iconsDir, 'icon.png');
    if (fs.existsSync(iconPng)) {
      fs.copyFileSync(iconPng, path.join(resourcesDir, 'icon.png'));
      console.log('  Copied: icon.png → resources/');
    }
  } catch {}

  console.log(`
[Icons] Generation complete!
[Icons] Icons saved to: ${iconsDir}
`);
}

main().catch(console.error);
