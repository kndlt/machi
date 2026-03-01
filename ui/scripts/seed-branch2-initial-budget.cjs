const sharp = require('sharp');

const WORLD = process.argv[2] || 'world1';
const MAP = process.argv[3] || 'map1';

const ROOT_CREATION_COST = 2;
const BRANCH_CREATION_COST = 2;
const ROOT_ENERGY_GROWTH_COST = 0;
const BRANCH_ENERGY_GROWTH_COST = 1;
const RESOURCE_ZERO_BYTE = 127;

const branchPath = `public/worlds/${WORLD}/maps/${MAP}/branch.png`;
const branch2Path = `public/worlds/${WORLD}/maps/${MAP}/branch2.png`;

function clampByte(v) {
  return Math.max(0, Math.min(255, v | 0));
}

async function main() {
  const branchRaw = await sharp(branchPath).raw().toBuffer({ resolveWithObject: true });
  const branch2Raw = await sharp(branch2Path).raw().toBuffer({ resolveWithObject: true });

  if (
    branchRaw.info.width !== branch2Raw.info.width
    || branchRaw.info.height !== branch2Raw.info.height
  ) {
    throw new Error(
      `Size mismatch branch(${branchRaw.info.width}x${branchRaw.info.height}) vs branch2(${branch2Raw.info.width}x${branch2Raw.info.height})`,
    );
  }

  let occupiedCount = 0;
  let upgradedNutrient = 0;
  let upgradedEnergy = 0;
  let normalizedEnergyCells = 0;

  for (let y = 0; y < branchRaw.info.height; y++) {
    for (let x = 0; x < branchRaw.info.width; x++) {
      const i = (y * branchRaw.info.width + x) * branchRaw.info.channels;
      const occupied = (branchRaw.data[i + 3] ?? 0) > 127;

      const packedMeta = branch2Raw.data[i + 0] ?? 0;
      const typeNibble = packedMeta & 0x0f;
      const nutrientCost = typeNibble === 1 ? ROOT_CREATION_COST : BRANCH_CREATION_COST;
      const energyCost = typeNibble === 1 ? ROOT_ENERGY_GROWTH_COST : BRANCH_ENERGY_GROWTH_COST;

      const nutrientFloor = clampByte(RESOURCE_ZERO_BYTE + nutrientCost);
      const energyFloor = clampByte(RESOURCE_ZERO_BYTE + energyCost);

      const prevEnergy = branch2Raw.data[i + 2] ?? 0;
      const normalizedEnergy = Math.max(prevEnergy, RESOURCE_ZERO_BYTE);
      if (normalizedEnergy !== prevEnergy) normalizedEnergyCells++;
      branch2Raw.data[i + 2] = normalizedEnergy;

      if (!occupied) continue;
      occupiedCount++;

      const prevNutrient = branch2Raw.data[i + 1] ?? RESOURCE_ZERO_BYTE;
      const seededNutrient = Math.max(prevNutrient, nutrientFloor);
      if (seededNutrient !== prevNutrient) upgradedNutrient++;
      branch2Raw.data[i + 1] = seededNutrient;

      const prevSeedEnergy = branch2Raw.data[i + 2] ?? RESOURCE_ZERO_BYTE;
      const seededEnergy = Math.max(prevSeedEnergy, energyFloor);
      if (seededEnergy !== prevSeedEnergy) upgradedEnergy++;
      branch2Raw.data[i + 2] = seededEnergy;
    }
  }

  await sharp(branch2Raw.data, { raw: branch2Raw.info }).png().toFile(branch2Path);

  console.log(`Seeded branch2 budgets for ${WORLD}/${MAP}`);
  console.log(`occupied cells: ${occupiedCount}`);
  console.log(`occupied nutrient upgrades: ${upgradedNutrient}`);
  console.log(`occupied energy upgrades: ${upgradedEnergy}`);
  console.log(`non-negative energy normalizations: ${normalizedEnergyCells}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
