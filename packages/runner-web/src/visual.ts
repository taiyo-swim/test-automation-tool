import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "fs/promises";
import path from "path";

export interface VisualDiffResult {
  diffPath: string;
  diffPercentage: number;
}

export async function compareWithBaseline(
  screenshotBuffer: Buffer,
  baselineImagePath: string
): Promise<VisualDiffResult | null> {
  try {
    const baselineBuffer = await fs.readFile(baselineImagePath);
    const img1 = PNG.sync.read(baselineBuffer);
    const img2 = PNG.sync.read(screenshotBuffer);

    // Resize to same dimensions if needed
    const width = Math.min(img1.width, img2.width);
    const height = Math.min(img1.height, img2.height);

    const diff = new PNG({ width, height });
    const numPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
      threshold: 0.1,
      includeAA: false,
    });

    const totalPixels = width * height;
    const diffPercentage = (numPixels / totalPixels) * 100;

    // Save diff image
    const diffPath = baselineImagePath.replace(".png", "_diff.png");
    await fs.writeFile(diffPath, PNG.sync.write(diff));

    return { diffPath, diffPercentage };
  } catch (err) {
    console.error("Visual comparison failed:", err);
    return null;
  }
}
