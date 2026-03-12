import imageCompression from "browser-image-compression";
import Tesseract from "tesseract.js";

// ─── Persistent worker (created once, reused across all scans) ────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _worker: any = null;
let _workerReady = false;

async function getWorker() {
  if (_worker && _workerReady) return _worker;
  _worker = await Tesseract.createWorker("eng+ind", 1, { logger: () => {} });
  _workerReady = true;
  return _worker;
}

// ─── Image compression ────────────────────────────────────────────────────────
async function compressImage(file: File): Promise<File> {
  return imageCompression(file, {
    maxSizeMB: 0.6,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
  });
}

// ─── Canvas preprocessing: grayscale + contrast boost ────────────────────────
async function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const MAX_WIDTH = 1200;
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const CONTRAST = 1.5;
      for (let i = 0; i < d.length; i += 4) {
        const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        const adj = Math.min(255, Math.max(0, Math.round((gray - 128) * CONTRAST + 128)));
        d[i] = d[i + 1] = d[i + 2] = adj;
      }
      ctx.putImageData(imgData, 0, 0);

      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(URL.createObjectURL(blob));
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/png",
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

// ─── Main OCR entry point ─────────────────────────────────────────────────────
// Pipeline: compress → canvas preprocess → OCR (persistent worker).
export async function runOCR(file: File): Promise<string> {
  // Step 1: compress
  let processedFile = file;
  try {
    processedFile = await compressImage(file);
  } catch {
    processedFile = file;
  }

  // Step 2: canvas preprocess
  let src: string | File = processedFile;
  try {
    src = await preprocessImage(processedFile);
  } catch {
    // fall through to raw file
  }

  // Step 3: OCR via persistent worker
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(src as string);

    if (typeof src === "string" && src.startsWith("blob:")) {
      URL.revokeObjectURL(src);
    }

    return data.text;
  } catch {
    // Worker failed — reset and use one-shot fallback
    _worker = null;
    _workerReady = false;

    const { data: { text } } = await Tesseract.recognize(src as string, "eng+ind", {
      logger: () => {},
    });

    if (typeof src === "string" && src.startsWith("blob:")) {
      URL.revokeObjectURL(src);
    }

    return text;
  }
}
