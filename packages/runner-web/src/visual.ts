import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "fs/promises";
import path from "path";
import os from "os";

export interface VisualDiffResult {
  diffPath: string;
  diffPercentage: number;
}

export async function compareWithBaseline(
  screenshotBuffer: Buffer,
  baselinePathOrUrl: string
): Promise<VisualDiffResult | null> {
  try {
    let baselineBuffer: Buffer;

    if (baselinePathOrUrl.startsWith("http")) {
      // Download from URL (e.g. S3)
      const { default: axios } = await import("axios");
      const res = await axios.get<ArrayBuffer>(baselinePathOrUrl, { responseType: "arraybuffer" });
      baselineBuffer = Buffer.from(res.data);
    } else {
      baselineBuffer = await fs.readFile(baselinePathOrUrl);
    }

    const img1 = PNG.sync.read(baselineBuffer);
    const img2 = PNG.sync.read(screenshotBuffer);

    // Use the smaller dimensions for comparison
    const width = Math.min(img1.width, img2.width);
    const height = Math.min(img1.height, img2.height);

    // Crop to same size if needed
    const data1 =
      img1.width === width && img1.height === height
        ? img1.data
        : cropPngData(img1.data, img1.width, width, height);
    const data2 =
      img2.width === width && img2.height === height
        ? img2.data
        : cropPngData(img2.data, img2.width, width, height);

    const diff = new PNG({ width, height });

    const numDiffPixels = pixelmatch(data1, data2, diff.data, width, height, {
      threshold: 0.1,
      includeAA: false,
    });

    const totalPixels = width * height;
    const diffPercentage = (numDiffPixels / totalPixels) * 100;

    // Save diff image to a temp file (runner uploads it later)
    const diffPath = path.join(os.tmpdir(), `diff_${Date.now()}.png`);
    await fs.writeFile(diffPath, PNG.sync.write(diff));

    return { diffPath, diffPercentage };
  } catch (err) {
    console.error("[visual] Comparison failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function cropPngData(
  data: Buffer,
  originalWidth: number,
  targetWidth: number,
  targetHeight: number
): Buffer {
  const result = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcIdx = (y * originalWidth + x) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      result[dstIdx] = data[srcIdx]!;
      result[dstIdx + 1] = data[srcIdx + 1]!;
      result[dstIdx + 2] = data[srcIdx + 2]!;
      result[dstIdx + 3] = data[srcIdx + 3]!;
    }
  }
  return result;
}
