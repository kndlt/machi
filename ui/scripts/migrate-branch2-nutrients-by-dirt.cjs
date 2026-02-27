const sharp = require('sharp');

const matterPath = 'public/worlds/world1/maps/map1/matter.png';
const branch2Path = 'public/worlds/world1/maps/map1/branch2.png';

const DIRT = { r: 103, g: 82, b: 75 };
const RESOURCE_ZERO_BYTE = 127;
const DIRT_SIGNED_LEVEL = 5;
const DIRT_BYTE_LEVEL = RESOURCE_ZERO_BYTE + DIRT_SIGNED_LEVEL;

async function main() {
  const matterRaw = await sharp(matterPath).raw().toBuffer({ resolveWithObject: true });
  const branchRaw = await sharp(branch2Path).raw().toBuffer({ resolveWithObject: true });

  if (
    matterRaw.info.width !== branchRaw.info.width ||
    matterRaw.info.height !== branchRaw.info.height
  ) {
    throw new Error(
      `Size mismatch matter(${matterRaw.info.width}x${matterRaw.info.height}) vs branch2(${branchRaw.info.width}x${branchRaw.info.height})`
    );
  }

  let dirtPixels = 0;
  let nonDirtPixels = 0;

  for (let y = 0; y < matterRaw.info.height; y++) {
    for (let x = 0; x < matterRaw.info.width; x++) {
      const matterIndex = (y * matterRaw.info.width + x) * matterRaw.info.channels;
      const branchIndex = (y * branchRaw.info.width + x) * branchRaw.info.channels;

      const alpha = matterRaw.data[matterIndex + 3] ?? 255;
      const red = matterRaw.data[matterIndex + 0];
      const green = matterRaw.data[matterIndex + 1];
      const blue = matterRaw.data[matterIndex + 2];

      const isDirt = alpha > 127 && red === DIRT.r && green === DIRT.g && blue === DIRT.b;

      if (isDirt) {
        branchRaw.data[branchIndex + 1] = DIRT_BYTE_LEVEL;
        dirtPixels++;
      } else {
        branchRaw.data[branchIndex + 1] = RESOURCE_ZERO_BYTE;
        nonDirtPixels++;
      }
    }
  }

  await sharp(branchRaw.data, { raw: branchRaw.info }).png().toFile(branch2Path);

  let min = 255;
  let max = 0;
  for (let i = 0; i < branchRaw.data.length; i += branchRaw.info.channels) {
    const value = branchRaw.data[i + 1];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  console.log('Updated branch2 nutrient G by matter dirt mask');
  console.log(`dirt signed level: ${DIRT_SIGNED_LEVEL} (byte ${DIRT_BYTE_LEVEL})`);
  console.log(`dirt pixels: ${dirtPixels}`);
  console.log(`non-dirt pixels: ${nonDirtPixels}`);
  console.log(`G min/max: ${min}/${max}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
