import sharp from "sharp";
import path from "node:path";

const IN_PATH = path.resolve(process.cwd(), "public/worlds/world1/maps/map1/branch.png");

function packDirErr(dir01: number, err01: number): number {
  const dirQ = Math.max(0, Math.min(31, Math.round((((dir01 % 1) + 1) % 1) * 31)));
  const errQ = Math.max(0, Math.min(7, Math.round(Math.max(0, Math.min(0.999999, err01)) * 7)));
  return dirQ * 8 + errQ;
}

async function main() {
  const input = sharp(IN_PATH);
  const { data, info } = await input.raw().toBuffer({ resolveWithObject: true });

  if (info.channels < 4) {
    throw new Error(`Expected RGBA texture, got ${info.channels} channels`);
  }

  const out = Buffer.from(data);
  let branchPixels = 0;

  for (let i = 0; i < out.length; i += info.channels) {
    const a = out[i + 3];

    if (a > 127) {
      branchPixels++;
      const dir01 = out[i + 1] / 255;
      const err01 = out[i + 2] / 255;
      out[i + 1] = packDirErr(dir01, err01);
      out[i + 2] = 0;
    } else {
      out[i + 2] = 0;
    }
  }

  await sharp(out, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(IN_PATH);

  console.log(`Migrated ${IN_PATH}`);
  console.log(`Size: ${info.width}x${info.height}`);
  console.log(`Branch pixels converted: ${branchPixels}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
