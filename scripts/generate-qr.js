import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

const address = process.argv[2];
if (!address) {
  console.error('Usage: npm run qr -- https://your-public-game-url.example');
  process.exitCode = 1;
} else {
  try {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('The address must use HTTP or HTTPS.');
    }

    const outputDirectory = resolve('dist');
    await mkdir(outputDirectory, { recursive: true });
    const svg = await QRCode.toString(url.href, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 512,
      color: {
        dark: '#15454b',
        light: '#ffffff',
      },
    });
    const outputPath = resolve(outputDirectory, 'qr.svg');
    await writeFile(outputPath, svg);
    console.log(`QR code created: ${outputPath}`);
  } catch (error) {
    console.error(`Unable to generate QR code: ${error.message}`);
    process.exitCode = 1;
  }
}
