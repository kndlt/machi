const sharp = require('sharp');

const matterPath = 'public/worlds/world1/maps/map1/matter.png';
const branch2Path = 'public/worlds/world1/maps/map1/branch2.png';

const DIRT = { r: 103, g: 82, b: 75 };
const RESOURCE_ZERO_BYTE = 127;
const MEAN_SIGNED = 4;
const STD_SIGNED = 3;
const CHECKER_TILE_SIZE = 4;
const CHECKER_BIAS = 10;
const RNG_SEED = 1337;

function toByte(signed) {
  return Math.max(0, Math.min(255, RESOURCE_ZERO_BYTE + signed));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let z = t;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  const mag = Math.sqrt(-2.0 * Math.log(u1));
  return mag * Math.cos(2.0 * Math.PI * u2);
}

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
  let checkerPlusTiles = 0;
  let checkerMinusTiles = 0;
  let sumSigned = 0;
  let sumSqSigned = 0;
  let nonDirtPixels = 0;
  const rand = mulberry32(RNG_SEED);

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
        dirtPixels++;
        const tileX = Math.floor(x / CHECKER_TILE_SIZE);
        const tileY = Math.floor(y / CHECKER_TILE_SIZE);
        const checkerSign = ((tileX + tileY) & 1) === 0 ? 1 : -1;
        if (checkerSign > 0) checkerPlusTiles++;
        else checkerMinusTiles++;

        const signed = Math.round(MEAN_SIGNED + checkerSign * CHECKER_BIAS + gaussian(rand) * STD_SIGNED);
        const clamped = Math.max(-127, Math.min(127, signed));
        branchRaw.data[branchIndex + 1] = toByte(clamped);
        sumSigned += clamped;
        sumSqSigned += clamped * clamped;
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

  const mean = dirtPixels > 0 ? (sumSigned / dirtPixels) : 0;
  const variance = dirtPixels > 0 ? Math.max(0, (sumSqSigned / dirtPixels) - mean * mean) : 0;
  const std = Math.sqrt(variance);

  console.log('Updated branch2 nutrient G for diffusion testing (dirt-only large checkerboard + gaussian noise)');
  console.log(`target mean/std: ${MEAN_SIGNED}/${STD_SIGNED}`);
  console.log(`checker tile size: ${CHECKER_TILE_SIZE}, checker bias: ±${CHECKER_BIAS}, seed: ${RNG_SEED}`);
  console.log(`dirt pixels: ${dirtPixels} | checker+ pixels: ${checkerPlusTiles} | checker- pixels: ${checkerMinusTiles}`);
  console.log(`actual mean/std (signed dirt): ${mean.toFixed(3)}/${std.toFixed(3)}`);
  console.log(`non-dirt pixels reset to neutral: ${nonDirtPixels}`);
  console.log(`G min/max: ${min}/${max}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
