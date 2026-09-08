const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 512x512 SVG with Kharcha indigo squircle and crisp white Lucide Wallet
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="kharcha-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366F1" />
      <stop offset="100%" stop-color="#4338CA" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#kharcha-brand-grad)" />
  <g transform="translate(116, 116) scale(11.6667)" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </g>
</svg>`;

async function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  const appDir = path.join(__dirname, '..', 'app');
  const svgBuffer = Buffer.from(svgContent, 'utf8');

  // 1. Write public/icon.svg
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');
  console.log('✅ Wrote public/icon.svg');

  // 2. Write app/icon.svg (Next.js App Router native icon)
  fs.writeFileSync(path.join(appDir, 'icon.svg'), svgContent, 'utf8');
  console.log('✅ Wrote app/icon.svg');

  // 3. Write 32x32 PNGs
  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-light-32x32.png'), png32);
  fs.writeFileSync(path.join(publicDir, 'icon-dark-32x32.png'), png32);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), png32);
  fs.writeFileSync(path.join(appDir, 'favicon.ico'), png32);
  console.log('✅ Wrote 32x32 icon-light, icon-dark, and favicon.ico in public/ and app/');

  // 4. Write 180x180 apple-icon.png
  const png180 = await sharp(svgBuffer).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'apple-icon.png'), png180);
  fs.writeFileSync(path.join(appDir, 'apple-icon.png'), png180);
  console.log('✅ Wrote 180x180 apple-icon.png in public/ and app/');

  // 5. Write 512x512 icon-512.png for PWA / general usage
  const png512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), png512);
  console.log('✅ Wrote 512x512 icon-512.png in public/');

  console.log('🎉 All Kharcha icons generated successfully!');
}

main().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
